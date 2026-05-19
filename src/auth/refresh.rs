use anyhow::Context;
use std::collections::HashMap;

use crate::auth::provider::{OAuthError, OAuthGrant, ProviderConfig};
use crate::auth::store::{AuthStore, OAuthToken};

pub async fn refresh_token(
    client: &reqwest::Client,
    config: &ProviderConfig,
    refresh_token: &str,
) -> Result<OAuthGrant, OAuthError> {
    let mut params = HashMap::new();
    params.insert("grant_type", "refresh_token");
    params.insert("refresh_token", refresh_token);
    params.insert("client_id", config.client_id);

    let resp = client.post(config.refresh_url).form(&params).send().await?;

    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(OAuthError::Http)?;

    if !status.is_success() {
        let err = body["error"].as_str().unwrap_or("unknown").to_string();
        return Err(OAuthError::Other(anyhow::anyhow!(
            "refresh failed: {}",
            err
        )));
    }

    let access_token = body["access_token"]
        .as_str()
        .context("missing access_token")
        .map_err(OAuthError::Other)?
        .to_string();

    let token_type = body["token_type"].as_str().unwrap_or("Bearer").to_string();
    let new_refresh = body["refresh_token"]
        .as_str()
        .map(|s| s.to_string())
        .or_else(|| Some(refresh_token.to_string()));

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
        refresh_token: new_refresh,
        expires_at,
    })
}

pub fn is_token_expired(expires_at: Option<i64>, buffer_secs: i64) -> bool {
    match expires_at {
        None => false,
        Some(exp) => {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            now + buffer_secs >= exp
        }
    }
}

pub fn grant_to_oauth_token(grant: &OAuthGrant) -> OAuthToken {
    OAuthToken {
        access_token: grant.access_token.clone(),
        token_type: grant.token_type.clone(),
        refresh_token: grant.refresh_token.clone(),
        expires_at: grant.expires_at,
        provider: grant.provider_id.clone(),
    }
}

pub fn persist_grant(store: &AuthStore, grant: &OAuthGrant) -> anyhow::Result<()> {
    let mut auth = store.read()?;
    auth.oauth_token = Some(grant_to_oauth_token(grant));
    store.write(&auth)
}
