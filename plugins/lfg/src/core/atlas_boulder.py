#!/usr/bin/env python3
"""Dependency-free Atlas/Boulder plan-progress core."""

from __future__ import annotations

from typing import Any


def step_id(step: dict[str, Any]) -> str:
    return str(step.get("id"))


def completed_step_ids(plan: dict[str, Any], *, completion_statuses: set[str]) -> set[str]:
    return {
        step_id(step)
        for step in plan.get("steps", [])
        if str(step.get("status", "")).lower() in completion_statuses or step.get("status") in {"done", "completed"}
    }


def step_dependencies(step: dict[str, Any]) -> list[str]:
    deps = step.get("depends_on") or step.get("dependsOn") or step.get("dependencies") or []
    if isinstance(deps, str):
        return [dep.strip() for dep in deps.split(",") if dep.strip()]
    if isinstance(deps, list):
        return [str(dep) for dep in deps]
    return []


def progress(plan: dict[str, Any], *, completion_statuses: set[str]) -> dict[str, Any]:
    steps = plan.get("steps", [])
    completed = completed_step_ids(plan, completion_statuses=completion_statuses)
    total = len(steps)
    blocked = []
    next_task = None
    for step in steps:
        sid = step_id(step)
        status = str(step.get("status", "pending")).lower()
        if sid in completed:
            continue
        unresolved = [dep for dep in step_dependencies(step) if dep not in completed]
        if unresolved:
            blocked.append({"taskId": sid, "dependsOn": unresolved, "reason": "unresolved-dependency"})
            continue
        if status not in {"blocked", "cancelled"} and next_task is None:
            next_task = step
    return {
        "total": total,
        "completed": len(completed),
        "remaining": max(total - len(completed), 0),
        "percent": round((len(completed) / total) * 100, 2) if total else 100.0,
        "blocked": blocked,
        "nextTask": next_task,
    }


def delegate_record(plan: dict[str, Any], task: dict[str, Any] | None, wisdom: dict[str, str]) -> dict[str, Any] | None:
    if not task:
        return None
    return {
        "agent": "sisyphus-junior",
        "category": task.get("category") or "deep",
        "taskId": step_id(task),
        "task": task.get("text") or task.get("task") or task.get("objective"),
        "bounded": True,
        "atlasWritesImplementationCode": False,
        "instructions": (
            "Atlas delegates this bounded task; the worker must implement and return "
            "concrete evidenceArtifactPaths before Atlas can check it off."
        ),
        "wisdom": wisdom,
        "planId": plan.get("id"),
    }


def build_boulder(
    plan: dict[str, Any],
    *,
    progress_payload: dict[str, Any],
    session_id: str,
    existing: dict[str, Any],
    active_plan: str,
    now_value: str,
    notepads: dict[str, Any],
) -> dict[str, Any]:
    session_ids = list(existing.get("session_ids") or existing.get("sessions") or [])
    if session_id not in session_ids:
        session_ids.append(session_id)
    work_id = plan.get("id") or active_plan
    work_state = {
        "work_id": work_id,
        "active_plan": active_plan,
        "plan_name": plan.get("title") or plan["id"],
        "status": "complete" if progress_payload["remaining"] == 0 else "active",
        "started_at": existing.get("started_at") or now_value,
        "updated_at": now_value,
        "session_ids": session_ids,
        "session_origins": {},
        "agent": "atlas",
        "worktree_path": None,
        "task_sessions": {},
        "elapsed_ms": None,
    }
    return {
        "schema_version": 2,
        "active_work_id": work_id,
        "works": {work_id: work_state},
        "active_plan": active_plan,
        "started_at": existing.get("started_at") or now_value,
        "updated_at": now_value,
        "status": work_state["status"],
        "session_ids": session_ids,
        "plan_name": work_state["plan_name"],
        "progress": {key: value for key, value in progress_payload.items() if key != "nextTask"},
        "blockers": progress_payload["blocked"],
        "continuation_notes": existing.get("continuation_notes") or [],
        "next_task_id": step_id(progress_payload["nextTask"]) if progress_payload.get("nextTask") else None,
        "notepads": notepads,
        "recent_evidence": existing.get("recent_evidence") or [],
    }


def migrate_boulder(
    plan: dict[str, Any],
    existing: dict[str, Any],
    *,
    schema_version: int,
    active_plan: str,
    now_value: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not existing:
        return {}, {"status": "none", "from": None, "to": schema_version, "applied": False}
    previous = existing.get("schema_version") or existing.get("schemaVersion")
    if previous == schema_version:
        return existing, {"status": "current", "from": previous, "to": schema_version, "applied": False}
    migrated = dict(existing)
    migrated["schema_version"] = schema_version
    if "schemaVersion" in migrated:
        del migrated["schemaVersion"]
    migrated.setdefault("kind", "boulder-state")
    # ensure works structure for OMO parity
    if "works" not in migrated and "active_work_id" not in migrated:
        work_id = plan.get("id") or active_plan
        migrated["active_work_id"] = work_id
        migrated["works"] = {
            work_id: {
                "work_id": work_id,
                "active_plan": active_plan,
                "plan_name": plan.get("title") or plan["id"],
                "status": migrated.get("status", "active"),
                "started_at": migrated.get("started_at") or now_value,
                "updated_at": now_value,
                "session_ids": migrated.get("session_ids") or migrated.get("sessions") or [],
                "session_origins": {},
                "agent": "atlas",
                "worktree_path": None,
                "task_sessions": {},
                "elapsed_ms": None,
            }
        }
    migrated.setdefault("active_plan", active_plan)
    migrated["revision"] = int(migrated.get("revision", 0)) + 1
    migrated.setdefault("migrations", []).append(
        {
            "id": f"boulder-state-v{previous or 0}-to-v{schema_version}",
            "from": previous,
            "to": schema_version,
            "status": "applied",
            "ts": now_value,
        }
    )
    return migrated, {"status": "migrated", "from": previous, "to": schema_version, "applied": True}


__all__ = (
    "build_boulder",
    "completed_step_ids",
    "delegate_record",
    "migrate_boulder",
    "progress",
    "step_dependencies",
    "step_id",
)

