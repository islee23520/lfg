use crate::auth::store::AuthStore;
use std::path::Path;

#[derive(Debug, Clone, PartialEq)]
pub enum CredentialSource {
    RuntimeOverride,
    StoredApiKey,
    StoredOAuth,
    EnvVar,
    None,
}

#[derive(Debug, Clone)]
pub struct ResolvedCredential {
    pub token: String,
    pub source: CredentialSource,
}

pub fn resolve_credential(
    runtime_override: Option<&str>,
    home: &Path,
    env_var: Option<&str>,
) -> ResolvedCredential {
    if let Some(tok) = runtime_override {
        if !tok.is_empty() {
            return ResolvedCredential {
                token: tok.to_string(),
                source: CredentialSource::RuntimeOverride,
            };
        }
    }

    let store = AuthStore::new(home);
    if let Ok(auth) = store.read() {
        if let Some(key) = auth.api_key {
            if !key.is_empty() {
                return ResolvedCredential {
                    token: key,
                    source: CredentialSource::StoredApiKey,
                };
            }
        }
        if let Some(oauth) = auth.oauth_token {
            if !oauth.access_token.is_empty() {
                return ResolvedCredential {
                    token: oauth.access_token,
                    source: CredentialSource::StoredOAuth,
                };
            }
        }
    }

    if let Some(var_name) = env_var {
        if let Ok(val) = std::env::var(var_name) {
            if !val.is_empty() {
                return ResolvedCredential {
                    token: val,
                    source: CredentialSource::EnvVar,
                };
            }
        }
    }

    ResolvedCredential {
        token: String::new(),
        source: CredentialSource::None,
    }
}
