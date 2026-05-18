use anyhow::Context;
use std::collections::HashMap;
use std::time::Duration;

use crate::auth::provider::{OAuthError, OAuthGrant, ProviderConfig};

#[derive(Debug, Clone)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

pub async fn request_device_code(
    client: &reqwest::Client,
    config: &ProviderConfig,
) -> Result<DeviceCode, OAuthError> {
    let mut params = HashMap::new();
    params.insert("client_id", config.client_id);
    let scopes = config.scopes.join(" ");
    params.insert("scope", &scopes);

    let resp = client.post(config.auth_url).form(&params).send().await?;

    let body: serde_json::Value = resp.json().await.map_err(OAuthError::Http)?;

    let device_code = body["device_code"]
        .as_str()
        .context("missing device_code")
        .map_err(OAuthError::Other)?
        .to_string();

    let user_code = body["user_code"]
        .as_str()
        .context("missing user_code")
        .map_err(OAuthError::Other)?
        .to_string();

    let verification_uri = body["verification_uri"]
        .as_str()
        .or_else(|| body["verification_url"].as_str())
        .context("missing verification_uri")
        .map_err(OAuthError::Other)?
        .to_string();

    let expires_in = body["expires_in"].as_u64().unwrap_or(900);
    let interval = body["interval"].as_u64().unwrap_or(5);

    Ok(DeviceCode {
        device_code,
        user_code,
        verification_uri,
        expires_in,
        interval,
    })
}

pub async fn poll_device_token(
    client: &reqwest::Client,
    config: &ProviderConfig,
    device_code: &DeviceCode,
) -> Result<OAuthGrant, OAuthError> {
    let deadline = std::time::Instant::now() + Duration::from_secs(device_code.expires_in);
    let mut interval_secs = device_code.interval;

    loop {
        if std::time::Instant::now() >= deadline {
            return Err(OAuthError::ExpiredToken);
        }

        tokio::time::sleep(Duration::from_secs(interval_secs)).await;

        let mut params = HashMap::new();
        params.insert("grant_type", "urn:ietf:params:oauth:grant-type:device_code");
        params.insert("device_code", &device_code.device_code);
        params.insert("client_id", config.client_id);

        let resp = client.post(config.token_url).form(&params).send().await?;

        let body: serde_json::Value = resp.json().await.map_err(OAuthError::Http)?;

        if let Some(err) = body["error"].as_str() {
            match err {
                "authorization_pending" => continue,
                "slow_down" => {
                    interval_secs += 5;
                    continue;
                }
                "expired_token" => return Err(OAuthError::ExpiredToken),
                "access_denied" => return Err(OAuthError::AccessDenied),
                other => {
                    return Err(OAuthError::Other(anyhow::anyhow!(
                        "device poll error: {}",
                        other
                    )));
                }
            }
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

        return Ok(OAuthGrant {
            provider_id: config.id.to_string(),
            access_token,
            token_type,
            refresh_token,
            expires_at,
        });
    }
}
