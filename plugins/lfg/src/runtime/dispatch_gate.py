#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import time
from typing import Any


TERMINAL_STATUSES = {"dispatched", "manual_gate_required", "cancelled", "failed"}


def dispatch_key(*, session_id: str, plan_id: str, boulder_version: str, reason: str, target_agent: str) -> str:
    material = "\x1f".join([session_id, plan_id, boulder_version, reason, target_agent])
    return f"dispatch-{hashlib.sha256(material.encode('utf-8')).hexdigest()[:24]}"


def _dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)


def _read(path: pathlib.Path) -> dict[str, Any]:
    for _ in range(50):
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            time.sleep(0.01)
    return json.loads(path.read_text(encoding="utf-8"))


def _response(record: dict[str, Any], *, path: pathlib.Path, key: str, duplicate: bool) -> dict[str, Any]:
    return {
        "ok": True,
        "decision": "duplicate_suppressed" if duplicate else "continue",
        "dispatch": record.get("dispatch", record.get("status")),
        "status": record.get("status"),
        "dispatchKey": key,
        "artifactPath": str(path),
        "duplicateSuppressed": duplicate,
        "terminal": record.get("status") in TERMINAL_STATUSES,
        "manualGateRequired": bool(record.get("manualGateRequired")),
        "nativeDispatchSupported": bool(record.get("nativeDispatchSupported")),
        "prompt": record.get("prompt", ""),
        "stateSnapshot": record.get("stateSnapshot", {}),
        "evidence": list(record.get("evidence") or ["continuation-gate=ok"]),
    }


def reserve_dispatch_gate(
    *,
    dispatch_root: pathlib.Path,
    session_id: str,
    plan_id: str,
    boulder_version: str,
    reason: str,
    target_agent: str,
    prompt: str,
    state_snapshot: dict[str, Any],
    native_dispatch_supported: bool,
    now_value: str,
) -> dict[str, Any]:
    key = dispatch_key(
        session_id=session_id,
        plan_id=plan_id,
        boulder_version=boulder_version,
        reason=reason,
        target_agent=target_agent,
    )
    dispatch_root.mkdir(parents=True, exist_ok=True)
    path = dispatch_root / f"{key}.json"
    existing = _read(path)
    if existing:
        return _response(existing, path=path, key=key, duplicate=True)

    status = "dispatched" if native_dispatch_supported else "manual_gate_required"
    record = {
        "schemaVersion": 1,
        "kind": "lfg-continuation-dispatch-gate",
        "dispatchKey": key,
        "status": status,
        "dispatch": status,
        "sessionId": session_id,
        "planId": plan_id,
        "boulderVersion": boulder_version,
        "reason": reason,
        "targetAgent": target_agent,
        "prompt": prompt,
        "stateSnapshot": state_snapshot,
        "nativeDispatchSupported": bool(native_dispatch_supported),
        "manualGateRequired": not native_dispatch_supported,
        "createdAt": now_value,
        "updatedAt": now_value,
        "terminal": status in TERMINAL_STATUSES,
        "evidence": ["continuation-gate=ok"],
    }
    tmp_path = dispatch_root / f".{key}.{os.getpid()}.{id(record)}.tmp"
    tmp_path.write_text(_dump(record) + "\n", encoding="utf-8")
    try:
        os.link(tmp_path, path)
    except FileExistsError:
        return _response(_read(path), path=path, key=key, duplicate=True)
    finally:
        try:
            tmp_path.unlink()
        except FileNotFoundError:
            pass
    return _response(record, path=path, key=key, duplicate=False)


__all__ = ("TERMINAL_STATUSES", "dispatch_key", "reserve_dispatch_gate")
