mod support;

use support::fake_mcp_stdio::{
    make_error_response, make_initialize_response, make_tools_call_response,
    make_tools_list_response, spawn_fake_mcp,
};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[tokio::test]
async fn fake_mcp_stdio_initialize() {
    let responses = vec![make_initialize_response(1)];
    let mut proc = spawn_fake_mcp(responses).await;

    let stdin = proc.child.stdin.as_mut().unwrap();
    let stdout = proc.child.stdout.take().unwrap();

    let req = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#;
    stdin
        .write_all(format!("{}\n", req).as_bytes())
        .await
        .unwrap();

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line).await.unwrap();
    let response = line.trim().to_string();

    println!("fake_mcp_stdio_initialize: response={}", response);
    let v: serde_json::Value = serde_json::from_str(&response).unwrap();
    assert_eq!(v["jsonrpc"], "2.0");
    assert_eq!(v["id"], 1);
    assert_eq!(v["result"]["serverInfo"]["name"], "fake-mcp");
}

#[tokio::test]
async fn fake_mcp_stdio_tools_list() {
    let responses = vec![make_tools_list_response(2)];
    let mut proc = spawn_fake_mcp(responses).await;

    let stdin = proc.child.stdin.as_mut().unwrap();
    let stdout = proc.child.stdout.take().unwrap();

    let req = r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#;
    stdin
        .write_all(format!("{}\n", req).as_bytes())
        .await
        .unwrap();

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line).await.unwrap();
    let response = line.trim().to_string();

    let v: serde_json::Value = serde_json::from_str(&response).unwrap();
    let tools = v["result"]["tools"].as_array().unwrap();
    println!("fake_mcp_stdio_tools_list: tools={}", tools.len());
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0]["name"], "echo");
}

#[tokio::test]
async fn fake_mcp_stdio_tools_call() {
    let responses = vec![make_tools_call_response(3, "hello from echo")];
    let mut proc = spawn_fake_mcp(responses).await;

    let stdin = proc.child.stdin.as_mut().unwrap();
    let stdout = proc.child.stdout.take().unwrap();

    let req = r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"echo","arguments":{"text":"hello"}}}"#;
    stdin
        .write_all(format!("{}\n", req).as_bytes())
        .await
        .unwrap();

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line).await.unwrap();
    let response = line.trim().to_string();

    let v: serde_json::Value = serde_json::from_str(&response).unwrap();
    let content = &v["result"]["content"][0]["text"];
    println!("fake_mcp_stdio_tools_call: content={}", content);
    assert_eq!(content, "hello from echo");
}

#[tokio::test]
async fn fake_mcp_stdio_error_response() {
    let responses = vec![make_error_response(99)];
    let mut proc = spawn_fake_mcp(responses).await;

    let stdin = proc.child.stdin.as_mut().unwrap();
    let stdout = proc.child.stdout.take().unwrap();

    let req = r#"{"jsonrpc":"2.0","id":99,"method":"bad/method"}"#;
    stdin
        .write_all(format!("{}\n", req).as_bytes())
        .await
        .unwrap();

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line).await.unwrap();
    let response = line.trim().to_string();

    let v: serde_json::Value = serde_json::from_str(&response).unwrap();
    let error = &v["error"];
    println!("fake_mcp_stdio_error_response: error={}", error);
    assert_eq!(error["code"], -32600);
}

#[tokio::test]
async fn fake_mcp_stdio_early_exit() {
    let responses = vec![make_initialize_response(1)];
    let mut proc = spawn_fake_mcp(responses).await;

    let stdin = proc.child.stdin.as_mut().unwrap();
    let stdout = proc.child.stdout.take().unwrap();

    let req = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#;
    stdin
        .write_all(format!("{}\n", req).as_bytes())
        .await
        .unwrap();

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line).await.unwrap();

    let req2 = r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#;
    stdin
        .write_all(format!("{}\n", req2).as_bytes())
        .await
        .unwrap();

    let mut line2 = String::new();
    let n = reader.read_line(&mut line2).await.unwrap_or(0);

    println!("fake_mcp_stdio_early_exit: process exited cleanly after responses exhausted");
    assert_eq!(n, 0, "expected EOF after responses exhausted");
}
