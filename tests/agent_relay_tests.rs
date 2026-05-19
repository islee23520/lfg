use lfg::agent::relay::{AgentRelay, MockRelay, Relay, RelayMessage};
use serde_json::json;

#[tokio::test]
async fn mock_relay_starts_open() {
    let mock = MockRelay::new();
    assert!(mock.is_open());
}

#[tokio::test]
async fn mock_relay_send_stores_message() {
    let mock = MockRelay::new();
    let msg = RelayMessage::new("agent-1", json!({"text": "hello"}));
    mock.send(msg.clone()).await.unwrap();
    assert_eq!(mock.sent_count(), 1);
    let sent = mock.drain_sent();
    assert_eq!(sent[0], msg);
}

#[tokio::test]
async fn mock_relay_recv_returns_inbound() {
    let mock = MockRelay::new();
    let msg = RelayMessage::new("agent-2", json!({"cmd": "run"}));
    mock.push_inbound(msg.clone());
    let received = mock.recv().await;
    assert_eq!(received, Some(msg));
}

#[tokio::test]
async fn mock_relay_recv_empty_returns_none() {
    let mock = MockRelay::new();
    let received = mock.recv().await;
    assert!(received.is_none());
}

#[tokio::test]
async fn mock_relay_close_rejects_send() {
    let mock = MockRelay::new();
    mock.close().await;
    assert!(!mock.is_open());
    let msg = RelayMessage::new("agent-3", json!(null));
    let result = mock.send(msg).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn agent_relay_wraps_mock_send() {
    let mock = MockRelay::new();
    let relay = AgentRelay::new(mock.clone());
    let msg = RelayMessage::new("agent-4", json!({"x": 1}));
    relay.send(msg.clone()).await.unwrap();
    let sent = mock.drain_sent();
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].agent_id, "agent-4");
}

#[tokio::test]
async fn agent_relay_wraps_mock_recv() {
    let mock = MockRelay::new();
    let msg = RelayMessage::new("agent-5", json!({"y": 2}));
    mock.push_inbound(msg.clone());
    let relay = AgentRelay::new(mock);
    let received = relay.recv().await;
    assert_eq!(received, Some(msg));
}

#[tokio::test]
async fn agent_relay_is_open_delegates() {
    let mock = MockRelay::new();
    let relay = AgentRelay::new(mock);
    assert!(relay.is_open());
    relay.close().await;
    assert!(!relay.is_open());
}

#[tokio::test]
async fn relay_message_new_roundtrip() {
    let msg = RelayMessage::new("agent-6", json!({"key": "value"}));
    assert_eq!(msg.agent_id, "agent-6");
    assert_eq!(msg.payload["key"], "value");
}

#[tokio::test]
async fn mock_relay_multiple_inbound_fifo() {
    let mock = MockRelay::new();
    mock.push_inbound(RelayMessage::new("a", json!(1)));
    mock.push_inbound(RelayMessage::new("b", json!(2)));
    let first = mock.recv().await.unwrap();
    let second = mock.recv().await.unwrap();
    assert_eq!(first.agent_id, "a");
    assert_eq!(second.agent_id, "b");
}
