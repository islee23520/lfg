use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub cwd: String,
    pub turns: Vec<Turn>,
    pub schema_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Turn {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub events: Vec<RuntimeEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeEvent {
    pub kind: String,
    pub data: serde_json::Value,
    pub timestamp: DateTime<Utc>,
}

impl Session {
    pub fn new(cwd: &str) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            created_at: now,
            updated_at: now,
            cwd: cwd.to_string(),
            turns: vec![],
            schema_version: 1,
        }
    }

    pub fn add_turn(&mut self, role: &str, content: &str) -> &Turn {
        let now = Utc::now();
        self.updated_at = now;
        self.turns.push(Turn {
            id: Uuid::new_v4().to_string(),
            role: role.to_string(),
            content: content.to_string(),
            timestamp: now,
            events: vec![],
        });
        self.turns.last().unwrap()
    }
}

pub struct SessionStore {
    dir: PathBuf,
}

impl SessionStore {
    pub fn new(home: &Path) -> Self {
        Self {
            dir: home.join(".config").join("lfg").join("sessions"),
        }
    }

    pub fn save(&self, session: &Session) -> Result<()> {
        fs::create_dir_all(&self.dir)?;
        let path = self.dir.join(format!("{}.json", session.id));
        let data = serde_json::to_string_pretty(session)?;
        fs::write(&path, data).with_context(|| format!("write session {:?}", path))?;
        Ok(())
    }

    pub fn load(&self, id: &str) -> Result<Session> {
        let path = self.dir.join(format!("{}.json", id));
        let data = fs::read_to_string(&path).with_context(|| format!("read session {:?}", path))?;
        let session: Session = serde_json::from_str(&data)?;
        Ok(session)
    }

    pub fn list(&self) -> Result<Vec<String>> {
        if !self.dir.exists() {
            return Ok(vec![]);
        }
        let mut ids = vec![];
        for entry in fs::read_dir(&self.dir)? {
            let entry = entry?;
            let name = entry.file_name();
            let s = name.to_string_lossy();
            if s.ends_with(".json") {
                ids.push(s.trim_end_matches(".json").to_string());
            }
        }
        Ok(ids)
    }
}
