from __future__ import annotations

import json
from typing import Any, Dict, List


def task_is_pending(task: Dict[str, Any]) -> bool:
    return task.get("status") not in ("completed", "done")


def message_is_evidence(message: Dict[str, Any]) -> bool:
    return message.get("type") in ("evidence", "evidence_submission", "submit_evidence", "checkpoint")


def evidence_identity(message: Dict[str, Any]) -> str:
    for key in ("id", "ts", "timestamp", "created_at", "updated_at"):
        if message.get(key):
            return str(message.get(key))
    return json.dumps(message, ensure_ascii=False, sort_keys=True)[:500]


def progress_evidence_fingerprint(snapshot: Dict[str, Any]) -> str:
    parts: List[str] = []
    boulder = snapshot.get("boulder") or {}
    for evidence in boulder.get("recent_evidence", []) if isinstance(boulder.get("recent_evidence"), list) else []:
        if isinstance(evidence, dict):
            parts.append(evidence_identity(evidence))
        elif evidence:
            parts.append(str(evidence)[:500])
    for run in snapshot.get("active_runs", []) or []:
        for evidence in run.get("recent_evidence", []) or []:
            if isinstance(evidence, dict):
                parts.append(evidence_identity(evidence))
            elif evidence:
                parts.append(str(evidence)[:500])
    return "|".join(parts[-10:])
