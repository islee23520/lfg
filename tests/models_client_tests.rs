use lfg::models::client::{ChatMessage, ChatRequest, ModelClient, ModelError};
use lfg::models::mock::MockModelClient;

fn make_request(model: &str, prompt: &str) -> ChatRequest {
    ChatRequest {
        model: model.to_string(),
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
        }],
        stream: false,
    }
}

#[test]
fn models_client_mock_chat_success() {
    let client = MockModelClient::new();
    let req = make_request("mock:echo", "hello");
    let resp = client.chat(&req).unwrap();
    assert_eq!(resp.choices[0].message.role, "assistant");
    assert!(resp.choices[0].message.content.contains("hello"));
}

#[test]
fn models_client_mock_list_models() {
    let client = MockModelClient::new();
    let models = client.list_models();
    assert!(models.contains(&"mock:echo".to_string()));
}

#[tokio::test]
async fn models_client_401() {
    use std::net::TcpListener;
    use tokio::io::AsyncWriteExt;

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let listener = tokio::net::TcpListener::from_std(listener).unwrap();

    tokio::spawn(async move {
        if let Ok((mut stream, _)) = listener.accept().await {
            let resp = b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n";
            let _ = stream.write_all(resp).await;
        }
    });

    let client = ModelClient::new(&format!("http://{}", addr), "bad-key");
    let req = make_request("grok-3", "hello");
    let err = client.chat(&req).await.unwrap_err();
    assert!(matches!(err, ModelError::Unauthorized));
}

#[tokio::test]
async fn models_client_429() {
    use std::net::TcpListener;
    use tokio::io::AsyncWriteExt;

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let listener = tokio::net::TcpListener::from_std(listener).unwrap();

    tokio::spawn(async move {
        if let Ok((mut stream, _)) = listener.accept().await {
            let resp =
                b"HTTP/1.1 429 Too Many Requests\r\nRetry-After: 30\r\nContent-Length: 0\r\n\r\n";
            let _ = stream.write_all(resp).await;
        }
    });

    let client = ModelClient::new(&format!("http://{}", addr), "key");
    let req = make_request("grok-3", "hello");
    let err = client.chat(&req).await.unwrap_err();
    assert!(matches!(
        err,
        ModelError::RateLimited {
            retry_after: Some(30)
        }
    ));
}

#[tokio::test]
async fn models_client_500() {
    use std::net::TcpListener;
    use tokio::io::AsyncWriteExt;

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let listener = tokio::net::TcpListener::from_std(listener).unwrap();

    tokio::spawn(async move {
        if let Ok((mut stream, _)) = listener.accept().await {
            let resp = b"HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n";
            let _ = stream.write_all(resp).await;
        }
    });

    let client = ModelClient::new(&format!("http://{}", addr), "key");
    let req = make_request("grok-3", "hello");
    let err = client.chat(&req).await.unwrap_err();
    assert!(matches!(err, ModelError::ServerError(500)));
}

#[tokio::test]
async fn models_client_malformed_json() {
    use std::net::TcpListener;
    use tokio::io::AsyncWriteExt;

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let listener = tokio::net::TcpListener::from_std(listener).unwrap();

    tokio::spawn(async move {
        if let Ok((mut stream, _)) = listener.accept().await {
            let body = b"not-json";
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(header.as_bytes()).await;
            let _ = stream.write_all(body).await;
        }
    });

    let client = ModelClient::new(&format!("http://{}", addr), "key");
    let req = make_request("grok-3", "hello");
    let err = client.chat(&req).await.unwrap_err();
    assert!(matches!(err, ModelError::MalformedResponse(_)));
}

#[tokio::test]
async fn models_client_success() {
    use std::net::TcpListener;
    use tokio::io::AsyncWriteExt;

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let listener = tokio::net::TcpListener::from_std(listener).unwrap();

    tokio::spawn(async move {
        if let Ok((mut stream, _)) = listener.accept().await {
            let body = br#"{"choices":[{"message":{"role":"assistant","content":"hi"}}]}"#;
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(header.as_bytes()).await;
            let _ = stream.write_all(body).await;
        }
    });

    let client = ModelClient::new(&format!("http://{}", addr), "key");
    let req = make_request("grok-3", "hello");
    let resp = client.chat(&req).await.unwrap();
    assert_eq!(resp.choices[0].message.content, "hi");
}
