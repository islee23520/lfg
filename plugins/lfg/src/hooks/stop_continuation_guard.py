# ruff: noqa: E402  # dynamic imports after sys.path bootstrap for spec_from_file_location
from __future__ import annotations

import json  # noqa: E402
import pathlib  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
from typing import Any, Dict


_HOOKS_DIR = pathlib.Path(__file__).resolve().parent
if str(_HOOKS_DIR) not in sys.path:
    sys.path.insert(0, str(_HOOKS_DIR))

from paths import stop_guard_state  # noqa: E402
from state_io import read_json
from task_helpers import progress_evidence_fingerprint
from todo_continuation import incomplete_todo_items
from ralph_loop import active_ralph_loops


def should_guard_stop(snapshot: Dict[str, Any], event: str) -> bool:
    if event.lower() != "stop":
        return False
    todos = incomplete_todo_items(snapshot)
    ralphs = active_ralph_loops()
    boulder = snapshot.get("boulder") or {}
    has_active_boulder = bool(boulder.get("next_actions") or boulder.get("goal"))
    return bool(todos or ralphs or has_active_boulder)


def stop_continuation_guard(snapshot: Dict[str, Any], event: str) -> str:
    if not should_guard_stop(snapshot, event):
        return ""
    evidence_fp = progress_evidence_fingerprint(snapshot)
    if not evidence_fp:
        return ""
    todos = incomplete_todo_items(snapshot)
    ralphs = active_ralph_loops()
    state_path = stop_guard_state()
    state = read_json(state_path, {}) or {}
    pending_fp = f"todos:{len(todos)}|ralph:{len(ralphs)}"
    if state.get("pendingFingerprint") == pending_fp and state.get("evidenceFingerprint") == evidence_fp:
        return ""
    record = {
        "event": event,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pendingFingerprint": pending_fp,
        "evidenceFingerprint": evidence_fp,
        "guarded": True,
    }
    try:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception:
        return ""
    guard_lines = []
    if todos:
        guard_lines.append("Incomplete todos remain - complete them before stopping.")
    if ralphs:
        guard_lines.append("Active Ralph loop(s) in progress - do not terminate the persistence loop.")
    if not todos and not ralphs:
        guard_lines.append("Active Boulder with pending work - verify completion evidence first.")
    return """[SYSTEM REMINDER - STOP CONTINUATION GUARD]

STOP event detected while durable work is active.
%s

Do NOT claim session complete or allow stop until all pending items have concrete evidenceArtifactPaths and status=complete.
This guard enforces OMO-style never-stops persistence for continuation hooks.""" % "\n".join(guard_lines)
