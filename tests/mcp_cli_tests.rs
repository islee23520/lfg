mod support;

use support::fake_mcp_stdio::{
    make_initialize_response, make_tools_call_response, make_tools_list_response, spawn_fake_mcp,
};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[tokio::test]
async fn mcp_cli_list_via_fake_harness() {
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
    let v: serde_json::Value = serde_json::from_str(line.trim()).unwrap();

    let tools = v["result"]["tools"].as_array().unwrap();
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0]["name"], "echo");
}

#[tokio::test]
async fn mcp_cli_call_via_fake_harness() {
    let responses = vec![make_tools_call_response(3, "pong")];
    let mut proc = spawn_fake_mcp(responses).await;

    let stdin = proc.child.stdin.as_mut().unwrap();
    let stdout = proc.child.stdout.take().unwrap();

    let req = r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"echo","arguments":{"text":"ping"}}}"#;
    stdin
        .write_all(format!("{}\n", req).as_bytes())
        .await
        .unwrap();

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line).await.unwrap();
    let v: serde_json::Value = serde_json::from_str(line.trim()).unwrap();

    assert_eq!(v["result"]["content"][0]["text"], "pong");
}

#[tokio::test]
async fn mcp_stdio_client_initialize() {
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
    let v: serde_json::Value = serde_json::from_str(line.trim()).unwrap();

    assert_eq!(v["result"]["serverInfo"]["name"], "fake-mcp");
}

#[tokio::test]
async fn mcp_stdio_client_tools_list_via_lib() {
    use lfg::mcp::stdio::McpStdioClient;

    let responses = vec![make_tools_list_response(2)];
    let mut proc = spawn_fake_mcp(responses).await;

    let pid = proc.child.id().unwrap();
    let cmd = format!("cat /proc/{}/fd/0 2>/dev/null || true", pid);
    drop(cmd);

    let script = build_echo_script(&[make_tools_list_response(2)]);
    let mut client = McpStdioClient::spawn("sh", &["-c", &script]).await.unwrap();

    let tools = client.tools_list().await.unwrap();
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0]["name"], "echo");
    client.kill().await;
}

#[tokio::test]
async fn mcp_stdio_client_tools_call_via_lib() {
    use lfg::mcp::stdio::McpStdioClient;

    let script = build_echo_script(&[make_tools_call_response(3, "hello from lib")]);
    let mut client = McpStdioClient::spawn("sh", &["-c", &script]).await.unwrap();

    let result = client
        .tools_call("echo", serde_json::json!({"text": "hello"}))
        .await
        .unwrap();
    assert_eq!(result["content"][0]["text"], "hello from lib");
    client.kill().await;
}

fn build_echo_script(responses: &[String]) -> String {
    let mut lines = Vec::new();
    for resp in responses {
        lines.push(format!("read line; echo '{}'", resp.replace('\'', "'\\''")));
    }
    lines.join("; ")
}
