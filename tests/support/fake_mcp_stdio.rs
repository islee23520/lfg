use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

pub struct FakeMcpProcess {
    pub child: tokio::process::Child,
}

impl FakeMcpProcess {
    pub fn stdin(&mut self) -> &mut tokio::process::ChildStdin {
        self.child.stdin.as_mut().unwrap()
    }

    pub fn stdout(&mut self) -> tokio::process::ChildStdout {
        self.child.stdout.take().unwrap()
    }
}

pub fn make_initialize_response(id: u64) -> String {
    format!(
        r#"{{"jsonrpc":"2.0","id":{},"result":{{"serverInfo":{{"name":"fake-mcp","version":"0.1.0"}},"capabilities":{{}},"protocolVersion":"2024-11-05"}}}}"#,
        id
    )
}

pub fn make_tools_list_response(id: u64) -> String {
    format!(
        r#"{{"jsonrpc":"2.0","id":{},"result":{{"tools":[{{"name":"echo","description":"echo tool","inputSchema":{{"type":"object","properties":{{"text":{{"type":"string"}}}}}}}}]}}}}"#,
        id
    )
}

pub fn make_tools_call_response(id: u64, text: &str) -> String {
    let escaped = text.replace('"', "\\\"");
    format!(
        r#"{{"jsonrpc":"2.0","id":{},"result":{{"content":[{{"type":"text","text":"{}"}}]}}}}"#,
        id, escaped
    )
}

pub fn make_error_response(id: u64) -> String {
    format!(
        r#"{{"jsonrpc":"2.0","id":{},"error":{{"code":-32600,"message":"invalid request"}}}}"#,
        id
    )
}

pub async fn spawn_fake_mcp(responses: Vec<String>) -> FakeMcpProcess {
    let script = build_script(&responses);
    let child = Command::new("sh")
        .arg("-c")
        .arg(&script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("sh spawn failed");
    FakeMcpProcess { child }
}

fn build_script(responses: &[String]) -> String {
    let mut lines = Vec::new();
    for resp in responses {
        lines.push(format!("read line; echo '{}'", resp.replace('\'', "'\\''")));
    }
    lines.join("; ")
}

pub async fn send_and_recv(proc: &mut FakeMcpProcess, request: &str) -> String {
    let stdin = proc.child.stdin.as_mut().unwrap();
    let stdout = proc.child.stdout.take().unwrap();

    stdin
        .write_all(format!("{}\n", request).as_bytes())
        .await
        .unwrap();

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line).await.unwrap();

    proc.child.stdout = Some(reader.into_inner());
    line.trim().to_string()
}

pub async fn send_request(stdin: &mut tokio::process::ChildStdin, request: &str) {
    stdin
        .write_all(format!("{}\n", request).as_bytes())
        .await
        .unwrap();
}

pub async fn recv_response(stdout: &mut tokio::process::ChildStdout) -> String {
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line).await.unwrap();
    line.trim().to_string()
}
