use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct RelayMessage {
    pub agent_id: String,
    pub payload: serde_json::Value,
}

impl RelayMessage {
    pub fn new(agent_id: impl Into<String>, payload: serde_json::Value) -> Self {
        Self {
            agent_id: agent_id.into(),
            payload,
        }
    }
}

#[async_trait::async_trait]
pub trait Relay: Send + Sync {
    async fn send(&self, msg: RelayMessage) -> anyhow::Result<()>;
    async fn recv(&self) -> Option<RelayMessage>;
    async fn close(&self);
    fn is_open(&self) -> bool;
}

pub struct AgentRelay {
    inner: Box<dyn Relay>,
}

impl AgentRelay {
    pub fn new(relay: impl Relay + 'static) -> Self {
        Self {
            inner: Box::new(relay),
        }
    }

    pub async fn send(&self, msg: RelayMessage) -> anyhow::Result<()> {
        self.inner.send(msg).await
    }

    pub async fn recv(&self) -> Option<RelayMessage> {
        self.inner.recv().await
    }

    pub async fn close(&self) {
        self.inner.close().await
    }

    pub fn is_open(&self) -> bool {
        self.inner.is_open()
    }
}

struct MockRelayState {
    sent: VecDeque<RelayMessage>,
    inbound: VecDeque<RelayMessage>,
    open: bool,
}

#[derive(Clone)]
pub struct MockRelay {
    state: Arc<Mutex<MockRelayState>>,
}

impl MockRelay {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(MockRelayState {
                sent: VecDeque::new(),
                inbound: VecDeque::new(),
                open: true,
            })),
        }
    }

    pub fn push_inbound(&self, msg: RelayMessage) {
        self.state.lock().unwrap().inbound.push_back(msg);
    }

    pub fn drain_sent(&self) -> Vec<RelayMessage> {
        self.state.lock().unwrap().sent.drain(..).collect()
    }

    pub fn sent_count(&self) -> usize {
        self.state.lock().unwrap().sent.len()
    }
}

impl Default for MockRelay {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl Relay for MockRelay {
    async fn send(&self, msg: RelayMessage) -> anyhow::Result<()> {
        let mut s = self.state.lock().unwrap();
        if !s.open {
            anyhow::bail!("relay is closed");
        }
        s.sent.push_back(msg);
        Ok(())
    }

    async fn recv(&self) -> Option<RelayMessage> {
        self.state.lock().unwrap().inbound.pop_front()
    }

    async fn close(&self) {
        self.state.lock().unwrap().open = false;
    }

    fn is_open(&self) -> bool {
        self.state.lock().unwrap().open
    }
}
