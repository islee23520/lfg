use anyhow::{Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::collections::HashMap;

use crate::auth::provider::{OAuthError, OAuthGrant, ProviderConfig};

pub struct PkceParams {
    pub code_verifier: String,
    pub code_challenge: String,
    pub state: String,
}

pub fn generate_pkce_params() -> PkceParams {
    let mut verifier_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut verifier_bytes);
    let code_verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);

    let hash = Sha256::digest(code_verifier.as_bytes());
    let code_challenge = URL_SAFE_NO_PAD.encode(hash);

    let mut state_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut state_bytes);
    let state = URL_SAFE_NO_PAD.encode(state_bytes);

    PkceParams {
        code_verifier,
        code_challenge,
        state,
    }
}

fn url_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push('%');
                out.push_str(&format!("{:02X}", b));
            }
        }
    }
    out
}

pub fn build_authorization_url(
    config: &ProviderConfig,
    params: &PkceParams,
    redirect_uri: &str,
) -> String {
    let scopes = config.scopes.join(" ");
    format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256",
        config.auth_url,
        config.client_id,
        url_encode(redirect_uri),
        url_encode(&scopes),
        params.state,
        params.code_challenge,
    )
}

pub async fn exchange_code_for_token(
    client: &reqwest::Client,
    config: &ProviderConfig,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
    expected_state: &str,
    received_state: &str,
) -> Result<OAuthGrant, OAuthError> {
    if expected_state != received_state {
        return Err(OAuthError::StateMismatch);
    }

    let mut params = HashMap::new();
    params.insert("grant_type", "authorization_code");
    params.insert("code", code);
    params.insert("redirect_uri", redirect_uri);
    params.insert("client_id", config.client_id);
    params.insert("code_verifier", code_verifier);

    let resp = client.post(config.token_url).form(&params).send().await?;

    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(OAuthError::Http)?;

    if !status.is_success() {
        let err = body["error"].as_str().unwrap_or("unknown").to_string();
        return Err(OAuthError::Other(anyhow::anyhow!(
            "token exchange failed: {}",
            err
        )));
    }

    let access_token = body["access_token"]
        .as_str()
        .context("missing access_token")
        .map_err(OAuthError::Other)?
        .to_string();

    let token_type = body["token_type"].as_str().unwrap_or("Bearer").to_string();

    let refresh_token = body["refresh_token"].as_str().map(|s| s.to_string());

    let expires_at = body["expires_in"].as_i64().map(|secs| {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        now + secs
    });

    Ok(OAuthGrant {
        provider_id: config.id.to_string(),
        access_token,
        token_type,
        refresh_token,
        expires_at,
    })
}
