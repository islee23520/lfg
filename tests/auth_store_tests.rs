use lfg::auth::credential::{resolve_credential, CredentialSource};
use lfg::auth::redact::{contains_secret, redact};
use lfg::auth::store::{AuthFile, AuthStore, OAuthToken};
use tempfile::TempDir;

fn tmp_home() -> TempDir {
    tempfile::tempdir().unwrap()
}

#[test]
fn auth_store_write_and_read_api_key() {
    let home = tmp_home();
    let store = AuthStore::new(home.path());
    let auth = AuthFile {
        api_key: Some("test-key-123".to_string()),
        oauth_token: None,
    };
    store.write(&auth).unwrap();
    let loaded = store.read().unwrap();
    assert_eq!(loaded.api_key.as_deref(), Some("test-key-123"));
}

#[test]
fn auth_store_write_and_read_oauth_token() {
    let home = tmp_home();
    let store = AuthStore::new(home.path());
    let auth = AuthFile {
        api_key: None,
        oauth_token: Some(OAuthToken {
            access_token: "tok-abc".to_string(),
            token_type: "Bearer".to_string(),
            refresh_token: Some("ref-xyz".to_string()),
            expires_at: Some(9999999999),
            provider: "mock".to_string(),
        }),
    };
    store.write(&auth).unwrap();
    let loaded = store.read().unwrap();
    let oauth = loaded.oauth_token.unwrap();
    assert_eq!(oauth.access_token, "tok-abc");
    assert_eq!(oauth.provider, "mock");
}

#[test]
fn auth_store_missing_file_returns_default() {
    let home = tmp_home();
    let store = AuthStore::new(home.path());
    let auth = store.read().unwrap();
    assert!(auth.api_key.is_none());
    assert!(auth.oauth_token.is_none());
}

#[cfg(unix)]
#[test]
fn auth_store_dir_mode_is_0700() {
    use std::os::unix::fs::PermissionsExt;
    let home = tmp_home();
    let store = AuthStore::new(home.path());
    store.init_dirs().unwrap();
    let meta = std::fs::metadata(store.auth_dir()).unwrap();
    let mode = meta.permissions().mode() & 0o777;
    assert_eq!(mode, 0o700, "auth dir must be 0700, got {:o}", mode);
}

#[cfg(unix)]
#[test]
fn auth_store_file_mode_is_0600() {
    use std::os::unix::fs::PermissionsExt;
    let home = tmp_home();
    let store = AuthStore::new(home.path());
    let auth = AuthFile {
        api_key: Some("k".to_string()),
        oauth_token: None,
    };
    store.write(&auth).unwrap();
    let meta = std::fs::metadata(store.auth_file()).unwrap();
    let mode = meta.permissions().mode() & 0o777;
    assert_eq!(mode, 0o600, "auth file must be 0600, got {:o}", mode);
}

#[test]
fn credential_precedence_runtime_override_wins() {
    let home = tmp_home();
    let store = AuthStore::new(home.path());
    store
        .write(&AuthFile {
            api_key: Some("stored-key".to_string()),
            oauth_token: None,
        })
        .unwrap();
    let cred = resolve_credential(Some("runtime-key"), home.path(), Some("XAI_API_KEY"));
    assert_eq!(cred.source, CredentialSource::RuntimeOverride);
    assert_eq!(cred.token, "runtime-key");
}

#[test]
fn credential_precedence_stored_api_key_beats_env() {
    let home = tmp_home();
    let store = AuthStore::new(home.path());
    store
        .write(&AuthFile {
            api_key: Some("stored-key".to_string()),
            oauth_token: None,
        })
        .unwrap();
    std::env::set_var("LFG_TEST_CRED_ENV_1", "env-key");
    let cred = resolve_credential(None, home.path(), Some("LFG_TEST_CRED_ENV_1"));
    std::env::remove_var("LFG_TEST_CRED_ENV_1");
    assert_eq!(cred.source, CredentialSource::StoredApiKey);
    assert_eq!(cred.token, "stored-key");
}

#[test]
fn credential_precedence_env_used_only_when_no_store() {
    let home = tmp_home();
    std::env::set_var("LFG_TEST_CRED_ENV_2", "env-only-key");
    let cred = resolve_credential(None, home.path(), Some("LFG_TEST_CRED_ENV_2"));
    std::env::remove_var("LFG_TEST_CRED_ENV_2");
    assert_eq!(cred.source, CredentialSource::EnvVar);
    assert_eq!(cred.token, "env-only-key");
}

#[test]
fn credential_precedence_none_when_nothing() {
    let home = tmp_home();
    let cred = resolve_credential(None, home.path(), None);
    assert_eq!(cred.source, CredentialSource::None);
    assert!(cred.token.is_empty());
}

#[test]
fn secret_redaction_removes_bearer_token() {
    let input = r#"Authorization: Bearer sk-abc123def"#;
    let out = redact(input);
    assert!(!out.contains("sk-abc123def"));
    assert!(out.contains("[REDACTED]"));
}

#[test]
fn secret_redaction_detects_secret_patterns() {
    assert!(contains_secret("sk-abc123"));
    assert!(contains_secret("xai-abc123"));
    assert!(contains_secret("ghp_abc123"));
    assert!(!contains_secret("hello world"));
}
