use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OAuthFlow {
    Pkce,
    Device,
}

#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub id: &'static str,
    pub display_name: &'static str,
    pub flow: OAuthFlow,
    pub auth_url: &'static str,
    pub token_url: &'static str,
    pub refresh_url: &'static str,
    pub client_id: &'static str,
    pub scopes: &'static [&'static str],
}

pub struct ProviderRegistry {
    providers: HashMap<&'static str, ProviderConfig>,
}

impl ProviderRegistry {
    pub fn new() -> Self {
        let mut providers = HashMap::new();

        providers.insert(
            "openai",
            ProviderConfig {
                id: "openai",
                display_name: "OpenAI",
                flow: OAuthFlow::Pkce,
                auth_url: "https://auth.openai.com/authorize",
                token_url: "https://auth.openai.com/oauth/token",
                refresh_url: "https://auth.openai.com/oauth/token",
                client_id: "openai-pkce-client",
                scopes: &["openid", "profile", "email"],
            },
        );

        providers.insert(
            "anthropic",
            ProviderConfig {
                id: "anthropic",
                display_name: "Anthropic",
                flow: OAuthFlow::Pkce,
                auth_url: "https://claude.ai/oauth/authorize",
                token_url: "https://claude.ai/oauth/token",
                refresh_url: "https://claude.ai/oauth/token",
                client_id: "anthropic-pkce-client",
                scopes: &["read", "write"],
            },
        );

        providers.insert(
            "copilot",
            ProviderConfig {
                id: "copilot",
                display_name: "GitHub Copilot",
                flow: OAuthFlow::Device,
                auth_url: "https://github.com/login/device/code",
                token_url: "https://github.com/login/oauth/access_token",
                refresh_url: "https://github.com/login/oauth/access_token",
                client_id: "Iv1.b507a08c87ecfe98",
                scopes: &["read:user", "copilot"],
            },
        );

        Self { providers }
    }

    pub fn get(&self, id: &str) -> Option<&ProviderConfig> {
        self.providers.get(id)
    }

    pub fn list(&self) -> Vec<&ProviderConfig> {
        let mut v: Vec<_> = self.providers.values().collect();
        v.sort_by_key(|p| p.id);
        v
    }

    pub fn with_override(mut self, id: &'static str, config: ProviderConfig) -> Self {
        self.providers.insert(id, config);
        self
    }
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct OAuthGrant {
    pub provider_id: String,
    pub access_token: String,
    pub token_type: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
}

#[derive(Debug)]
pub enum OAuthError {
    AuthorizationPending,
    SlowDown,
    ExpiredToken,
    AccessDenied,
    StateMismatch,
    Http(reqwest::Error),
    Other(anyhow::Error),
}

impl std::fmt::Display for OAuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OAuthError::AuthorizationPending => write!(f, "authorization_pending"),
            OAuthError::SlowDown => write!(f, "slow_down"),
            OAuthError::ExpiredToken => write!(f, "expired_token"),
            OAuthError::AccessDenied => write!(f, "access_denied"),
            OAuthError::StateMismatch => write!(f, "state mismatch in PKCE callback"),
            OAuthError::Http(e) => write!(f, "http error: {}", e),
            OAuthError::Other(e) => write!(f, "other: {}", e),
        }
    }
}

impl std::error::Error for OAuthError {}

impl From<reqwest::Error> for OAuthError {
    fn from(e: reqwest::Error) -> Self {
        OAuthError::Http(e)
    }
}

impl From<anyhow::Error> for OAuthError {
    fn from(e: anyhow::Error) -> Self {
        OAuthError::Other(e)
    }
}
