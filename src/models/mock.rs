use crate::models::client::{ChatMessage, ChatRequest, ChatResponse, Choice, ModelError};

pub struct MockModelClient {
    pub echo: bool,
}

impl MockModelClient {
    pub fn new() -> Self {
        Self { echo: true }
    }

    pub fn chat(&self, req: &ChatRequest) -> Result<ChatResponse, ModelError> {
        let last = req
            .messages
            .last()
            .map(|m| m.content.as_str())
            .unwrap_or("");
        let reply = if self.echo {
            format!("echo: {}", last)
        } else {
            "mock response".to_string()
        };
        Ok(ChatResponse {
            choices: vec![Choice {
                message: ChatMessage {
                    role: "assistant".to_string(),
                    content: reply,
                },
            }],
        })
    }

    pub fn list_models(&self) -> Vec<String> {
        vec!["mock:echo".to_string()]
    }
}

impl Default for MockModelClient {
    fn default() -> Self {
        Self::new()
    }
}
