use anyhow::{bail, Result};
use std::path::Path;

use crate::models::client::{ChatMessage, ChatRequest};
use crate::models::mock::MockModelClient;
use crate::runtime::output::{
    emit_json, emit_plain, emit_streaming_json, OutputFormat, SingleOutput,
};
use crate::session::store::{RuntimeEvent, Session, SessionStore};

pub struct DispatchConfig {
    pub prompt: String,
    pub model: String,
    pub output_format: OutputFormat,
    pub check: bool,
    pub best_of_n: u32,
    pub max_turns: u32,
    pub session_id: Option<String>,
}

impl Default for DispatchConfig {
    fn default() -> Self {
        Self {
            prompt: String::new(),
            model: "mock:echo".to_string(),
            output_format: OutputFormat::Plain,
            check: false,
            best_of_n: 1,
            max_turns: 1,
            session_id: None,
        }
    }
}

pub struct DispatchResult {
    pub session_id: String,
    pub response: String,
    pub exit_code: i32,
}

fn resolve_client(model: &str) -> Result<MockModelClient> {
    if model.starts_with("mock:") {
        Ok(MockModelClient::new())
    } else {
        bail!("non-mock models require API credentials; use --model mock:echo for headless mode")
    }
}

fn pick_best(candidates: Vec<String>) -> String {
    candidates.into_iter().next().unwrap_or_default()
}

pub fn run_single(cfg: DispatchConfig, home: &Path) -> Result<DispatchResult> {
    if cfg.prompt.is_empty() {
        bail!("prompt must not be empty");
    }
    if cfg.max_turns == 0 {
        bail!("max-turns must be >= 1");
    }

    let client = resolve_client(&cfg.model)?;

    let store = SessionStore::new(home);
    let mut session = match &cfg.session_id {
        Some(id) => store.load(id).unwrap_or_else(|_| {
            Session::new(
                &std::env::current_dir()
                    .unwrap_or_default()
                    .to_string_lossy(),
            )
        }),
        None => Session::new(
            &std::env::current_dir()
                .unwrap_or_default()
                .to_string_lossy(),
        ),
    };

    session.add_turn("user", &cfg.prompt);

    let req = ChatRequest {
        model: cfg.model.clone(),
        messages: session
            .turns
            .iter()
            .map(|t| ChatMessage {
                role: t.role.clone(),
                content: t.content.clone(),
            })
            .collect(),
        stream: cfg.output_format == OutputFormat::StreamingJson,
    };

    let mut candidates = Vec::with_capacity(cfg.best_of_n as usize);
    for _ in 0..cfg.best_of_n.max(1) {
        match client.chat(&req) {
            Ok(resp) => {
                let text = resp
                    .choices
                    .first()
                    .map(|c| c.message.content.clone())
                    .unwrap_or_default();
                candidates.push(text);
            }
            Err(e) => {
                bail!("model error: {}", e);
            }
        }
    }

    let response = pick_best(candidates);

    let last_turn = session.turns.last_mut().unwrap();
    last_turn.events.push(RuntimeEvent {
        kind: "model_response".to_string(),
        data: serde_json::json!({ "model": cfg.model, "response": response }),
        timestamp: chrono::Utc::now(),
    });

    session.add_turn("assistant", &response);

    store.save(&session)?;

    let output = SingleOutput {
        session_id: session.id.clone(),
        model: cfg.model.clone(),
        prompt: cfg.prompt.clone(),
        response: response.clone(),
        turn: session.turns.len() as u32,
    };

    match cfg.output_format {
        OutputFormat::Plain => emit_plain(&response),
        OutputFormat::Json => emit_json(&output),
        OutputFormat::StreamingJson => emit_streaming_json(&output),
    }

    let exit_code = if cfg.check && response.is_empty() {
        1
    } else {
        0
    };

    Ok(DispatchResult {
        session_id: session.id,
        response,
        exit_code,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn tmp() -> TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn test_single_plain_echo() {
        let dir = tmp();
        let cfg = DispatchConfig {
            prompt: "hello".to_string(),
            model: "mock:echo".to_string(),
            output_format: OutputFormat::Plain,
            ..Default::default()
        };
        let result = run_single(cfg, dir.path()).unwrap();
        assert_eq!(result.response, "echo: hello");
        assert_eq!(result.exit_code, 0);
    }

    #[test]
    fn test_single_json_echo() {
        let dir = tmp();
        let cfg = DispatchConfig {
            prompt: "world".to_string(),
            model: "mock:echo".to_string(),
            output_format: OutputFormat::Json,
            ..Default::default()
        };
        let result = run_single(cfg, dir.path()).unwrap();
        assert_eq!(result.response, "echo: world");
    }

    #[test]
    fn test_session_persisted() {
        let dir = tmp();
        let cfg = DispatchConfig {
            prompt: "persist me".to_string(),
            model: "mock:echo".to_string(),
            output_format: OutputFormat::Plain,
            ..Default::default()
        };
        let result = run_single(cfg, dir.path()).unwrap();
        let store = SessionStore::new(dir.path());
        let session = store.load(&result.session_id).unwrap();
        assert_eq!(session.turns.len(), 2);
        assert_eq!(session.turns[0].role, "user");
        assert_eq!(session.turns[1].role, "assistant");
    }

    #[test]
    fn test_check_flag_empty_response() {
        let dir = tmp();
        let cfg = DispatchConfig {
            prompt: "test".to_string(),
            model: "mock:echo".to_string(),
            output_format: OutputFormat::Plain,
            check: true,
            ..Default::default()
        };
        let result = run_single(cfg, dir.path()).unwrap();
        assert_eq!(result.exit_code, 0);
    }

    #[test]
    fn test_best_of_n() {
        let dir = tmp();
        let cfg = DispatchConfig {
            prompt: "best".to_string(),
            model: "mock:echo".to_string(),
            output_format: OutputFormat::Plain,
            best_of_n: 3,
            ..Default::default()
        };
        let result = run_single(cfg, dir.path()).unwrap();
        assert_eq!(result.response, "echo: best");
    }

    #[test]
    fn test_empty_prompt_error() {
        let dir = tmp();
        let cfg = DispatchConfig {
            prompt: "".to_string(),
            model: "mock:echo".to_string(),
            output_format: OutputFormat::Plain,
            ..Default::default()
        };
        assert!(run_single(cfg, dir.path()).is_err());
    }

    #[test]
    fn test_non_mock_model_error() {
        let dir = tmp();
        let cfg = DispatchConfig {
            prompt: "hello".to_string(),
            model: "grok-3".to_string(),
            output_format: OutputFormat::Plain,
            ..Default::default()
        };
        assert!(run_single(cfg, dir.path()).is_err());
    }

    #[test]
    fn test_max_turns_zero_error() {
        let dir = tmp();
        let cfg = DispatchConfig {
            prompt: "hello".to_string(),
            model: "mock:echo".to_string(),
            output_format: OutputFormat::Plain,
            max_turns: 0,
            ..Default::default()
        };
        assert!(run_single(cfg, dir.path()).is_err());
    }

    #[test]
    fn test_streaming_json() {
        let dir = tmp();
        let cfg = DispatchConfig {
            prompt: "stream me".to_string(),
            model: "mock:echo".to_string(),
            output_format: OutputFormat::StreamingJson,
            ..Default::default()
        };
        let result = run_single(cfg, dir.path()).unwrap();
        assert_eq!(result.response, "echo: stream me");
    }
}
