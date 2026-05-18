mod support;

use support::http_servers::{start_mock_model_server, ModelScenario};

#[tokio::test]
async fn mock_model_server_localhost_only() {
    let server = start_mock_model_server(ModelScenario::Success).await;
    let addr = server.addr;
    println!("mock_model_server_localhost_only: addr={}", addr);
    assert_eq!(addr.ip().to_string(), "127.0.0.1");
}

#[tokio::test]
async fn mock_model_server_success() {
    let server = start_mock_model_server(ModelScenario::Success).await;
    let url = server.http_url();
    let resp = reqwest::get(&url).await.unwrap();
    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap();
    println!("mock_model_server_success: status={} body={}", status, body);
    assert_eq!(status, 200);
    let v: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(v["choices"][0]["message"]["content"], "hello");
}

#[tokio::test]
async fn mock_model_server_streaming() {
    let server = start_mock_model_server(ModelScenario::Streaming).await;
    let url = server.http_url();
    let resp = reqwest::get(&url).await.unwrap();
    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap();
    println!("mock_model_server_streaming: status={}", status);
    assert_eq!(status, 200);
    assert!(body.contains("data:"));
    assert!(body.contains("[DONE]"));
}

#[tokio::test]
async fn mock_model_server_unauthorized() {
    let server = start_mock_model_server(ModelScenario::Unauthorized).await;
    let url = server.http_url();
    let resp = reqwest::get(&url).await.unwrap();
    let status = resp.status().as_u16();
    println!("mock_model_server_unauthorized: status={}", status);
    assert_eq!(status, 401);
}

#[tokio::test]
async fn mock_model_server_rate_limited() {
    let server = start_mock_model_server(ModelScenario::RateLimited).await;
    let url = server.http_url();
    let resp = reqwest::get(&url).await.unwrap();
    let status = resp.status().as_u16();
    println!("mock_model_server_rate_limited: status={}", status);
    assert_eq!(status, 429);
}

#[tokio::test]
async fn mock_model_server_server_error() {
    let server = start_mock_model_server(ModelScenario::ServerError).await;
    let url = server.http_url();
    let resp = reqwest::get(&url).await.unwrap();
    let status = resp.status().as_u16();
    println!("mock_model_server_server_error: status={}", status);
    assert_eq!(status, 500);
}

#[tokio::test]
async fn mock_model_server_malformed_json() {
    let server = start_mock_model_server(ModelScenario::MalformedJson).await;
    let url = server.http_url();
    let resp = reqwest::get(&url).await.unwrap();
    let body = resp.text().await.unwrap();
    let parsed = serde_json::from_str::<serde_json::Value>(&body);
    println!("mock_model_server_malformed_json: body is not valid JSON as expected");
    assert!(parsed.is_err());
}
