use crate::auth::redact::redact;
use crate::session::store::Session;
use anyhow::Result;
use serde_json::Value;

pub fn export_trace(session: &Session) -> Result<Value> {
    let turns: Vec<Value> = session
        .turns
        .iter()
        .map(|t| {
            serde_json::json!({
                "id": t.id,
                "role": t.role,
                "content": redact(&t.content),
                "timestamp": t.timestamp,
                "events": t.events.len(),
            })
        })
        .collect();

    Ok(serde_json::json!({
        "session_id": session.id,
        "schema_version": session.schema_version,
        "created_at": session.created_at,
        "cwd": session.cwd,
        "turn_count": session.turns.len(),
        "turns": turns,
    }))
}
