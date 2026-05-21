# ruff: noqa: E402  # dynamic imports after sys.path bootstrap for spec_from_file_location
from __future__ import annotations

import hashlib  # noqa: E402
import importlib.util  # noqa: E402
import os  # noqa: E402
import pathlib  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
from typing import Any, Dict


_HOOKS_DIR = pathlib.Path(__file__).resolve().parent
if str(_HOOKS_DIR) not in sys.path:
    sys.path.insert(0, str(_HOOKS_DIR))

from paths import dispatch_gate_dir, plugin_root  # noqa: E402
from task_helpers import progress_evidence_fingerprint
from todo_continuation import incomplete_todo_items


def reserve_continuation_dispatch(injection: str, snapshot: Dict[str, Any], event: str) -> Dict[str, Any]:
    try:
        path = plugin_root() / "src" / "runtime" / "dispatch_gate.py"
        spec = importlib.util.spec_from_file_location("_lfg_hook_dispatch_gate", path)
        if spec is None or spec.loader is None:
            return {"ok": False, "status": "manual_gate_unavailable", "error": "dispatch gate module unavailable"}
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        ultragoal = snapshot.get("ultragoal") or {}
        boulder = snapshot.get("boulder") or {}
        evidence_hash = hashlib.sha256(progress_evidence_fingerprint(snapshot).encode("utf-8")).hexdigest()[:12]
        return module.reserve_dispatch_gate(
            dispatch_root=dispatch_gate_dir(),
            session_id=os.environ.get("GROK_SESSION_ID") or os.environ.get("OPENCODE_SESSION_ID") or os.environ.get("CLAUDE_SESSION_ID") or "hook-session",
            plan_id=str(ultragoal.get("id") or "no-active-ultragoal"),
            boulder_version=str(boulder.get("schema_version") or boulder.get("schemaVersion") or boulder.get("version") or 1),
            reason=f"hook:{event}:{evidence_hash}",
            target_agent="sisyphus",
            prompt=injection,
            state_snapshot={
                "event": event,
                "ultragoalId": ultragoal.get("id"),
                "hasDurableGoal": bool(snapshot.get("has_durable_goal")),
                "todoContinuationReminder": "[SYSTEM REMINDER - TODO CONTINUATION]" in injection,
                "pendingItems": incomplete_todo_items(snapshot),
            },
            native_dispatch_supported=False,
            now_value=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        )
    except Exception as exc:
        return {"ok": False, "status": "manual_gate_unavailable", "error": str(exc)[:200]}
