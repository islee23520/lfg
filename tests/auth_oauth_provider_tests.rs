mod support;

use lfg::auth::credential::{resolve_credential, CredentialSource};
use lfg::auth::pkce::{build_authorization_url, exchange_code_for_token, generate_pkce_params};
use lfg::auth::provider::{OAuthError, OAuthFlow, OAuthGrant, ProviderRegistry};
use lfg::auth::redact::{contains_secret, redact};
use lfg::auth::refresh::{grant_to_oauth_token, is_token_expired, persist_grant, refresh_token};
use lfg::auth::store::{AuthFile, AuthStore, OAuthToken};
use support::http_servers::{start_oauth_fixture_server, OAuthScenario};
use tempfile::TempDir;

fn tmp_home() -> TempDir {
    tempfile::tempdir().unwrap()
}

#[test]
fn provider_registry_contains_openai_anthropic_copilot() {
    let reg = ProviderRegistry::new();
    let openai = reg.get("openai").unwrap();
    assert_eq!(openai.id, "openai");
    assert_eq!(openai.flow, OAuthFlow::Pkce);

    let anthropic = reg.get("anthropic").unwrap();
    assert_eq!(anthropic.id, "anthropic");
    assert_eq!(anthropic.flow, OAuthFlow::Pkce);

    let copilot = reg.get("copilot").unwrap();
    assert_eq!(copilot.id, "copilot");
    assert_eq!(copilot.flow, OAuthFlow::Device);
}

#[test]
fn provider_registry_list_sorted() {
    let reg = ProviderRegistry::new();
    let list = reg.list();
    let ids: Vec<&str> = list.iter().map(|p| p.id).collect();
    let mut sorted = ids.clone();
    sorted.sort();
    assert_eq!(ids, sorted);
}

#[test]
fn provider_registry_unknown_returns_none() {
    let reg = ProviderRegistry::new();
    assert!(reg.get("unknown-provider").is_none());
}

#[test]
fn pkce_params_are_unique_per_call() {
    let p1 = generate_pkce_params();
    let p2 = generate_pkce_params();
    assert_ne!(p1.code_verifier, p2.code_verifier);
    assert_ne!(p1.state, p2.state);
    assert_ne!(p1.code_challenge, p2.code_challenge);
}

#[test]
fn pkce_params_challenge_is_base64url() {
    let p = generate_pkce_params();
    assert!(p
        .code_challenge
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_'));
    assert!(!p.code_challenge.contains('+'));
    assert!(!p.code_challenge.contains('/'));
    assert!(!p.code_challenge.contains('='));
}

#[test]
fn pkce_authorization_url_contains_required_params() {
    let reg = ProviderRegistry::new();
    let config = reg.get("openai").unwrap();
    let params = generate_pkce_params();
    let url = build_authorization_url(config, &params, "http://localhost:8080/callback");
    assert!(url.contains("response_type=code"));
    assert!(url.contains("code_challenge_method=S256"));
    assert!(url.contains(&params.state));
    assert!(url.contains(&params.code_challenge));
    assert!(url.starts_with(config.auth_url));
}

#[tokio::test]
async fn pkce_exchange_state_mismatch_returns_error() {
    let server = start_oauth_fixture_server(OAuthScenario::PkceStateMismatch).await;
    let reg = ProviderRegistry::new();
    let mut config = reg.get("openai").unwrap().clone();
    let token_url = Box::leak(server.http_url().into_boxed_str());
    config.token_url = token_url;

    let client = reqwest::Client::new();
    let result = exchange_code_for_token(
        &client,
        &config,
        "auth-code-123",
        "verifier-abc",
        "http://localhost/cb",
        "expected-state",
        "wrong-state",
    )
    .await;

    assert!(matches!(result, Err(OAuthError::StateMismatch)));
}

#[tokio::test]
async fn pkce_exchange_success_returns_grant() {
    let server = start_oauth_fixture_server(OAuthScenario::DeviceSuccess).await;
    let reg = ProviderRegistry::new();
    let mut config = reg.get("openai").unwrap().clone();
    let token_url = Box::leak(server.http_url().into_boxed_str());
    config.token_url = token_url;

    let client = reqwest::Client::new();
    let result = exchange_code_for_token(
        &client,
        &config,
        "auth-code-123",
        "verifier-abc",
        "http://localhost/cb",
        "same-state",
        "same-state",
    )
    .await;

    let grant = result.unwrap();
    assert_eq!(grant.access_token, "test-token-abc123");
    assert_eq!(grant.provider_id, "openai");
}

#[test]
fn is_token_expired_none_means_not_expired() {
    assert!(!is_token_expired(None, 60));
}

#[test]
fn is_token_expired_past_timestamp_is_expired() {
    assert!(is_token_expired(Some(1000), 0));
}

#[test]
fn is_token_expired_future_timestamp_not_expired() {
    let future = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
        + 3600;
    assert!(!is_token_expired(Some(future), 60));
}

#[test]
fn is_token_expired_buffer_triggers_early_refresh() {
    let soon = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
        + 30;
    assert!(is_token_expired(Some(soon), 60));
}

#[test]
fn grant_to_oauth_token_maps_fields() {
    let grant = OAuthGrant {
        provider_id: "openai".to_string(),
        access_token: "tok-123".to_string(),
        token_type: "Bearer".to_string(),
        refresh_token: Some("ref-456".to_string()),
        expires_at: Some(9999999999),
    };
    let token = grant_to_oauth_token(&grant);
    assert_eq!(token.access_token, "tok-123");
    assert_eq!(token.provider, "openai");
    assert_eq!(token.refresh_token.as_deref(), Some("ref-456"));
    assert_eq!(token.expires_at, Some(9999999999));
}

#[test]
fn persist_grant_writes_to_store() {
    let home = tmp_home();
    let store = AuthStore::new(home.path());
    let grant = OAuthGrant {
        provider_id: "anthropic".to_string(),
        access_token: "anth-tok".to_string(),
        token_type: "Bearer".to_string(),
        refresh_token: None,
        expires_at: None,
    };
    persist_grant(&store, &grant).unwrap();
    let loaded = store.read().unwrap();
    let oauth = loaded.oauth_token.unwrap();
    assert_eq!(oauth.access_token, "anth-tok");
    assert_eq!(oauth.provider, "anthropic");
}

#[tokio::test]
async fn refresh_token_success_returns_new_grant() {
    let server = start_oauth_fixture_server(OAuthScenario::DeviceSuccess).await;
    let reg = ProviderRegistry::new();
    let mut config = reg.get("openai").unwrap().clone();
    let refresh_url = Box::leak(server.http_url().into_boxed_str());
    config.refresh_url = refresh_url;

    let client = reqwest::Client::new();
    let result = refresh_token(&client, &config, "old-refresh-token").await;
    let grant = result.unwrap();
    assert_eq!(grant.access_token, "test-token-abc123");
}

#[test]
fn credential_precedence_oauth_beats_env() {
    let home = tmp_home();
    let store = AuthStore::new(home.path());
    store
        .write(&AuthFile {
            api_key: None,
            oauth_token: Some(OAuthToken {
                access_token: "oauth-tok".to_string(),
                token_type: "Bearer".to_string(),
                refresh_token: None,
                expires_at: None,
                provider: "openai".to_string(),
            }),
        })
        .unwrap();
    std::env::set_var("LFG_TEST_OAUTH_PREC_ENV", "env-key");
    let cred = resolve_credential(None, home.path(), Some("LFG_TEST_OAUTH_PREC_ENV"));
    std::env::remove_var("LFG_TEST_OAUTH_PREC_ENV");
    assert_eq!(cred.source, CredentialSource::StoredOAuth);
    assert_eq!(cred.token, "oauth-tok");
}

#[test]
fn credential_precedence_api_key_beats_oauth() {
    let home = tmp_home();
    let store = AuthStore::new(home.path());
    store
        .write(&AuthFile {
            api_key: Some("api-key-wins".to_string()),
            oauth_token: Some(OAuthToken {
                access_token: "oauth-tok".to_string(),
                token_type: "Bearer".to_string(),
                refresh_token: None,
                expires_at: None,
                provider: "openai".to_string(),
            }),
        })
        .unwrap();
    let cred = resolve_credential(None, home.path(), None);
    assert_eq!(cred.source, CredentialSource::StoredApiKey);
    assert_eq!(cred.token, "api-key-wins");
}

#[test]
fn concurrent_writes_do_not_corrupt_store() {
    use std::sync::Arc;
    use std::thread;

    let home = tmp_home();
    let home_path = Arc::new(home.path().to_path_buf());

    let handles: Vec<_> = (0..8)
        .map(|i| {
            let path = Arc::clone(&home_path);
            thread::spawn(move || {
                let store = AuthStore::new(&path);
                let auth = AuthFile {
                    api_key: Some(format!("key-{}", i)),
                    oauth_token: None,
                };
                store.write(&auth).unwrap();
            })
        })
        .collect();

    for h in handles {
        h.join().unwrap();
    }

    let store = AuthStore::new(home.path());
    let loaded = store.read().unwrap();
    assert!(loaded.api_key.is_some());
    let key = loaded.api_key.unwrap();
    assert!(
        key.starts_with("key-"),
        "key should be one of key-N, got: {}",
        key
    );
}

#[test]
fn redact_removes_oauth_bearer_tokens() {
    let input = "Authorization: Bearer test-token-abc123 other stuff";
    let out = redact(input);
    assert!(!out.contains("test-token-abc123"));
    assert!(out.contains("[REDACTED]"));
}

#[test]
fn redact_removes_github_tokens() {
    let input = "token: ghp_realtoken123abc";
    let out = redact(input);
    assert!(!out.contains("realtoken123abc"));
    assert!(out.contains("[REDACTED]"));
}

#[test]
fn redact_removes_xai_tokens() {
    let input = r#"{"api_key": "xai-secretvalue"}"#;
    let out = redact(input);
    assert!(!out.contains("secretvalue"));
    assert!(out.contains("[REDACTED]"));
}

#[test]
fn contains_secret_detects_all_provider_patterns() {
    assert!(contains_secret("sk-openai-key"));
    assert!(contains_secret("xai-grok-key"));
    assert!(contains_secret("ghp_copilot_token"));
    assert!(contains_secret("gho_oauth_token"));
    assert!(contains_secret("github_pat_personal_token"));
    assert!(!contains_secret("no-secrets-here"));
    assert!(!contains_secret("Bearer test-token-abc123"));
}

#[test]
fn oauth_error_display_messages() {
    assert_eq!(
        OAuthError::AuthorizationPending.to_string(),
        "authorization_pending"
    );
    assert_eq!(OAuthError::SlowDown.to_string(), "slow_down");
    assert_eq!(OAuthError::ExpiredToken.to_string(), "expired_token");
    assert_eq!(OAuthError::AccessDenied.to_string(), "access_denied");
    assert_eq!(
        OAuthError::StateMismatch.to_string(),
        "state mismatch in PKCE callback"
    );
}
