use std::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener as TokioTcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

pub struct MockServer {
    pub addr: std::net::SocketAddr,
    _shutdown_tx: oneshot::Sender<()>,
    _handle: JoinHandle<()>,
}

impl MockServer {
    pub fn ws_url(&self) -> String {
        format!("ws://{}", self.addr)
    }

    pub fn http_url(&self) -> String {
        format!("http://{}", self.addr)
    }
}

fn bind_free_port() -> std::net::SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap()
}

pub async fn start_mock_model_server(scenario: ModelScenario) -> MockServer {
    let addr = bind_free_port();
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
    let listener = TokioTcpListener::bind(addr).await.unwrap();
    let actual_addr = listener.local_addr().unwrap();

    let handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut shutdown_rx => break,
                result = listener.accept() => {
                    if let Ok((mut stream, _)) = result {
                        let scenario = scenario.clone();
                        tokio::spawn(async move {
                            let mut buf = vec![0u8; 4096];
                            let _ = stream.read(&mut buf).await;
                            let response = build_model_response(&scenario);
                            let _ = stream.write_all(response.as_bytes()).await;
                        });
                    }
                }
            }
        }
    });

    MockServer {
        addr: actual_addr,
        _shutdown_tx: shutdown_tx,
        _handle: handle,
    }
}

pub async fn start_oauth_fixture_server(scenario: OAuthScenario) -> MockServer {
    let addr = bind_free_port();
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
    let listener = TokioTcpListener::bind(addr).await.unwrap();
    let actual_addr = listener.local_addr().unwrap();

    let handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut shutdown_rx => break,
                result = listener.accept() => {
                    if let Ok((mut stream, _)) = result {
                        let scenario = scenario.clone();
                        tokio::spawn(async move {
                            let mut buf = vec![0u8; 4096];
                            let _ = stream.read(&mut buf).await;
                            let response = build_oauth_response(&scenario);
                            let _ = stream.write_all(response.as_bytes()).await;
                        });
                    }
                }
            }
        }
    });

    MockServer {
        addr: actual_addr,
        _shutdown_tx: shutdown_tx,
        _handle: handle,
    }
}

#[derive(Clone, Debug)]
pub enum ModelScenario {
    Success,
    Streaming,
    Unauthorized,
    RateLimited,
    ServerError,
    MalformedJson,
    Timeout,
}

#[derive(Clone, Debug)]
pub enum OAuthScenario {
    DeviceSuccess,
    DevicePending,
    DeviceSlowDown,
    DeviceExpiredToken,
    PkceStateMismatch,
}

fn build_model_response(scenario: &ModelScenario) -> String {
    match scenario {
        ModelScenario::Success => {
            let body = r#"{"choices":[{"message":{"content":"hello"}}]}"#;
            http_200(body, "application/json")
        }
        ModelScenario::Streaming => {
            let chunk1 = "data: {\"choices\":[{\"delta\":{\"content\":\"hel\"}}]}\n\n";
            let chunk2 = "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n";
            let done = "data: [DONE]\n\n";
            let body = format!("{}{}{}", chunk1, chunk2, done);
            http_200_streaming(&body)
        }
        ModelScenario::Unauthorized => http_status(401, r#"{"error":"unauthorized"}"#),
        ModelScenario::RateLimited => http_status(429, r#"{"error":"rate_limited"}"#),
        ModelScenario::ServerError => http_status(500, r#"{"error":"internal_server_error"}"#),
        ModelScenario::MalformedJson => http_200("not-valid-json{{{{", "application/json"),
        ModelScenario::Timeout => String::new(),
    }
}

fn build_oauth_response(scenario: &OAuthScenario) -> String {
    match scenario {
        OAuthScenario::DeviceSuccess => {
            let body = r#"{"access_token":"test-token-abc123","token_type":"Bearer"}"#;
            http_200(body, "application/json")
        }
        OAuthScenario::DevicePending => {
            let body = r#"{"error":"authorization_pending"}"#;
            http_200(body, "application/json")
        }
        OAuthScenario::DeviceSlowDown => {
            let body = r#"{"error":"slow_down"}"#;
            http_200(body, "application/json")
        }
        OAuthScenario::DeviceExpiredToken => {
            let body = r#"{"error":"expired_token"}"#;
            http_200(body, "application/json")
        }
        OAuthScenario::PkceStateMismatch => {
            let body = r#"{"error":"invalid_request","error_description":"state mismatch"}"#;
            http_status(400, body)
        }
    }
}

fn http_200(body: &str, content_type: &str) -> String {
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        content_type,
        body.len(),
        body
    )
}

fn http_200_streaming(body: &str) -> String {
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    )
}

fn http_status(status: u16, body: &str) -> String {
    let reason = match status {
        400 => "Bad Request",
        401 => "Unauthorized",
        429 => "Too Many Requests",
        500 => "Internal Server Error",
        _ => "Error",
    };
    format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status,
        reason,
        body.len(),
        body
    )
}
