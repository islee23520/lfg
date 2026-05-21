# ruff: noqa: E402  # dynamic imports after sys.path bootstrap for spec_from_file_location
from __future__ import annotations

import json  # noqa: E402
import pathlib  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
from typing import Any, Dict, List


_HOOKS_DIR = pathlib.Path(__file__).resolve().parent
if str(_HOOKS_DIR) not in sys.path:
    sys.path.insert(0, str(_HOOKS_DIR))

from paths import todo_reminder_state  # noqa: E402
from state_io import read_json
from task_helpers import progress_evidence_fingerprint, task_is_pending


def incomplete_todo_items(snapshot: Dict[str, Any]) -> List[str]:
    items: List[str] = []
    boulder = snapshot.get("boulder") or {}
    for action in boulder.get("next_actions", []) if isinstance(boulder.get("next_actions"), list) else []:
        if isinstance(action, dict) and task_is_pending(action):
            label = action.get("goal") or action.get("text") or action.get("task") or action.get("id") or "pending boulder action"
            status = action.get("status") or "pending"
            items.append(f"- [ ] {label} ({status})")
    for run in snapshot.get("active_runs", []) or []:
        mode = run.get("mode", "run")
        for task in run.get("pending_tasks", []) or []:
            label = task.get("title") or task.get("task") or task.get("text") or task.get("id") or "pending task"
            status = task.get("status") or "pending"
            items.append(f"- [ ] [{mode}] {label} ({status})")
    return items[:8]


def todo_continuation_reminder(snapshot: Dict[str, Any], event: str) -> str:
    if event.lower() not in {"posttooluse", "stop", "precompact", "userpromptsubmit"}:
        return ""
    todos = incomplete_todo_items(snapshot)
    if not todos:
        return ""
    evidence_fp = progress_evidence_fingerprint(snapshot)
    if not evidence_fp:
        return ""
    pending_fp = "|".join(todos)
    state_path = todo_reminder_state()
    state = read_json(state_path, {}) or {}
    if state.get("pendingFingerprint") == pending_fp and state.get("evidenceFingerprint") == evidence_fp:
        return ""
    record = {
        "event": event,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pendingFingerprint": pending_fp,
        "evidenceFingerprint": evidence_fp,
        "todoCount": len(todos),
    }
    try:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception:
        return ""
    return """[SYSTEM REMINDER - TODO CONTINUATION]

You have incomplete todos and new progress evidence. Complete ALL before responding as finished:
%s

Do not claim completion until every todo is completed and backed by concrete evidenceArtifactPaths.
This reminder is bounded: it only reappears after new progress evidence changes.""" % "\n".join(todos)
