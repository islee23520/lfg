use crate::session::store::Session;
use anyhow::Result;

pub struct ShareResult {
    pub url: String,
    pub is_mock: bool,
}

pub fn share_session(session: &Session, endpoint: Option<&str>) -> Result<ShareResult> {
    let base = endpoint.unwrap_or("mock://local");
    let url = format!("{}/sessions/{}", base, session.id);
    Ok(ShareResult {
        url,
        is_mock: endpoint.is_none() || base.starts_with("mock://"),
    })
}
