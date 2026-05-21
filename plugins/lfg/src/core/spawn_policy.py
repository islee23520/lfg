#!/usr/bin/env python3
"""Dependency-free spawn envelope and supervision broker policy core."""

from __future__ import annotations

import re
import uuid
from typing import Any, Callable

Redacter = Callable[[Any], Any]
ArtifactWriter = Callable[[str, str, dict[str, Any]], str]
EvidenceGateValidator = Callable[[dict[str, Any]], list[str]]


def native_spawn_requested(kwargs: dict[str, Any]) -> bool:
    requested_mode = str(kwargs.get("mode") or kwargs.get("spawn_mode") or "fallback")
    return requested_mode in {"native", "native-grok", "grok-native"} or bool(kwargs.get("native"))


def native_spawn_manual_gate_available(kwargs: dict[str, Any], *, spawn_subagent_available: bool) -> bool:
    gate = kwargs.get("manual_gate_evidence") or kwargs.get("manualGateEvidence")
    return bool(gate) and spawn_subagent_available


def fallback_manual_gate_required(
    model_profile: dict[str, Any] | None,
    kwargs: dict[str, Any],
    *,
    canonical_model_provider: Callable[[str], str],
) -> bool:
    provider = canonical_model_provider(str((model_profile or {}).get("provider") or kwargs.get("provider") or "xai"))
    return native_spawn_requested(kwargs) or provider in {"xai", "grok"}


def supervision_broker_decision(
    *,
    operation: str,
    lane: str,
    model_profile: dict[str, Any] | None,
    evidence_class: str,
    reason: str,
    allowed: bool = True,
    policy: str = "omo-policy",
    depth: int = 0,
    max_depth: int,
    broker_api: str,
    broker_version: int,
) -> dict[str, Any]:
    return {
        "api": broker_api,
        "version": broker_version,
        "operation": operation,
        "selectedLane": lane,
        "modelProfile": dict(model_profile or {}),
        "evidenceClass": evidence_class,
        "policyDecision": {
            "allowed": bool(allowed),
            "policy": policy,
            "reason": reason,
        },
        "lease": {
            "depth": int(depth),
            "maxDepth": int(max_depth),
            "recursionControlled": int(depth) <= int(max_depth),
        },
    }


def canonical_spawn_envelope(
    *,
    operation: str,
    status: str,
    ok: bool,
    mode: str,
    agent_id: str | None,
    category: str | None,
    task: str | None,
    task_id: str | None,
    run_id: str | None,
    parent_run_id: str | None,
    model_profile: dict[str, Any] | None,
    model_resolution: dict[str, Any] | None,
    children: list[dict[str, Any]] | None,
    blockers: list[Any] | None,
    touched_files: list[str] | None,
    evidence: list[Any] | str | None,
    evidence_class: str,
    broker_decision: dict[str, Any] | None,
    debug: dict[str, Any] | None,
    next_tasks: list[Any] | None,
    manual_gate_required: bool | None,
    spawn_envelope_schema_version: int,
    spawn_envelope_statuses: set[str],
    spawn_envelope_modes: set[str],
    spawn_envelope_evidence_classes: set[str],
    completion_statuses: set[str],
    grok_oracle_review: dict[str, Any],
    redacter: Redacter,
    artifact_writer: ArtifactWriter | None,
    default_broker_decision: Callable[[str, dict[str, Any], str], dict[str, Any]],
) -> dict[str, Any]:
    if status not in spawn_envelope_statuses:
        raise ValueError(f"invalid spawn envelope status: {status}")
    if mode not in spawn_envelope_modes:
        raise ValueError(f"invalid spawn envelope mode: {mode}")
    if evidence_class not in spawn_envelope_evidence_classes:
        raise ValueError(f"invalid evidence class: {evidence_class}")

    normalized_evidence: list[Any]
    if evidence is None:
        normalized_evidence = []
    elif isinstance(evidence, list):
        normalized_evidence = [redacter(item) for item in evidence]
    else:
        normalized_evidence = [redacter(evidence)]

    resolved_task_id = task_id or f"task-{uuid.uuid4().hex[:8]}"
    resolved_run_id = run_id or f"run-{uuid.uuid4().hex[:12]}"
    artifact_paths: list[str] = []
    if status in completion_statuses and ok and artifact_writer is not None:
        artifact_paths.append(
            artifact_writer(
                resolved_run_id,
                "envelope",
                {
                    "operation": operation,
                    "status": status,
                    "taskId": resolved_task_id,
                    "runId": resolved_run_id,
                    "proof": "canonical result envelope emitted by runtime, not model prose",
                    "evidence": normalized_evidence,
                },
            )
        )

    manual_gate = bool(manual_gate_required) if manual_gate_required is not None else evidence_class == "real-grok-manual-gate"
    actual_child_execution = mode == "native-grok" and evidence_class == "real-grok-manual-gate" and not manual_gate
    completion_meaning = "child-execution-completed" if actual_child_execution else "contract-envelope-completed"

    envelope = {
        "ok": bool(ok),
        "schemaVersion": spawn_envelope_schema_version,
        "operation": operation,
        "mode": mode,
        "status": status,
        "execution": {
            "adapterMode": mode,
            "contractStatus": status,
            "completionMeaning": completion_meaning,
            "actualChildExecution": actual_child_execution,
            "nativeGrokSpawnVerified": actual_child_execution,
        },
        "agent": agent_id,
        "agentId": agent_id,
        "category": category,
        "task": task,
        "taskId": resolved_task_id,
        "runId": resolved_run_id,
        "parentRunId": parent_run_id,
        "children": children or [],
        "blockers": blockers or [],
        "touchedFiles": touched_files or [],
        "evidence": normalized_evidence,
        "evidenceArtifactPaths": artifact_paths,
        "evidenceArtifacts": artifact_paths,
        "evidenceClass": evidence_class,
        "broker": redacter(
            broker_decision
            or default_broker_decision(
                operation,
                model_profile or {},
                evidence_class,
            )
        ),
        "modelProfile": model_profile or {},
        "modelResolution": model_resolution or {},
        "nextTasks": next_tasks or [],
        "oracleReview": dict(grok_oracle_review),
        "debug": redacter(debug or {}),
    }
    envelope["agent_id"] = envelope["agentId"]
    envelope["task_id"] = envelope["taskId"]
    envelope["run_id"] = envelope["runId"]
    envelope["model_profile"] = envelope["modelProfile"]
    envelope["touched_files"] = envelope["touchedFiles"]
    envelope["manual_gate_required"] = manual_gate
    return envelope


def validate_spawn_envelope(
    envelope: dict[str, Any],
    *,
    spawn_envelope_schema_version: int,
    spawn_envelope_statuses: set[str],
    spawn_envelope_modes: set[str],
    spawn_envelope_evidence_classes: set[str],
    broker_api: str,
    validate_evidence_gate: EvidenceGateValidator,
) -> list[str]:
    errors: list[str] = []
    required = {
        "ok",
        "schemaVersion",
        "operation",
        "mode",
        "status",
        "children",
        "blockers",
        "touchedFiles",
        "evidence",
        "evidenceClass",
        "broker",
        "modelProfile",
        "runId",
        "taskId",
        "oracleReview",
        "debug",
        "evidenceArtifactPaths",
        "execution",
    }
    missing = sorted(required - set(envelope))
    if missing:
        errors.append(f"missing required keys: {', '.join(missing)}")
    if envelope.get("schemaVersion") != spawn_envelope_schema_version:
        errors.append("schemaVersion mismatch")
    if envelope.get("mode") not in spawn_envelope_modes:
        errors.append("mode must be native-grok or fallback")
    if envelope.get("status") not in spawn_envelope_statuses:
        errors.append("status must be completed, blocked, or failed")
    execution = envelope.get("execution")
    if not isinstance(execution, dict):
        errors.append("execution must describe contract vs actual child execution")
    else:
        if execution.get("contractStatus") != envelope.get("status"):
            errors.append("execution.contractStatus must match status")
        if execution.get("adapterMode") != envelope.get("mode"):
            errors.append("execution.adapterMode must match mode")
        if execution.get("actualChildExecution") is True and envelope.get("mode") != "native-grok":
            errors.append("execution.actualChildExecution requires native-grok mode")
    if envelope.get("evidenceClass") not in spawn_envelope_evidence_classes:
        errors.append("invalid evidenceClass")
    for key in ("children", "blockers", "touchedFiles", "evidence", "evidenceArtifactPaths"):
        if key in envelope and not isinstance(envelope.get(key), list):
            errors.append(f"{key} must be a list")
    if not isinstance(envelope.get("oracleReview"), dict) or not envelope.get("oracleReview", {}).get("required"):
        errors.append("oracleReview.required must be true")
    broker = envelope.get("broker")
    if not isinstance(broker, dict):
        errors.append("broker must be an internal decision object")
    else:
        if broker.get("api") != broker_api:
            errors.append("broker.api must be internal-non-agent")
        for key in ("selectedLane", "modelProfile", "evidenceClass", "policyDecision"):
            if key not in broker:
                errors.append(f"broker.{key} missing")
        policy_decision = broker.get("policyDecision")
        if not isinstance(policy_decision, dict) or "reason" not in policy_decision:
            errors.append("broker.policyDecision.reason missing")
    forbidden_top_level = [key for key in envelope if re.search(r"provider.*raw|raw.*provider|rawResponse|responseBody", key, re.I)]
    if forbidden_top_level:
        errors.append(f"provider raw output exposed at top-level: {', '.join(sorted(forbidden_top_level))}")
    errors.extend(validate_evidence_gate(envelope))
    return errors


__all__ = (
    "canonical_spawn_envelope",
    "fallback_manual_gate_required",
    "native_spawn_manual_gate_available",
    "native_spawn_requested",
    "supervision_broker_decision",
    "validate_spawn_envelope",
)

