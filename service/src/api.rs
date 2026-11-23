use crate::{
    auth::Guard,
    scanner::{ScanState, ScanStatus, now_millis, run_scan},
};
use axum::{
    Json, Router,
    body::Body,
    extract::{Path, State},
    http::{
        HeaderMap, HeaderValue, Method, Request, StatusCode, header,
    },
    middleware::{self, Next},
    response::{
        IntoResponse, Response,
        sse::{Event as SseEvent, KeepAlive, Sse},
    },
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};
use tokio::sync::broadcast;
use tokio_stream::{StreamExt, wrappers::BroadcastStream};
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
pub struct AppState {
    pub guard: Guard,
    pub origin: String,
    scans: Arc<std::sync::Mutex<HashMap<String, Arc<ScanState>>>>,
    next_id: Arc<AtomicU64>,
    shutdown: CancellationToken,
}

impl AppState {
    pub fn new(token: String, origin: String, port: u16) -> Self {
        Self {
            guard: Guard::new(token, origin.clone(), port),
            origin,
            scans: Arc::new(std::sync::Mutex::new(HashMap::new())),
            next_id: Arc::new(AtomicU64::new(1)),
            shutdown: CancellationToken::new(),
        }
    }

    fn get(&self, id: &str) -> Option<Arc<ScanState>> {
        self.scans
            .lock()
            .ok()
            .and_then(|scans| scans.get(id).cloned())
    }

    pub async fn shutdown(&self) {
        self.shutdown.cancel();
        let scans = self
            .scans
            .lock()
            .map(|scans| scans.values().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        for scan in scans {
            scan.cancel.cancel();
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ScanRequest {
    path: String,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/status", get(status))
        .route("/api/scan", post(start_scan))
        .route("/api/scan/{id}/cancel", post(cancel_scan))
        .route("/api/scan/{id}/snapshot", get(snapshot))
        .route("/api/scan/{id}/events", get(scan_events))
        .fallback(not_found)
        .with_state(state.clone())
        .layer(middleware::from_fn_with_state(state, auth_and_cors))
}

async fn auth_and_cors(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    // EventSource 无法设置 Authorization 头；GET 允许 ?access_token= 一次性回退
    // （仅在 loopback + Origin/Host 双校验通过后合成 Bearer 头）。
    let request = if request.method() == Method::GET
        && request.headers().get(header::AUTHORIZATION).is_none()
        && request
            .uri()
            .query()
            .and_then(|query| query.split('&').find(|pair| pair.starts_with("access_token=")))
            .and_then(|pair| pair.strip_prefix("access_token="))
            .map(|value| value == state.guard.token())
            .unwrap_or(false)
    {
        let (mut parts, body) = request.into_parts();
        parts.headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", state.guard.token()))
                .unwrap_or_else(|_| HeaderValue::from_static("Bearer ")),
        );
        Request::from_parts(parts, body)
    } else {
        request
    };
    match state.guard.check(request.method(), request.headers()) {
        Ok(()) if request.method() == Method::OPTIONS => {
            let mut response = StatusCode::NO_CONTENT.into_response();
            add_cors(response.headers_mut(), &state.origin);
            response.headers_mut().insert(
                header::ACCESS_CONTROL_ALLOW_METHODS,
                HeaderValue::from_static("GET, POST, OPTIONS"),
            );
            response.headers_mut().insert(
                header::ACCESS_CONTROL_ALLOW_HEADERS,
                HeaderValue::from_static("Authorization, Content-Type"),
            );
            response.headers_mut().insert(
                header::ACCESS_CONTROL_MAX_AGE,
                HeaderValue::from_static("600"),
            );
            response
        }
        Ok(()) => {
            let shutdown = state.shutdown.clone();
            let operation = tokio::spawn(async move {
                tokio::select! {
                    result = next.run(request) => result,
                    _ = shutdown.cancelled() => error(StatusCode::SERVICE_UNAVAILABLE, "service is shutting down"),
                }
            });
            let mut response = operation
                .await
                .unwrap_or_else(|_| error(StatusCode::INTERNAL_SERVER_ERROR, "request failed"));
            add_cors(response.headers_mut(), &state.origin);
            response
                .headers_mut()
                .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            response.headers_mut().insert(
                header::X_CONTENT_TYPE_OPTIONS,
                HeaderValue::from_static("nosniff"),
            );
            response
        }
        Err(status) => status.into_response(),
    }
}

fn add_cors(headers: &mut HeaderMap, origin: &str) {
    if let Ok(value) = HeaderValue::from_str(origin) {
        headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, value);
    }
    headers.insert(header::VARY, HeaderValue::from_static("Origin"));
    headers.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("Content-Length"),
    );
}

fn error(status: StatusCode, message: &'static str) -> Response {
    (status, Json(json!({"error": message}))).into_response()
}

async fn not_found() -> Response {
    error(StatusCode::NOT_FOUND, "not found")
}

async fn status() -> Response {
    Json(json!({"ok": true, "version": "0.1.0", "protocol": 1})).into_response()
}

async fn start_scan(State(state): State<AppState>, Json(request): Json<ScanRequest>) -> Response {
    let path = PathBuf::from(&request.path);
    if !path.is_absolute() || !path.is_dir() {
        return error(StatusCode::BAD_REQUEST, "invalid scan root");
    }
    let id = format!("scan-{}", state.next_id.fetch_add(1, Ordering::Relaxed));
    let started_at = now_millis();
    let scan = Arc::new(ScanState::new(
        id.clone(),
        path.to_string_lossy().into_owned(),
        started_at,
    ));
    if let Ok(mut scans) = state.scans.lock() {
        scans.insert(id.clone(), scan.clone());
    }
    // 立刻返回 scanId；真正的遍历在阻塞线程池里进行。
    drop(tokio::task::spawn_blocking(move || run_scan(scan, path)));
    Json(json!({"scanId": id})).into_response()
}

async fn cancel_scan(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(scan) = state.get(&id) else {
        return error(StatusCode::NOT_FOUND, "unknown scan");
    };
    scan.cancel.cancel();
    Json(json!({"ok": true})).into_response()
}

async fn snapshot(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(scan) = state.get(&id) else {
        return error(StatusCode::NOT_FOUND, "unknown scan");
    };
    let status: ScanStatus = *scan.status.lock().unwrap_or_else(|e| e.into_inner());
    let totals = *scan.totals.lock().unwrap_or_else(|e| e.into_inner());
    Json(json!({
        "scanId": id,
        "root": scan.root,
        "status": status,
        "totals": totals,
    }))
    .into_response()
}

async fn scan_events(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let Some(scan) = state.get(&id) else {
        return error(StatusCode::NOT_FOUND, "unknown scan");
    };
    let receiver: broadcast::Receiver<(String, String)> = scan.events.subscribe();
    let replay = scan.replay();
    let stream = tokio_stream::iter(replay.into_iter().map(Ok::<_, std::convert::Infallible>))
        .chain(
            BroadcastStream::new(receiver)
                .filter_map(|result| result.ok().map(Ok::<_, std::convert::Infallible>)),
        )
        .map(|Ok((name, payload))| {
            Ok::<_, std::convert::Infallible>(SseEvent::default().event(name).data(payload))
        });
    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::{AppState, router};
    use tower::ServiceExt;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };

    fn state() -> AppState {
        AppState::new("a".repeat(64), "http://127.0.0.1:6582".to_string(), 6582)
    }

    async fn call(app: axum::Router, path: &str, token: &str) -> (StatusCode, String) {
        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(path)
                    .header("host", "127.0.0.1:6582")
                    .header("origin", "http://127.0.0.1:6582")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let body = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap();
        (status, String::from_utf8_lossy(&body).into_owned())
    }

    #[tokio::test]
    async fn status_requires_valid_token_and_origin() {
        let token = "a".repeat(64);
        let app = router(state());
        let (ok, body) = call(app.clone(), "/api/status", &token).await;
        assert_eq!(ok, StatusCode::OK);
        assert!(body.contains("\"ok\":true"));

        let (unauthorized, _) = call(app.clone(), "/api/status", &"b".repeat(64)).await;
        assert_eq!(unauthorized, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn event_source_token_fallback_works_on_get() {
        let token = "a".repeat(64);
        let app = router(state());
        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/api/status?access_token={token}"))
                    .header("host", "127.0.0.1:6582")
                    .header("origin", "http://127.0.0.1:6582")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
}
