use serde::{Deserialize, Serialize};
use std::io::{self, Write};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutputFormat {
    Plain,
    Json,
    StreamingJson,
}

impl std::str::FromStr for OutputFormat {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "plain" => Ok(OutputFormat::Plain),
            "json" => Ok(OutputFormat::Json),
            "streaming-json" => Ok(OutputFormat::StreamingJson),
            other => Err(format!("unknown output format: {}", other)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleOutput {
    pub session_id: String,
    pub model: String,
    pub prompt: String,
    pub response: String,
    pub turn: u32,
}

pub fn emit_plain(response: &str) {
    println!("{}", response);
}

pub fn emit_json(output: &SingleOutput) {
    let s = serde_json::to_string(output).unwrap_or_else(|e| format!("{{\"error\":\"{}\"}}", e));
    println!("{}", s);
}

pub fn emit_streaming_json(output: &SingleOutput) {
    // Emit each word as a streaming chunk, then a final done event
    let words: Vec<&str> = output.response.split_whitespace().collect();
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    for word in &words {
        let chunk = serde_json::json!({
            "type": "chunk",
            "session_id": output.session_id,
            "delta": format!("{} ", word),
        });
        writeln!(handle, "{}", chunk).ok();
    }
    let done = serde_json::json!({
        "type": "done",
        "session_id": output.session_id,
        "model": output.model,
        "turn": output.turn,
        "response": output.response,
    });
    writeln!(handle, "{}", done).ok();
}
