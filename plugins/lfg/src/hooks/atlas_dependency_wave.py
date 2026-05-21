from __future__ import annotations

import json
import importlib
import pathlib
import sys
import time
from typing import Any, Dict, List


_HOOKS_DIR = pathlib.Path(__file__).resolve().parent
if str(_HOOKS_DIR) not in sys.path:
    sys.path.insert(0, str(_HOOKS_DIR))

_paths = importlib.import_module("paths")
_state_io = importlib.import_module("state_io")
_task_helpers = importlib.import_module("task_helpers")
atlas_dependency_wave_state = _paths.atlas_dependency_wave_state
read_json = _state_io.read_json
progress_evidence_fingerprint = _task_helpers.progress_evidence_fingerprint
task_is_pending = _task_helpers.task_is_pending


def _task_id(task: Dict[str, Any]) -> str:
    return str(task.get("id") or task.get("taskId") or task.get("task_id") or task.get("title") or "task")


def _task_label(task: Dict[str, Any]) -> str:
    return str(task.get("title") or task.get("goal") or task.get("task") or task.get("text") or _task_id(task))


def _dependencies(task: Dict[str, Any]) -> List[str]:
    deps = task.get("depends_on") or task.get("dependsOn") or task.get("dependencies") or []
    if isinstance(deps, str):
        return [item.strip() for item in deps.replace(",", ";").split(";") if item.strip()]
    if isinstance(deps, list):
        return [str(item) for item in deps if str(item).strip()]
    return []


def atlas_dependency_wave_items(snapshot: Dict[str, Any]) -> List[str]:
    if str(snapshot.get("current_agent") or "").lower() != "atlas":
        return []

    items: List[str] = []
    for run in snapshot.get("active_runs", []) or []:
        tasks = [task for task in run.get("tasks", []) or [] if isinstance(task, dict)]
        done = {_task_id(task) for task in tasks if not task_is_pending(task)}
        ready: List[str] = []
        blocked: List[str] = []
        for task in tasks:
            if not task_is_pending(task):
                continue
            deps = _dependencies(task)
            missing = [dep for dep in deps if dep not in done]
            label = f"{_task_id(task)}: {_task_label(task)}"
            if missing:
                blocked.append(f"blocked {label} (waiting on {', '.join(missing)})")
            else:
                ready.append(f"ready {label}")
        if ready or blocked:
            items.append(f"[{run.get('mode', 'run')}] " + "; ".join((ready + blocked)[:5]))

    boulder = snapshot.get("boulder") or {}
    atlas_actions = [
        action for action in boulder.get("next_actions", []) or []
        if isinstance(action, dict)
        and str(action.get("owner", "")).lower() == "atlas"
        and task_is_pending(action)
    ]
    for action in atlas_actions[:3]:
        deps = _dependencies(action)
        suffix = f" deps={', '.join(deps)}" if deps else " no deps"
        items.append(f"[boulder] ready {_task_id(action)}: {_task_label(action)} ({action.get('status', 'pending')};{suffix})")

    return items[:8]


def atlas_dependency_wave_reminder(snapshot: Dict[str, Any], event: str) -> str:
    if event.lower() not in {"posttooluse", "stop", "precompact", "userpromptsubmit"}:
        return ""
    items = atlas_dependency_wave_items(snapshot)
    if not items:
        return ""
    evidence_fp = progress_evidence_fingerprint(snapshot) or "atlas-wave:no-evidence-yet"
    pending_fp = "|".join(items)
    state_path = atlas_dependency_wave_state()
    state = read_json(state_path, {}) or {}
    if state.get("pendingFingerprint") == pending_fp and state.get("evidenceFingerprint") == evidence_fp:
        return ""
    record = {
        "event": event,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pendingFingerprint": pending_fp,
        "evidenceFingerprint": evidence_fp,
        "waveItemCount": len(items),
    }
    try:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception:
        return ""
    return """[SYSTEM REMINDER - ATLAS DEPENDENCY WAVE]

You are Atlas and dependency-wave work is still open. Execute only unblocked ready items, keep blocked items blocked,
update checkboxes with evidence, and do not mark the wave complete until every ready item is verified:
%s

This reminder is bounded by the dependency-wave fingerprint.""" % "\n".join(f"- {item}" for item in items)
