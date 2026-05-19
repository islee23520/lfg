use lfg::session::share::share_session;
use lfg::session::store::{Session, SessionStore};
use lfg::session::trace::export_trace;
use tempfile::TempDir;

fn tmp_home() -> TempDir {
    tempfile::tempdir().unwrap()
}

#[test]
fn session_roundtrip_save_and_load() {
    let home = tmp_home();
    let store = SessionStore::new(home.path());
    let mut session = Session::new("/tmp/project");
    session.add_turn("user", "hello");
    session.add_turn("assistant", "hi there");
    store.save(&session).unwrap();

    let loaded = store.load(&session.id).unwrap();
    assert_eq!(loaded.id, session.id);
    assert_eq!(loaded.turns.len(), 2);
    assert_eq!(loaded.turns[0].role, "user");
    assert_eq!(loaded.turns[1].content, "hi there");
}

#[test]
fn session_list_returns_saved_ids() {
    let home = tmp_home();
    let store = SessionStore::new(home.path());
    let s1 = Session::new("/tmp/a");
    let s2 = Session::new("/tmp/b");
    store.save(&s1).unwrap();
    store.save(&s2).unwrap();

    let ids = store.list().unwrap();
    assert!(ids.contains(&s1.id));
    assert!(ids.contains(&s2.id));
}

#[test]
fn session_list_empty_when_no_sessions() {
    let home = tmp_home();
    let store = SessionStore::new(home.path());
    let ids = store.list().unwrap();
    assert!(ids.is_empty());
}

#[test]
fn trace_export_contains_runtime_events() {
    let mut session = Session::new("/tmp/project");
    session.add_turn("user", "hello");
    session.add_turn("assistant", "world");

    let trace = export_trace(&session).unwrap();
    assert_eq!(trace["session_id"], session.id);
    assert_eq!(trace["turn_count"], 2);
    assert!(trace["turns"].is_array());
}

#[test]
fn trace_export_redacts_credentials() {
    let mut session = Session::new("/tmp/project");
    session.add_turn("user", "my key is sk-abc123");

    let trace = export_trace(&session).unwrap();
    let turns = trace["turns"].as_array().unwrap();
    let content = turns[0]["content"].as_str().unwrap();
    assert!(!content.contains("sk-abc123"), "secret must be redacted");
    assert!(content.contains("[REDACTED]"));
}

#[test]
fn trace_export_is_deterministic() {
    let mut session = Session::new("/tmp/project");
    session.add_turn("user", "hello");

    let t1 = export_trace(&session).unwrap();
    let t2 = export_trace(&session).unwrap();
    assert_eq!(t1.to_string(), t2.to_string());
}

#[test]
fn share_mock_endpoint_marks_is_mock() {
    let session = Session::new("/tmp/project");
    let result = share_session(&session, None).unwrap();
    assert!(result.is_mock);
    assert!(result.url.contains(&session.id));
}

#[test]
fn share_custom_endpoint_uses_provided_url() {
    let session = Session::new("/tmp/project");
    let result = share_session(&session, Some("https://share.example.com")).unwrap();
    assert!(!result.is_mock);
    assert!(result.url.starts_with("https://share.example.com"));
}
