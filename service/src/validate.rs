use url::Url;

/// 初始化参数校验：token 是前端生成的 64 位小写十六进制；origin 必须是
/// otools-plugin://localhost 或带 host 的 http/https/tauri，且无 userinfo、
/// query、fragment、多余 path（与 concat sidecar 同一口径）。
pub fn validate_init(token: &str, origin: &str) -> bool {
    token.len() == 64
        && token
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        && valid_origin(origin)
}

fn valid_origin(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    if url.scheme() == "otools-plugin" {
        return value == "otools-plugin://localhost";
    }
    matches!(url.scheme(), "http" | "https" | "tauri")
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && (url.path().is_empty() || url.path() == "/")
        && url.query().is_none()
        && url.fragment().is_none()
        && (value == format!("{}://{}", url.scheme(), url.host_str().unwrap_or_default())
            || url.port().is_some_and(|port| {
                value
                    == format!(
                        "{}://{}:{port}",
                        url.scheme(),
                        url.host_str().unwrap_or_default()
                    )
            }))
}

#[cfg(test)]
mod tests {
    use super::validate_init;

    #[test]
    fn accepts_valid_init() {
        let token = "a".repeat(64);
        assert!(validate_init(&token, "http://127.0.0.1:6582"));
        assert!(validate_init(&token, "otools-plugin://localhost"));
        assert!(validate_init(&token, "tauri://localhost"));
    }

    #[test]
    fn rejects_bad_token_or_origin() {
        let token = "a".repeat(64);
        assert!(!validate_init(&"A".repeat(64), "http://127.0.0.1:6582"));
        assert!(!validate_init("short", "http://127.0.0.1:6582"));
        assert!(!validate_init(&token, "http://127.0.0.1:6582/path"));
        assert!(!validate_init(&token, "http://user@127.0.0.1:6582"));
        assert!(!validate_init(&token, "file:///tmp"));
        assert!(!validate_init(&token, "not-a-url"));
    }
}
