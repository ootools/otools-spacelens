use otools_spacelens_service::{
    api::{AppState, router},
    validate::validate_init,
};
use serde::Deserialize;
use serde_json::json;
use std::io::{BufRead, Read, Write};
use std::net::Ipv4Addr;
use tokio::net::TcpListener;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Init {
    r#type: String,
    token: String,
    origin: String,
}

#[tokio::main]
async fn main() {
    if let Err(message) = run().await {
        // 固定错误串：绝不回显 stdin / token / 扫描路径。
        eprintln!("{message}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), &'static str> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 1 || args[0] != "--stdio" {
        return Err("spacelens service requires --stdio");
    }
    let (init_rx, eof_rx) = stdin_events();
    let mut first_line = tokio::time::timeout(std::time::Duration::from_secs(15), init_rx)
        .await
        .map_err(|_| "initialization timed out")?
        .map_err(|_| "initialization failed")??;
    let init: Init = serde_json::from_slice(&first_line).map_err(|_| "invalid initialization")?;
    first_line.fill(0);
    if init.r#type != "init" || !validate_init(&init.token, &init.origin) {
        return Err("invalid initialization");
    }
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .await
        .map_err(|_| "loopback listener failed")?;
    let port = listener
        .local_addr()
        .map_err(|_| "loopback listener failed")?
        .port();

    let state = AppState::new(init.token, init.origin, port);
    let shutdown_state = state.clone();
    let (stop_tx, stop_rx) = tokio::sync::oneshot::channel();
    let watcher = tokio::spawn(async move {
        tokio::select! {
            _ = eof_rx => {}
            _ = termination_signal() => {}
        }
        shutdown_state.shutdown().await;
        let _ = stop_tx.send(());
    });

    let ready = json!({"event": "ready", "port": port, "protocol": 1});
    writeln!(std::io::stdout(), "{ready}").map_err(|_| "ready output failed")?;
    std::io::stdout()
        .flush()
        .map_err(|_| "ready output failed")?;

    let result = axum::serve(listener, router(state.clone()))
        .with_graceful_shutdown(async {
            let _ = stop_rx.await;
        })
        .await;
    state.shutdown().await;
    watcher.abort();
    result.map_err(|_| "loopback server failed")
}

fn stdin_events() -> (
    tokio::sync::oneshot::Receiver<Result<Vec<u8>, &'static str>>,
    tokio::sync::oneshot::Receiver<()>,
) {
    let (init_tx, init_rx) = tokio::sync::oneshot::channel();
    let (eof_tx, eof_rx) = tokio::sync::oneshot::channel();
    // 独立 std 线程持有唯一一次有界初始化读与后续 EOF 通知；Tokio 的 stdin
    // 使用不可取消的阻塞池读，SIGTERM 时 runtime drop 会永久等待。
    std::thread::spawn(move || {
        let mut stdin = std::io::BufReader::new(std::io::stdin());
        let mut line = Vec::new();
        let read = (&mut stdin).take(8193).read_until(b'\n', &mut line);
        let result = match read {
            Ok(length) if length > 0 && length <= 8192 && line.ends_with(b"\n") => Ok(line),
            _ => Err("invalid initialization"),
        };
        if init_tx.send(result).is_err() {
            return;
        }
        let mut buffer = [0u8; 4096];
        loop {
            match stdin.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(_) => {}
            }
        }
        let _ = eof_tx.send(());
    });
    (init_rx, eof_rx)
}

async fn termination_signal() {
    #[cfg(unix)]
    {
        if let (Ok(mut signal), Ok(mut hangup)) = (
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()),
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::hangup()),
        ) {
            tokio::select! {
                _ = signal.recv() => {},
                _ = hangup.recv() => {},
                _ = tokio::signal::ctrl_c() => {},
            }
            return;
        }
    }
    let _ = tokio::signal::ctrl_c().await;
}
