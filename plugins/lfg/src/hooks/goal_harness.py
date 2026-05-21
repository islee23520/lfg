#!/usr/bin/env python3
# ruff: noqa: E402  # dynamic imports after sys.path bootstrap for spec_from_file_location
from __future__ import annotations

import io  # noqa: E402
import importlib  # noqa: E402
import os  # noqa: E402
import pathlib  # noqa: E402
import sys  # noqa: E402
from typing import Any, Dict


_HOOKS_DIR = pathlib.Path(__file__).resolve().parent
if str(_HOOKS_DIR) not in sys.path:
    sys.path.insert(0, str(_HOOKS_DIR))

_ambiguity_gate = importlib.import_module("ambiguity_gate")
_boulder_persistence = importlib.import_module("boulder_persistence")
_compaction_protection = importlib.import_module("compaction_protection")
_dispatch_gate = importlib.import_module("dispatch_gate")
_injection = importlib.import_module("injection")
_payload = importlib.import_module("payload")
_run_discovery = importlib.import_module("run_discovery")
_snapshot = importlib.import_module("snapshot")
_state_io = importlib.import_module("state_io")
_task_helpers = importlib.import_module("task_helpers")
_todo_continuation = importlib.import_module("todo_continuation")
_ralph_loop = importlib.import_module("ralph_loop")
_stop_continuation_guard = importlib.import_module("stop_continuation_guard")
compute_heuristic_ambiguity = _ambiguity_gate.compute_heuristic_ambiguity
persist_boulder_from_payload = _boulder_persistence.persist_boulder_from_payload
build_compaction_protection_injection = _compaction_protection.build_compaction_protection_injection
reserve_continuation_dispatch = _dispatch_gate.reserve_continuation_dispatch
build_aggressive_injection = _injection.build_aggressive_injection
write_injection_artifacts = _injection.write_injection_artifacts
detect_current_agent = _payload.detect_current_agent
extract_user_prompt_from_payload = _payload.extract_user_prompt_from_payload
find_active_runs = _run_discovery.find_active_runs
get_goal_snapshot = _snapshot.get_goal_snapshot
_boulder_path = _state_io.boulder_path
load_current_ultragoal = _state_io.load_current_ultragoal
read_json = _state_io.read_json
safe_child_path = _state_io.safe_child_path
validate_safe_id = _state_io.validate_safe_id
_read_boulder = _state_io.read_boulder
_write_boulder = _state_io.write_boulder
evidence_identity = _task_helpers.evidence_identity
message_is_evidence = _task_helpers.message_is_evidence
progress_evidence_fingerprint = _task_helpers.progress_evidence_fingerprint
task_is_pending = _task_helpers.task_is_pending
incomplete_todo_items = _todo_continuation.incomplete_todo_items
todo_continuation_reminder = _todo_continuation.todo_continuation_reminder
ralph_continuation_reminder = _ralph_loop.ralph_continuation_reminder
stop_continuation_guard = _stop_continuation_guard.stop_continuation_guard


_SOURCE_CONTRACT_STRINGS = (
    "You are Sisyphus",
    '"last_updated_by": "sisyphus"',
    'owner": "atlas | hephaestus | sisyphus"',
)


def boulder_path(ugid: str) -> pathlib.Path:
    return _boulder_path(ugid)


def read_boulder(ugid: str) -> Dict[str, Any]:
    return _read_boulder(ugid)


def write_boulder(ugid: str, boulder: Dict[str, Any]) -> None:
    _write_boulder(ugid, boulder)


def main() -> int:
    event = os.environ.get("GROK_HOOK_EVENT", os.environ.get("CLAUDE_HOOK_EVENT", "unknown"))
    os.environ.setdefault("LFG_LAUNCHER", "lfg")

    raw_payload = sys.stdin.read() if not sys.stdin.isatty() else ""
    sys.stdin = io.StringIO(raw_payload)

    snapshot = get_goal_snapshot()
    user_prompt = extract_user_prompt_from_payload()
    snapshot["current_agent"] = detect_current_agent(user_prompt)
    snapshot = persist_boulder_from_payload(raw_payload, snapshot)

    if not snapshot.get("has_durable_goal"):
        return 0

    injection = build_aggressive_injection(snapshot, user_prompt, event)
    dispatch_gate = reserve_continuation_dispatch(injection, snapshot, event)

    print(injection)
    print()

    meta = {
        "event": event,
        "timestamp": snapshot.get("timestamp"),
        "has_durable_goal": True,
        "ultragoal_id": (snapshot.get("ultragoal") or {}).get("id"),
        "current_agent": snapshot.get("current_agent"),
        "num_active_runs": len(snapshot.get("active_runs", [])),
        "boulder_auto_persisted_this_turn": bool(snapshot.get("boulder")),
        "todo_continuation_reminder": "[SYSTEM REMINDER - TODO CONTINUATION]" in injection,
        "ralph_continuation_reminder": "[SYSTEM REMINDER - RALPH LOOP CONTINUATION]" in injection,
        "stop_continuation_guard": "[SYSTEM REMINDER - STOP CONTINUATION GUARD]" in injection,
        "continuation_dispatch_gate": dispatch_gate,
        "recovery_hooks": [
            "todo-continuation",
            "ralph-loop",
            "stop-continuation-guard",
            "prometheus-markdown-only",
            "start-work-resumption",
            "provider-fallback-manual-gate",
            "evidence-recovery",
            "state-resumption",
            "agent-specific-behavior",
        ],
    }
    write_injection_artifacts(injection, meta)

    return 0


__all__ = [
    "boulder_path",
    "build_aggressive_injection",
    "build_compaction_protection_injection",
    "compute_heuristic_ambiguity",
    "evidence_identity",
    "extract_user_prompt_from_payload",
    "find_active_runs",
    "get_goal_snapshot",
    "incomplete_todo_items",
    "load_current_ultragoal",
    "main",
    "message_is_evidence",
    "progress_evidence_fingerprint",
    "read_boulder",
    "read_json",
    "reserve_continuation_dispatch",
    "safe_child_path",
    "task_is_pending",
    "todo_continuation_reminder",
    "ralph_continuation_reminder",
    "stop_continuation_guard",
    "validate_safe_id",
    "write_boulder",
    "write_injection_artifacts",
]


if __name__ == "__main__":
    sys.exit(main())
