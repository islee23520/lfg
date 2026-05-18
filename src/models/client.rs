use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub choices: Vec<Choice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Choice {
    pub message: ChatMessage,
}

#[derive(Debug, Clone)]
pub enum ModelError {
    Unauthorized,
    RateLimited { retry_after: Option<u64> },
    ServerError(u16),
    MalformedResponse(String),
    Timeout,
    Other(String),
}

impl std::fmt::Display for ModelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ModelError::Unauthorized => write!(f, "unauthorized"),
            ModelError::RateLimited { retry_after } => {
                write!(f, "rate_limited retry_after={:?}", retry_after)
            }
            ModelError::ServerError(code) => write!(f, "server_error {}", code),
            ModelError::MalformedResponse(msg) => write!(f, "malformed_response: {}", msg),
            ModelError::Timeout => write!(f, "timeout"),
            ModelError::Other(msg) => write!(f, "error: {}", msg),
        }
    }
}

pub struct ModelClient {
    base_url: String,
    api_key: String,
    http: reqwest::Client,
}

impl ModelClient {
    pub fn new(base_url: &str, api_key: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.to_string(),
            http: reqwest::Client::new(),
        }
    }

    pub async fn chat(&self, req: &ChatRequest) -> Result<ChatResponse, ModelError> {
        let url = format!("{}/v1/chat/completions", self.base_url);
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.api_key)
            .json(req)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    ModelError::Timeout
                } else {
                    ModelError::Other(e.to_string())
                }
            })?;

        let status = resp.status();
        match status.as_u16() {
            200 => {
                let body = resp
                    .text()
                    .await
                    .map_err(|e| ModelError::Other(e.to_string()))?;
                serde_json::from_str::<ChatResponse>(&body)
                    .map_err(|e| ModelError::MalformedResponse(e.to_string()))
            }
            401 => Err(ModelError::Unauthorized),
            429 => {
                let retry_after = resp
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok());
                Err(ModelError::RateLimited { retry_after })
            }
            code => Err(ModelError::ServerError(code)),
        }
    }

    pub async fn list_models(&self) -> Result<Vec<String>, ModelError> {
        let url = format!("{}/v1/models", self.base_url);
        let resp = self
            .http
            .get(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await
            .map_err(|e| ModelError::Other(e.to_string()))?;

        let status = resp.status();
        match status.as_u16() {
            200 => {
                let body: serde_json::Value = resp
                    .json()
                    .await
                    .map_err(|e| ModelError::MalformedResponse(e.to_string()))?;
                let models = body["data"]
                    .as_array()
                    .unwrap_or(&vec![])
                    .iter()
                    .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
                    .collect();
                Ok(models)
            }
            401 => Err(ModelError::Unauthorized),
            code => Err(ModelError::ServerError(code)),
        }
    }
}
