use std::path::PathBuf;
use tempfile::TempDir;

pub struct TestHome {
    pub dir: TempDir,
}

impl TestHome {
    pub fn new() -> anyhow::Result<Self> {
        let dir = tempfile::tempdir()?;
        Ok(Self { dir })
    }

    pub fn path(&self) -> PathBuf {
        self.dir.path().to_path_buf()
    }

    pub fn grok_dir(&self) -> PathBuf {
        self.dir.path().join(".grok")
    }

    pub fn auth_dir(&self) -> PathBuf {
        self.dir.path().join(".grok").join("auth")
    }

    pub fn auth_file(&self) -> PathBuf {
        self.auth_dir().join("auth.json")
    }
}
