use anyhow::{bail, Context, Result};
use serde_json::{json, Value};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};

pub struct McpStdioClient {
    child: Child,
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
}

impl McpStdioClient {
    pub async fn spawn(cmd: &str, args: &[&str]) -> Result<Self> {
        let mut child = Command::new(cmd)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .with_context(|| format!("failed to spawn MCP server: {}", cmd))?;

        let stdin = child.stdin.take().context("no stdin")?;
        let stdout = child.stdout.take().context("no stdout")?;
        let reader = BufReader::new(stdout);

        Ok(Self {
            child,
            stdin,
            reader,
        })
    }

    pub async fn request(&mut self, id: u64, method: &str, params: Value) -> Result<Value> {
        let req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let line = format!("{}\n", req);
        self.stdin
            .write_all(line.as_bytes())
            .await
            .context("write to MCP stdin")?;

        let mut resp_line = String::new();
        let n = self
            .reader
            .read_line(&mut resp_line)
            .await
            .context("read from MCP stdout")?;
        if n == 0 {
            bail!("MCP server closed stdout unexpectedly");
        }

        let v: Value = serde_json::from_str(resp_line.trim()).context("parse MCP response")?;
        if let Some(err) = v.get("error") {
            bail!("MCP error: {}", err);
        }
        Ok(v)
    }

    pub async fn initialize(&mut self) -> Result<Value> {
        self.request(1, "initialize", json!({})).await
    }

    pub async fn tools_list(&mut self) -> Result<Vec<Value>> {
        let resp = self.request(2, "tools/list", json!({})).await?;
        let tools = resp["result"]["tools"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        Ok(tools)
    }

    pub async fn tools_call(&mut self, name: &str, arguments: Value) -> Result<Value> {
        let resp = self
            .request(
                3,
                "tools/call",
                json!({ "name": name, "arguments": arguments }),
            )
            .await?;
        Ok(resp["result"].clone())
    }

    pub async fn kill(&mut self) {
        let _ = self.child.kill().await;
    }
}
