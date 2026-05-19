mod support;

use support::http_servers::{start_oauth_fixture_server, OAuthScenario};

#[tokio::test]
async fn oauth_fixture_server_localhost_only() {
    let server = start_oauth_fixture_server(OAuthScenario::DeviceSuccess).await;
    let addr = server.addr;
    println!("oauth_fixture_server_localhost_only: addr={}", addr);
    assert_eq!(addr.ip().to_string(), "127.0.0.1");
}

#[tokio::test]
async fn oauth_fixture_server_device_success() {
    let server = start_oauth_fixture_server(OAuthScenario::DeviceSuccess).await;
    let url = server.http_url();
    let resp = reqwest::get(&url).await.unwrap();
    let body = resp.text().await.unwrap();
    println!("oauth_fixture_server_device_success: body={}", body);
    let v: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(v["access_token"], "test-token-abc123");
    assert_eq!(v["token_type"], "Bearer");
}

#[tokio::test]
async fn oauth_fixture_server_device_authorization_pending() {
    let server = start_oauth_fixture_server(OAuthScenario::DevicePending).await;
    let url = server.http_url();
    let resp = reqwest::get(&url).await.unwrap();
    let body = resp.text().await.unwrap();
    println!(
        "oauth_fixture_server_device_authorization_pending: body={}",
        body
    );
    let v: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(v["error"], "authorization_pending");
}

#[tokio::test]
async fn oauth_fixture_server_device_slow_down() {
    let server = start_oauth_fixture_server(OAuthScenario::DeviceSlowDown).await;
    let url = server.http_url();
    let resp = reqwest::get(&url).await.unwrap();
    let body = resp.text().await.unwrap();
    println!("oauth_fixture_server_device_slow_down: body={}", body);
    let v: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(v["error"], "slow_down");
}

#[tokio::test]
async fn oauth_fixture_server_device_expired_token() {
    let server = start_oauth_fixture_server(OAuthScenario::DeviceExpiredToken).await;
    let url = server.http_url();
    let resp = reqwest::get(&url).await.unwrap();
    let body = resp.text().await.unwrap();
    println!("oauth_fixture_server_device_expired_token: body={}", body);
    let v: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(v["error"], "expired_token");
}

#[tokio::test]
async fn oauth_fixture_server_pkce_state_mismatch() {
    let server = start_oauth_fixture_server(OAuthScenario::PkceStateMismatch).await;
    let url = server.http_url();
    let resp = reqwest::get(&url).await.unwrap();
    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap();
    println!(
        "oauth_fixture_server_pkce_state_mismatch: status={} body={}",
        status, body
    );
    assert_eq!(status, 400);
    let v: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert_eq!(v["error"], "invalid_request");
}
