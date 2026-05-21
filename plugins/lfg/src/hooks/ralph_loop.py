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

from paths import ralph_current_path, ralph_state_dir  # noqa: E402
from state_io import read_json
from task_helpers import progress_evidence_fingerprint


def active_ralph_loops() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    current = read_json(ralph_current_path(), {}) or {}
    rid = current.get("id")
    if rid:
        rpath = ralph_state_dir() / f"{rid}.json"
        record = read_json(rpath, {}) or {}
        if record.get("status") in ("active", "running", None):
            obj = record.get("objective", "ralph objective")
            it = record.get("iteration", 0)
            max_it = record.get("maxIterations", 0)
            items.append({
                "id": rid,
                "objective": obj,
                "iteration": it,
                "maxIterations": max_it,
                "status": record.get("status", "active"),
            })
    return items[:3]


def ralph_continuation_reminder(snapshot: Dict[str, Any], event: str) -> str:
    if event.lower() not in {"posttooluse", "stop", "precompact", "userpromptsubmit"}:
        return ""
    ralphs = active_ralph_loops()
    if not ralphs:
        return ""
    evidence_fp = progress_evidence_fingerprint(snapshot)
    if not evidence_fp:
        return ""
    first = ralphs[0]
    pending_fp = f"{first['id']}:{first['iteration']}"
    state_path = ralph_current_path().parent / "ralph-continuation.json"
    state = read_json(state_path, {}) or {}
    if state.get("pendingFingerprint") == pending_fp and state.get("evidenceFingerprint") == evidence_fp:
        return ""
    record = {
        "event": event,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pendingFingerprint": pending_fp,
        "evidenceFingerprint": evidence_fp,
        "ralphCount": len(ralphs),
    }
    try:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception:
        return ""
    lines = [f"- [ ] Ralph {r['id']}: {r['objective']} (iter {r['iteration']}/{r['maxIterations']}, {r['status']})" for r in ralphs]
    return """[SYSTEM REMINDER - RALPH LOOP CONTINUATION]

Active Ralph persistence loop(s) detected. Continue iterating until stop condition or max iterations:
%s

Do not stop the loop prematurely. Verify each step with evidence before advancing or claiming done.
This reminder is bounded: it only reappears after new progress evidence changes.""" % "\n".join(lines)
