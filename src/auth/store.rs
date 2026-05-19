use anyhow::{Context, Result};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AuthFile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oauth_token: Option<OAuthToken>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthToken {
    pub access_token: String,
    pub token_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    pub provider: String,
}

pub struct AuthStore {
    auth_dir: PathBuf,
    auth_file: PathBuf,
}

impl AuthStore {
    pub fn new(home: &Path) -> Self {
        let auth_dir = home.join(".config").join("lfg");
        let auth_file = auth_dir.join("auth.json");
        Self {
            auth_dir,
            auth_file,
        }
    }

    pub fn init_dirs(&self) -> Result<()> {
        fs::create_dir_all(&self.auth_dir)
            .with_context(|| format!("create auth dir {:?}", self.auth_dir))?;
        #[cfg(unix)]
        {
            fs::set_permissions(&self.auth_dir, fs::Permissions::from_mode(0o700))?;
        }
        Ok(())
    }

    pub fn read(&self) -> Result<AuthFile> {
        if !self.auth_file.exists() {
            return Ok(AuthFile::default());
        }
        let data = fs::read_to_string(&self.auth_file)
            .with_context(|| format!("read auth file {:?}", self.auth_file))?;
        let auth: AuthFile = serde_json::from_str(&data).with_context(|| "parse auth.json")?;
        Ok(auth)
    }

    pub fn write(&self, auth: &AuthFile) -> Result<()> {
        self.init_dirs()?;
        let lock_path = self.auth_dir.join("auth.lock");
        let lock_file = fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&lock_path)
            .with_context(|| format!("open lock file {:?}", lock_path))?;
        lock_file
            .lock_exclusive()
            .with_context(|| "acquire exclusive lock")?;

        let tmp = self.auth_file.with_extension("json.tmp");
        let data = serde_json::to_string_pretty(auth)?;
        fs::write(&tmp, &data).with_context(|| format!("write tmp auth file {:?}", tmp))?;
        #[cfg(unix)]
        {
            fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600))?;
        }
        fs::rename(&tmp, &self.auth_file).with_context(|| "atomic rename auth.json")?;

        lock_file.unlock().ok();
        Ok(())
    }

    pub fn auth_dir(&self) -> &Path {
        &self.auth_dir
    }

    pub fn auth_file(&self) -> &Path {
        &self.auth_file
    }
}
