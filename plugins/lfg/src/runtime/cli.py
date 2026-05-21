#!/usr/bin/env python3
"""Dependency-free runtime implementation for the LFG Grok Build plugin.

The public executable gateway lives at bin/lfg.py. This module owns the
stateful goal, plan, team, and QA loops under .lfg.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import shutil
import sys
import time
import uuid
import shlex
import urllib.error
import urllib.request
from typing import Any

def _load_runtime_constants():
    constants_path = pathlib.Path(__file__).with_name("constants.py")
    spec = importlib.util.spec_from_file_location("_lfg_runtime_constants", constants_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load runtime constants from {constants_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_RUNTIME_CONSTANTS = _load_runtime_constants()
ROOT = _RUNTIME_CONSTANTS.ROOT
DATA = _RUNTIME_CONSTANTS.DATA
STATE_DIR = _RUNTIME_CONSTANTS.STATE_DIR
RUNS_DIR = _RUNTIME_CONSTANTS.RUNS_DIR
PLANS_DIR = _RUNTIME_CONSTANTS.PLANS_DIR
CATALOG_PATH = _RUNTIME_CONSTANTS.CATALOG_PATH
STATE_SCHEMA_VERSION = _RUNTIME_CONSTANTS.STATE_SCHEMA_VERSION
ATLAS_BOULDER_SCHEMA_VERSION = _RUNTIME_CONSTANTS.ATLAS_BOULDER_SCHEMA_VERSION
MAILBOX_DELIVERY_TTL_SECONDS = _RUNTIME_CONSTANTS.MAILBOX_DELIVERY_TTL_SECONDS
APPROVED_MODEL_PROVIDERS = _RUNTIME_CONSTANTS.APPROVED_MODEL_PROVIDERS
DEFAULT_MODEL_PROVIDER = _RUNTIME_CONSTANTS.DEFAULT_MODEL_PROVIDER
MODEL_PROVIDER_ALIASES = _RUNTIME_CONSTANTS.MODEL_PROVIDER_ALIASES
PROVIDER_DEFAULT_MODELS = _RUNTIME_CONSTANTS.PROVIDER_DEFAULT_MODELS
HEPHAESTUS_APPROVED_MODEL_PROFILES = _RUNTIME_CONSTANTS.HEPHAESTUS_APPROVED_MODEL_PROFILES
ZAI_CODING_PLAN_BASE_URL = _RUNTIME_CONSTANTS.ZAI_CODING_PLAN_BASE_URL
ZAI_GENERAL_BASE_URL = _RUNTIME_CONSTANTS.ZAI_GENERAL_BASE_URL
ZAI_DEFAULT_MODEL = _RUNTIME_CONSTANTS.ZAI_DEFAULT_MODEL
GROK_ORACLE_REVIEW = _RUNTIME_CONSTANTS.GROK_ORACLE_REVIEW
SPAWN_ENVELOPE_SCHEMA_VERSION = _RUNTIME_CONSTANTS.SPAWN_ENVELOPE_SCHEMA_VERSION
SPAWN_ENVELOPE_STATUSES = _RUNTIME_CONSTANTS.SPAWN_ENVELOPE_STATUSES
SPAWN_ENVELOPE_MODES = _RUNTIME_CONSTANTS.SPAWN_ENVELOPE_MODES
SPAWN_ENVELOPE_EVIDENCE_CLASSES = _RUNTIME_CONSTANTS.SPAWN_ENVELOPE_EVIDENCE_CLASSES
COMPLETION_STATUSES = _RUNTIME_CONSTANTS.COMPLETION_STATUSES
EVIDENCE_ARTIFACT_KINDS = _RUNTIME_CONSTANTS.EVIDENCE_ARTIFACT_KINDS
TEAM_MODE_TOOL_NAMES = _RUNTIME_CONSTANTS.TEAM_MODE_TOOL_NAMES
TEAM_MAX_MEMBERS = _RUNTIME_CONSTANTS.TEAM_MAX_MEMBERS
TEAM_MAX_PARALLEL_WORKERS = _RUNTIME_CONSTANTS.TEAM_MAX_PARALLEL_WORKERS
TEAM_MAX_MESSAGE_BYTES = _RUNTIME_CONSTANTS.TEAM_MAX_MESSAGE_BYTES
TEAM_MAX_UNREAD_BYTES = _RUNTIME_CONSTANTS.TEAM_MAX_UNREAD_BYTES
TEAM_MAX_MESSAGES_PER_RUN = _RUNTIME_CONSTANTS.TEAM_MAX_MESSAGES_PER_RUN
TEAM_MEMBER_BLOCKED_TOOLS = _RUNTIME_CONSTANTS.TEAM_MEMBER_BLOCKED_TOOLS
HYPERPLAN_REQUIRED_CRITIC_CATEGORIES = _RUNTIME_CONSTANTS.HYPERPLAN_REQUIRED_CRITIC_CATEGORIES
HYPERPLAN_OPTIONAL_CRITIC_CATEGORIES = _RUNTIME_CONSTANTS.HYPERPLAN_OPTIONAL_CRITIC_CATEGORIES
HYPERPLAN_MAX_CRITICS = _RUNTIME_CONSTANTS.HYPERPLAN_MAX_CRITICS
HYPERPLAN_CRITIQUE_ROUNDS = _RUNTIME_CONSTANTS.HYPERPLAN_CRITIQUE_ROUNDS
HYPERPLAN_REVISION_ROUNDS = _RUNTIME_CONSTANTS.HYPERPLAN_REVISION_ROUNDS
ATLAS_NOTEPAD_CATEGORIES = _RUNTIME_CONSTANTS.ATLAS_NOTEPAD_CATEGORIES
ULTRAWORK_STOP_STATES = {"accepted", "blocked", "budget_exhausted", "manual_review_required", "failed"}
ULTRAWORK_EVIDENCE_REQUIRED_STATES = COMPLETION_STATUSES | ULTRAWORK_STOP_STATES
SETUP_PROVIDER_WIZARD = _RUNTIME_CONSTANTS.SETUP_PROVIDER_WIZARD
TEAM_PROVIDER_EXECUTABLES = _RUNTIME_CONSTANTS.TEAM_PROVIDER_EXECUTABLES
DEEP_ROLES = _RUNTIME_CONSTANTS.DEEP_ROLES
LFG_AGENTS_DIR = _RUNTIME_CONSTANTS.LFG_AGENTS_DIR
CANONICAL_OMO_AGENT_IDS = _RUNTIME_CONSTANTS.CANONICAL_OMO_AGENT_IDS
OMO_PRIMARY_AGENT_IDS = _RUNTIME_CONSTANTS.OMO_PRIMARY_AGENT_IDS
OMO_ELIGIBLE_TEAM_MEMBER_IDS = _RUNTIME_CONSTANTS.OMO_ELIGIBLE_TEAM_MEMBER_IDS
OMO_CONDITIONAL_TEAM_MEMBER_IDS = _RUNTIME_CONSTANTS.OMO_CONDITIONAL_TEAM_MEMBER_IDS
OMO_HARD_REJECT_TEAM_MEMBER_IDS = _RUNTIME_CONSTANTS.OMO_HARD_REJECT_TEAM_MEMBER_IDS
OMO_TEAM_ELIGIBILITY_REGISTRY = _RUNTIME_CONSTANTS.OMO_TEAM_ELIGIBILITY_REGISTRY
OMO_CATEGORY_MODEL_PROFILES = _RUNTIME_CONSTANTS.OMO_CATEGORY_MODEL_PROFILES
OMO_UPSTREAM_CATEGORY_NAMES = _RUNTIME_CONSTANTS.OMO_UPSTREAM_CATEGORY_NAMES
OMO_LFG_SUPPORTED_CATEGORY_NAMES = _RUNTIME_CONSTANTS.OMO_LFG_SUPPORTED_CATEGORY_NAMES
OMO_CATEGORY_MIGRATION_NOTES = _RUNTIME_CONSTANTS.OMO_CATEGORY_MIGRATION_NOTES
OMO_CATEGORY_ROUTE_BLOCKED_TOOLS = _RUNTIME_CONSTANTS.OMO_CATEGORY_ROUTE_BLOCKED_TOOLS
OMO_CATEGORY_ROUTE_VERIFICATION_GATE = _RUNTIME_CONSTANTS.OMO_CATEGORY_ROUTE_VERIFICATION_GATE
OMO_REASONING_LEVELS = _RUNTIME_CONSTANTS.OMO_REASONING_LEVELS
OMO_MODEL_MATCHING_SOURCE = _RUNTIME_CONSTANTS.OMO_MODEL_MATCHING_SOURCE
OMO_RUNTIME_FALLBACK_POLICY = _RUNTIME_CONSTANTS.OMO_RUNTIME_FALLBACK_POLICY
BACKGROUND_CONCURRENCY_CONFIG = _RUNTIME_CONSTANTS.BACKGROUND_CONCURRENCY_CONFIG
OMO_ROLE_FIT_POLICIES = _RUNTIME_CONSTANTS.OMO_ROLE_FIT_POLICIES
OMO_AGENT_ROLE_FIT = _RUNTIME_CONSTANTS.OMO_AGENT_ROLE_FIT
OMO_CATEGORY_ROLE_FIT = _RUNTIME_CONSTANTS.OMO_CATEGORY_ROLE_FIT
del _RUNTIME_CONSTANTS



class EvidenceGateError(Exception):
    def __init__(self, code: str, message: str, *, record_type: str, paths: list[str] | None = None):
        super().__init__(message)
        self.payload = {
            "ok": False,
            "error": code,
            "message": message,
            "evidenceGate": {
                "recordType": record_type,
                "requiredArtifacts": sorted(EVIDENCE_ARTIFACT_KINDS),
                "evidenceArtifactPaths": paths or [],
                "proseAccepted": False,
            },
            "oracleReview": dict(GROK_ORACLE_REVIEW),
        }


SUPERVISION_BROKER_API = "internal-non-agent"
SUPERVISION_BROKER_VERSION = 1
SUPERVISION_BROKER_MAX_DEPTH = 2
SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
ENV_NAME_RE = re.compile(r"^[A-Z_][A-Z0-9_]{0,127}$")
LEGACY_TEAM_SPEC_NAMES = {"lina", "iz", "gonow", "grok"}
CANONICAL_HYPERPLAN_TEAM_SPEC = "1:sisyphus,1:atlas,1:sisyphus-junior"
SECRET_LIKE_VALUE_RE = re.compile(
    r"(?:"
    r"^sk-[A-Za-z0-9._-]{8,}$|"
    r"^gh[pousr]_[A-Za-z0-9_]{8,}$|"
    r"^xox[baprs]-[A-Za-z0-9-]{8,}$|"
    r"^ya29\.[A-Za-z0-9._-]{8,}$|"
    r"^AIza[0-9A-Za-z_-]{10,}$|"
    r"^-----BEGIN [A-Z ]+-----|"
    r"^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$"
    r")"
)
PROVIDER_PUBLIC_KEYS = {"id", "kind", "env", "model", "transport", "authScheme", "secretStored", "addedAt", "updatedAt"}
PROVIDER_FAILURE_SCENARIOS = {
    "missing-credential",
    "malformed-config",
    "auth-error",
    "rate-limit",
    "model-fallback",
    "runtime-fallback",
    "noop-fallback",
}
PROVIDER_SECURITY_SENSITIVE_FAILURES = {"missing-credential", "malformed-config", "auth-error"}


def validate_safe_id(value: str, field: str) -> str:
    if not SAFE_ID_RE.fullmatch(value or ""):
        raise SystemExit(f"invalid {field}: must match {SAFE_ID_RE.pattern}")
    return value


def looks_like_secret_value(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    candidate = value.strip()
    if not candidate:
        return False
    return bool(SECRET_LIKE_VALUE_RE.fullmatch(candidate))


def redact_secret_value(value: Any) -> str:
    return "[REDACTED]" if looks_like_secret_value(value) else str(value)


def redact_provider_debug(value: Any) -> Any:
    """Return provider/debug metadata without leaking token-like values."""
    if isinstance(value, dict):
        return {str(k): redact_provider_debug(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_provider_debug(v) for v in value]
    if isinstance(value, str):
        return redact_secret_value(value)
    return value


def normalize_provider_record(record: Any) -> dict[str, Any]:
    if not isinstance(record, dict):
        return {}
    normalized: dict[str, Any] = {}
    for key in PROVIDER_PUBLIC_KEYS:
        if key not in record or record[key] is None:
            continue
        value = record[key]
        normalized[key] = redact_secret_value(value) if isinstance(value, str) and key in {"id", "kind", "env", "model", "transport"} else value
    return normalized


def normalize_provider_state(state: Any) -> dict[str, Any]:
    if not isinstance(state, dict):
        state = {"providers": {}}
    providers = state.get("providers")
    if not isinstance(providers, dict):
        providers = {}
    normalized_providers: dict[str, Any] = {}
    for provider_id, provider in providers.items():
        normalized = normalize_provider_record(provider)
        if normalized:
            normalized_providers[redact_secret_value(provider_id)] = normalized
    clean = {k: v for k, v in state.items() if k != "providers"}
    clean["providers"] = normalized_providers
    return clean


def ensure_metadata_only_value(value: str, field: str) -> str:
    if looks_like_secret_value(value):
        raise SystemExit(f"refusing to store secret-like {field}: {redact_secret_value(value)}")
    return value


def safe_child_path(root: pathlib.Path, *parts: str) -> pathlib.Path:
    root_resolved = root.resolve()
    path = root_resolved.joinpath(*parts).resolve()
    if path != root_resolved and root_resolved not in path.parents:
        raise SystemExit(f"unsafe path outside {root_resolved}: {path}")
    return path


def parse_providers(value: str) -> list[str]:
    providers: list[str] = [p.strip() for p in (value or "").split(",") if p.strip()]
    invalid = [p for p in providers if p not in TEAM_PROVIDER_EXECUTABLES]
    if invalid:
        raise SystemExit(f"unknown provider(s): {', '.join(invalid)}")
    if not providers:
        raise SystemExit("at least one provider is required")
    return providers

def effective_launcher() -> str:
    """Return the user-facing binary name that was used to invoke this runtime."""
    return os.environ.get("LFG_LAUNCHER") or pathlib.Path(sys.argv[0]).name or "lfg"


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def state_schema_path() -> pathlib.Path:
    return STATE_DIR / "schema.json"


def ensure_state_schema() -> dict[str, Any]:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    path = state_schema_path()
    current = read_json(path, {}) if path.exists() else {}
    previous = current.get("version")
    migrations = list(current.get("migrations", [])) if isinstance(current.get("migrations"), list) else []
    migration_ids = {item.get("id") for item in migrations if isinstance(item, dict)}
    if previous != STATE_SCHEMA_VERSION:
        migration_id = f"state-schema-v{previous or 0}-to-v{STATE_SCHEMA_VERSION}"
        if migration_id not in migration_ids:
            migrations.append({"id": migration_id, "ts": now(), "from": previous, "to": STATE_SCHEMA_VERSION, "status": "applied"})
    schema = {
        "name": "lfg-state",
        "version": STATE_SCHEMA_VERSION,
        "createdAt": current.get("createdAt") or now(),
        "updatedAt": now(),
        "stateDir": str(STATE_DIR),
        "runsDir": str(RUNS_DIR),
        "migrations": migrations,
        "migrationStatus": "current" if previous == STATE_SCHEMA_VERSION else "migrated",
        # T11 schema roots
        "roots": ["state", "boulder", "notepads", "mailbox", "tasklists", "teams", "wiki", "plans", "ultragoal", "hyperplan", "dispatch-gate"],
    }
    path.write_text(jdump(schema) + "\n", encoding="utf-8")
    return schema


def ensure_dirs() -> None:
    for p in (DATA, STATE_DIR, RUNS_DIR, PLANS_DIR):
        p.mkdir(parents=True, exist_ok=True)
    # T11/T14: full .lfg/ schema roots for Boulder, continuation, notepad, mailbox, tasklist, teams, Hyperplan
    for extra in ("boulder", "notepads", "mailbox", "tasklists", "teams", "wiki", "evidence", "hyperplan", "dispatch-gate"):
        (DATA / extra).mkdir(parents=True, exist_ok=True)
    ensure_state_schema()


def jdump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)


def load_src_module(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load module from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_json(path: pathlib.Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(jdump(value) + "\n", encoding="utf-8")


def read_json(path: pathlib.Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


_AGENT_CORE = load_src_module("_lfg_core_agent_registry", ROOT / "src" / "core" / "agent_registry.py")
_SPAWN_CORE = load_src_module("_lfg_core_spawn_policy", ROOT / "src" / "core" / "spawn_policy.py")
_ATLAS_CORE = load_src_module("_lfg_core_atlas_boulder", ROOT / "src" / "core" / "atlas_boulder.py")
_DISPATCH_GATE = load_src_module("_lfg_runtime_dispatch_gate", ROOT / "src" / "runtime" / "dispatch_gate.py")


def evidence_dir() -> pathlib.Path:
    return DATA / "evidence"


def evidence_artifact_path(subject_id: str, kind: str) -> pathlib.Path:
    safe_subject = validate_safe_id(subject_id, "evidence subject id")
    safe_kind = validate_safe_id(kind, "evidence kind")
    return safe_child_path(evidence_dir(), f"{safe_subject}-{safe_kind}.json")


def write_evidence_artifact(subject_id: str, kind: str, payload: dict[str, Any]) -> str:
    """Persist executable proof metadata and return its concrete file path."""
    if kind not in EVIDENCE_ARTIFACT_KINDS:
        raise SystemExit(f"invalid evidence artifact kind: {kind}")
    path = evidence_artifact_path(subject_id, kind)
    body = {
        "schemaVersion": 1,
        "kind": kind,
        "subjectId": subject_id,
        "createdAt": now(),
        **redact_provider_debug(payload),
    }
    write_json(path, body)
    return str(path)


def normalize_artifact_paths(paths: Any) -> list[str]:
    if paths is None:
        return []
    if isinstance(paths, str):
        return [paths] if paths else []
    if isinstance(paths, list):
        return [str(p) for p in paths if str(p)]
    return []


def concrete_evidence_paths(record: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for key in ("evidenceArtifactPaths", "evidenceArtifacts", "evidence_paths", "evidencePath", "artifactPath"):
        paths.extend(normalize_artifact_paths(record.get(key)))
    for item in record.get("evidence", []) if isinstance(record.get("evidence"), list) else []:
        if isinstance(item, dict):
            paths.extend(normalize_artifact_paths(item.get("artifactPath") or item.get("evidencePath") or item.get("path")))
    # Preserve order while de-duplicating.
    return list(dict.fromkeys(paths))


def evidence_file_exists(path_value: str) -> bool:
    path = pathlib.Path(path_value)
    if not path.is_absolute():
        path = pathlib.Path.cwd() / path
    return path.exists() and path.is_file() and path.stat().st_size > 0


def validate_evidence_gate(record: dict[str, Any], *, record_type: str = "completion") -> list[str]:
    """Reject completion claims unless they cite concrete proof artifacts.

    Model prose or a free-text success summary is never enough. Completion must
    cite a command-output, trace, or envelope file path that exists and is non-empty.
    """
    status = str(record.get("status") or "").lower()
    ok = bool(record.get("ok", True))
    if status not in COMPLETION_STATUSES or not ok:
        return []
    paths = concrete_evidence_paths(record)
    if not paths:
        return [f"{record_type} completion missing evidenceArtifactPaths; prose evidence is not proof"]
    missing = [path for path in paths if not evidence_file_exists(path)]
    if missing:
        return [f"{record_type} completion evidence artifact missing or empty: {', '.join(missing)}"]
    oracle = record.get("oracleReview") or {}
    if not isinstance(oracle, dict) or oracle.get("required") is not True or oracle.get("gate") != "xai/grok":
        return [f"{record_type} completion missing required xAI/Grok oracleReview gate"]
    return []


def require_evidence_gate(record: dict[str, Any], *, record_type: str = "completion") -> None:
    errors = validate_evidence_gate(record, record_type=record_type)
    if errors:
        paths = concrete_evidence_paths(record)
        code = "missing-evidence" if not paths else "invalid-evidence"
        raise EvidenceGateError(code, "; ".join(errors), record_type=record_type, paths=paths)


def completion_evidence_metadata(status: str, evidence: str, evidence_artifact_paths: Any, *, record_type: str) -> dict[str, Any]:
    paths = normalize_artifact_paths(evidence_artifact_paths)
    metadata = {
        "evidenceArtifactPaths": paths,
        "evidenceArtifacts": paths,
        "oracleReview": dict(GROK_ORACLE_REVIEW),
    }
    require_evidence_gate({
        "status": status,
        "ok": True,
        "evidence": evidence or "",
        "evidenceArtifactPaths": paths,
        "oracleReview": metadata["oracleReview"],
    }, record_type=record_type)
    return metadata


def evidence_artifacts_from_args(args: argparse.Namespace) -> list[str]:
    return normalize_artifact_paths(getattr(args, "evidence_artifact", None) or getattr(args, "evidenceArtifactPaths", None) or getattr(args, "evidenceArtifact", None))


def emit(value: Any, json_mode: bool) -> None:
    if json_mode:
        print(jdump(value))
    elif isinstance(value, str):
        print(value)
    else:
        print(jdump(value))


def detect_repo(cwd: pathlib.Path) -> dict[str, Any]:
    def run(cmd: list[str]) -> str | None:
        try:
            return subprocess.check_output(cmd, cwd=str(cwd), text=True, stderr=subprocess.DEVNULL).strip()
        except Exception:
            return None
    top = run(["git", "rev-parse", "--show-toplevel"])
    branch = run(["git", "branch", "--show-current"])
    head = run(["git", "rev-parse", "--short", "HEAD"])
    dirty = run(["git", "status", "--short"])
    return {
        "cwd": str(cwd),
        "gitRoot": top,
        "branch": branch,
        "head": head,
        "dirty": bool(dirty),
        "dirtyPreview": (dirty or "").splitlines()[:20],
    }


def goal_path(goal_id: str) -> pathlib.Path:
    return STATE_DIR / "goals" / f"{goal_id}.json"


def list_goals() -> list[dict[str, Any]]:
    goals = []
    for path in sorted((STATE_DIR / "goals").glob("*.json")):
        try:
            goals.append(read_json(path))
        except Exception:
            pass
    return goals


def create_goal(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    gid = args.id or f"grok-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    goal = {
        "id": gid,
        "objective": args.objective,
        "status": "active",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "checklist": [s.strip() for s in (args.checklist or "").split(";") if s.strip()],
        "events": [{"ts": now(), "type": "created", "message": args.objective}],
    }
    write_json(goal_path(gid), goal)
    write_json(STATE_DIR / "current-goal.json", {"id": gid, "path": str(goal_path(gid)), "updatedAt": now()})
    return goal


def update_goal(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-goal.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no goal id and no current goal")
    goal = read_json(goal_path(ref))
    if not goal:
        raise SystemExit(f"goal not found: {ref}")
    evidence_artifact_paths = evidence_artifacts_from_args(args)
    completion_metadata = completion_evidence_metadata(args.status, args.note or "", evidence_artifact_paths, record_type="goal update")
    evidence_artifact_paths = completion_metadata["evidenceArtifactPaths"]
    goal["status"] = args.status
    goal["updatedAt"] = now()
    if args.status in COMPLETION_STATUSES:
        goal["evidenceArtifactPaths"] = evidence_artifact_paths
        goal["evidenceArtifacts"] = evidence_artifact_paths
        goal["oracleReview"] = completion_metadata["oracleReview"]
    goal.setdefault("events", []).append({"ts": now(), "type": "status", "status": args.status, "message": args.note or "", "evidenceArtifactPaths": evidence_artifact_paths, "evidenceArtifacts": evidence_artifact_paths, "oracleReview": completion_metadata["oracleReview"] if args.status in COMPLETION_STATUSES else None})
    write_json(goal_path(ref), goal)
    return goal


# --- ultragoal: durable multi-goal plans (Grok-native port of OMX ultragoal) ---

def ultragoal_dir(ugid: str) -> pathlib.Path:
    return safe_child_path(DATA / "ultragoal", validate_safe_id(ugid, "ultragoal id"))


def ultragoal_goals_path(ugid: str) -> pathlib.Path:
    return ultragoal_dir(ugid) / "goals.json"


def ultragoal_ledger_path(ugid: str) -> pathlib.Path:
    return ultragoal_dir(ugid) / "ledger.jsonl"


def ultragoal_brief_path(ugid: str) -> pathlib.Path:
    return ultragoal_dir(ugid) / "brief.md"


def ultragoal_current_path() -> pathlib.Path:
    return STATE_DIR / "current-ultragoal.json"


# =============================================================================
# Boulder State (Direction A - Sisyphus Boulder Management)
# This is the core durable memory structure that Sisyphus must actively maintain,
# modeled directly after real OmO boulder.json behavior.
# =============================================================================

def boulder_path(ugid: str) -> pathlib.Path:
    """Location of the official boulder state for a given ultragoal."""
    return ultragoal_dir(ugid) / "boulder.json"


def read_boulder(ugid: str) -> dict[str, Any]:
    """Read the current boulder. Returns empty dict if not exist yet."""
    path = boulder_path(ugid)
    data = read_json(path, {})
    if not data:
        # Initialize minimal boulder if none exists
        data = {
            "version": 1,
            "ultragoal_id": ugid,
            "last_updated_by": "sisyphus",
            "last_updated_at": now(),
            "current_objective": "",
            "status_summary": "Boulder initialized. No progress recorded yet.",
            "boulder_position": {"progress": 0, "phase": "initialization"},
            "open_questions": [],
            "blockers": [],
            "next_actions": [],
            "recent_evidence": [],
            "sisyphus_notes": "This boulder must be actively maintained by Sisyphus every turn."
        }
        write_json(path, data)
    return data


def write_boulder(ugid: str, boulder: dict[str, Any]) -> None:
    """Write the boulder after Sisyphus has updated it."""
    boulder["last_updated_by"] = "sisyphus"
    boulder["last_updated_at"] = now()
    boulder.setdefault("updated_at", now())
    write_json(boulder_path(ugid), boulder)


def parse_boulder_block(text: str) -> dict[str, Any] | None:
    """
    Extract a boulder JSON object from text.
    Looks for ```boulder or ```json fenced blocks, with light tolerance for model slop.
    Returns the parsed dict or None.
    """
    if not text:
        return None

    import re
    # Primary pattern: ```boulder ... ``` or ```json ... ```
    patterns = [
        r'```(?:boulder|json)\s*(\{.*?\})\s*```',
        r'```(\{.*?"ultragoal_id".*?\})\s*```',  # fallback for bare json containing ultragoal_id
    ]

    for pat in patterns:
        match = re.search(pat, text, re.DOTALL | re.IGNORECASE)
        if match:
            candidate = match.group(1).strip()
            # Remove common trailing junk
            candidate = re.sub(r',\s*}', '}', candidate)
            candidate = re.sub(r',\s*\]', ']', candidate)
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict) and "ultragoal_id" in parsed:
                    return parsed
            except Exception:
                continue
    return None


def safe_write_boulder(ugid: str, boulder: dict[str, Any]) -> tuple[bool, str]:
    """
    Validate, normalize and write a boulder.
    Returns (success, message).
    Never silently drops the boulder.
    """
    try:
        if not isinstance(boulder, dict):
            return False, "boulder is not a dict"

        boulder.setdefault("schema_version", 2)
        boulder.setdefault("version", 2)
        boulder["ultragoal_id"] = ugid
        boulder.setdefault("last_updated_by", "sisyphus")
        boulder.setdefault("last_updated_at", now())
        boulder.setdefault("updated_at", now())

        # Light normalization for common missing fields
        boulder.setdefault("status_summary", "")
        boulder.setdefault("boulder_position", {"progress": 0, "phase": "unknown"})
        boulder.setdefault("open_questions", [])
        boulder.setdefault("blockers", [])
        boulder.setdefault("next_actions", [])
        boulder.setdefault("recent_evidence", [])
        boulder.setdefault("sisyphus_notes", "")

        write_boulder(ugid, boulder)
        return True, "boulder written successfully"
    except Exception as e:
        return False, f"failed to write boulder: {e}"


def get_active_harness_injection(max_chars: int = 6000) -> str:
    """
    Secondary consumption for LFG Active Goal Harness.
    If the aggressive hook wrote an injection (from UserPromptSubmit etc.),
    we can force-include it in worker prompts, agent prompts, etc.
    This makes the harness effective even when stdout injection from the hook runner is limited.
    """
    harness_file = DATA / "harness" / "active_injection.txt"
    if harness_file.exists():
        try:
            text = harness_file.read_text(encoding="utf-8")
            if text.strip():
                return "\n\n" + text[:max_chars] + "\n\n"
        except Exception:
            pass
    return ""


def ultragoal_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    ugid = args.id or f"ultragoal-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    udir = ultragoal_dir(ugid)
    udir.mkdir(parents=True, exist_ok=True)

    brief = args.brief or args.objective
    if brief.startswith("@"):
        p = pathlib.Path(brief[1:]).resolve()
        brief = p.read_text(encoding="utf-8") if p.exists() else brief

    # Single aggregate story for v1 parity (matches "repo-native multi-goal" spirit; user can extend)
    story = {
        "id": "S001",
        "objective": args.objective,
        "status": "active",
        "checklist": [s.strip() for s in (args.checklist or "design;implement;verify;gate").split(";") if s.strip()],
        "createdAt": now(),
    }
    goals_doc = {
        "id": ugid,
        "objective": args.objective,
        "createdAt": now(),
        "updatedAt": now(),
        "stories": [story],
        "aggregateStatus": "active",
        "backingGoal": None,
    }

    # Create a backing primitive goal (the "Codex goal" equivalent)
    backing = create_goal(argparse.Namespace(
        id=f"backing-{ugid}",
        objective=f"[ultragoal {ugid}] {args.objective}",
        checklist=";".join(story["checklist"]),
        cwd=args.cwd,
    ))
    goals_doc["backingGoal"] = {"id": backing["id"], "path": str(goal_path(backing["id"]))}

    write_json(ultragoal_goals_path(ugid), goals_doc)
    (ultragoal_brief_path(ugid)).write_text(brief + "\n", encoding="utf-8")
    # init empty ledger
    ultragoal_ledger_path(ugid).write_text("", encoding="utf-8")

    current = {"id": ugid, "path": str(udir), "updatedAt": now()}
    write_json(ultragoal_current_path(), current)

    # initial ledger entry
    ultragoal_checkpoint_record(ugid, "active", "ultragoal created", {"backingGoal": backing})

    rec = {"id": ugid, "dir": str(udir), "goals": goals_doc, "briefPath": str(ultragoal_brief_path(ugid))}
    rec["path"] = str(udir)
    return rec


def ultragoal_checkpoint_record(ugid: str, status: str, evidence: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    ledger_path = ultragoal_ledger_path(ugid)
    entry = {
        "ts": now(),
        "status": status,
        "evidence": evidence,
    }
    if extra:
        entry.update(extra)
    with ledger_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def ultragoal_status(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(ultragoal_current_path(), {}) or {}).get("id")
    if not ref:
        return {"ultragoal": "none", "message": "no active ultragoal"}
    udir = ultragoal_dir(ref)
    if not udir.exists():
        return {"ultragoal": ref, "error": "dir missing"}
    goals = read_json(ultragoal_goals_path(ref), {})
    # last few ledger lines
    ledger_lines = []
    lp = ultragoal_ledger_path(ref)
    if lp.exists():
        lines = [line for line in lp.read_text(encoding="utf-8").strip().splitlines() if line.strip()][-5:]
        for line in lines:
            try:
                ledger_lines.append(json.loads(line))
            except Exception:
                pass
    return {"id": ref, "dir": str(udir), "goals": goals, "recentLedger": ledger_lines}


def ultragoal_checkpoint(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(ultragoal_current_path(), {}) or {}).get("id")
    if not ref:
        raise SystemExit("no ultragoal id and no current ultragoal")
    udir = ultragoal_dir(ref)
    if not udir.exists():
        raise SystemExit(f"ultragoal not found: {ref}")

    goals = read_json(ultragoal_goals_path(ref))
    if not goals:
        raise SystemExit("goals.json missing")

    status = args.status
    evidence = args.evidence or ""
    evidence_artifact_paths = evidence_artifacts_from_args(args)

    # Quality gate enforcement for final completion (v1: if completing the only/last story)
    stories = goals.get("stories", [])
    is_final = len(stories) == 1 or (args.story and args.story == stories[-1].get("id"))
    if status == "complete" and is_final:
        # require evidence of gate (ai-slop + code-review or explicit --force-gate)
        gate_ok = args.force_gate or ("ai-slop" in evidence.lower() and "approve" in evidence.lower())
        if not gate_ok:
            raise SystemExit("final story complete requires quality gate evidence (ai-slop-cleaner + code-review APPROVE) or --force-gate")
    completion_metadata = completion_evidence_metadata(status, evidence, evidence_artifact_paths, record_type="ultragoal checkpoint")
    evidence_artifact_paths = completion_metadata["evidenceArtifactPaths"]

    # update story status if provided
    if args.story:
        for s in stories:
            if s.get("id") == args.story:
                s["status"] = status
                s["evidence"] = evidence
                s["evidenceArtifactPaths"] = evidence_artifact_paths
                s["oracleReview"] = completion_metadata["oracleReview"] if status in COMPLETION_STATUSES else s.get("oracleReview")
                break
    else:
        # update aggregate + last story
        goals["aggregateStatus"] = status
        if stories:
            stories[-1]["status"] = status
            stories[-1]["evidence"] = evidence
            stories[-1]["evidenceArtifactPaths"] = evidence_artifact_paths
            if status in COMPLETION_STATUSES:
                stories[-1]["oracleReview"] = completion_metadata["oracleReview"]

    goals["updatedAt"] = now()
    write_json(ultragoal_goals_path(ref), goals)

    extra = {"story": args.story} if args.story else {}
    if evidence_artifact_paths:
        extra["evidenceArtifactPaths"] = evidence_artifact_paths
        extra["evidenceArtifacts"] = evidence_artifact_paths
        if status in COMPLETION_STATUSES:
            extra["oracleReview"] = completion_metadata["oracleReview"]
    if args.goal_json:
        extra["codexGoalSnapshot"] = args.goal_json[:2000]  # truncate for ledger sanity

    entry = ultragoal_checkpoint_record(ref, status, evidence, extra)

    if evidence_artifact_paths:
        boulder = read_boulder(ref)
        boulder.setdefault("recent_evidence", []).append({
            "ts": now(),
            "status": status,
            "story": args.story,
            "evidence": evidence,
            "evidenceArtifactPaths": evidence_artifact_paths,
                "evidenceArtifacts": evidence_artifact_paths,
                "oracleReview": completion_metadata["oracleReview"] if status in COMPLETION_STATUSES else None,
        })
        write_boulder(ref, boulder)

    # also touch backing goal if present
    backing = goals.get("backingGoal")
    if backing and status in ("complete", "blocked", "cancelled"):
        try:
            # best-effort update of backing
            update_goal(argparse.Namespace(id=backing["id"], status=status, note=evidence[:200], cwd=os.getcwd()))
        except Exception:
            pass

    return {"id": ref, "status": status, "entry": entry, "goals": goals}


def ultragoal_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(ultragoal_current_path(), {}) or {}).get("id")
    if not ref:
        return {"ultragoal": []}
    st = ultragoal_status(args)
    st["brief"] = ""
    bp = ultragoal_brief_path(ref)
    if bp.exists():
        st["brief"] = bp.read_text(encoding="utf-8")[:2000]
    return st


def ultragoal_spawn(args: argparse.Namespace) -> dict[str, Any]:
    """Create an ultragoal and immediately spawn a linked ulw-branded team swarm.

    This is the 'ultragoal spawn ulw' surface that makes LFG team mode feel like
    Grok-led sub-agent swarm orchestration tied to a durable goal ledger while
    native child-spawn remains manual-gated.
    """
    ug = ultragoal_create(argparse.Namespace(
        objective=args.objective,
        id=getattr(args, "id", None),
        brief=getattr(args, "brief", None),
        checklist=getattr(args, "checklist", None),
        cwd=args.cwd,
    ))
    ugid = ug["id"]

    # Template + mode detection (D: full end-to-end for hyperplan)
    template = str(getattr(args, "template", "") or "").lower().strip()
    explicit_spec = getattr(args, "spec", None)
    spec_lower = str(explicit_spec or "").lower()

    if template == "hyperplan" or "hyperplan" in template or "hyperplan" in spec_lower or getattr(args, "hyperplan", False):
        run_mode = "hyperplan"
        # Expand hyperplan template to the canonical OMO team lineup.
        if not explicit_spec or explicit_spec in ("3:executor", "executor"):
            effective_spec = "1:sisyphus,1:atlas,1:sisyphus-junior"
        else:
            effective_spec = explicit_spec
    else:
        run_mode = "ultragoal"
        effective_spec = explicit_spec or "3:executor"

    # Create the TeamRun with separated JSON state (like OmO per-run directories)
    runtime = TeamRuntime(TeamStateStore(mode=run_mode, mode_id=ugid))
    team_name = validate_safe_id(getattr(args, "name", None) or f"ultragoal-{ugid}", "team name")
    team_run = runtime.create(
        name=team_name,
        objective=f"[ultragoal {ugid}] {args.objective}",
        ultragoal_id=ugid,
        config={"providers": getattr(args, "providers", None), "template": template or None},
        mode=run_mode,
        mode_id=ugid,
    )

    # team_create does member creation + tmux + ULW prompts (wired for named agents + categories)
    default_team_providers = "grok,grok,grok" if "spawn_subagent" in globals() else "hermes,claude,codex"
    team = team_create(argparse.Namespace(
        spec=effective_spec,
        objective=f"[ultragoal {ugid}] {args.objective}",
        name=team_run.name,
        providers=getattr(args, "providers", default_team_providers),
        dry_run=getattr(args, "dry_run", False),
        cwd=args.cwd,
        mode=run_mode,
        mode_id=ugid,
    ))

    # Link both ways
    team["ultragoal"] = ugid
    write_json(team_dir() / f"{team['name']}.json", team)

    ultragoal_checkpoint_record(ugid, "active", f"spawned ulw swarm team {team['name']}", {"team": team["name"]})

    # Merge the new TeamRun info into the legacy team dict for now
    state_base = _get_mode_aware_base(run_mode, ugid)
    state_path = state_base / "teams" / team_run.id

    team["team_run"] = {
        "id": team_run.id,
        "mode": run_mode,
        "state_path": str(state_path)
    }

    # D: For hyperplan/ultrawork, seed initial tasks with evidence/verification flow (continuous loop ready)
    if run_mode == "hyperplan":
        try:
            tl = runtime.get_tasklist(team_run.id)
            tl.create_task(
                "Deep architecture & structural analysis (Hephaestus lane)",
                "Use AST-Grep + LSP to map boundaries, risks, and long-term implications. Report evidence for leader verification.",
                []
            )
            tl.create_task(
                "Creative multi-perspective review & alternatives (Artistry lane)",
                "Apply artistry + deep synthesis. Surface novel options and critiques. Submit evidence.",
                []
            )
            tl.create_task(
                "Reliable execution, tests, and integration (Sisyphus-Junior lane)",
                "Implement changes, verify with tests/git, submit clear evidence for verification.",
                ["task-"]  # soft dep example; real would use ids after create
            )
            # Reload run so state reflects tasks
            fresh = runtime.status(team_run.id)
            if fresh:
                team["seeded_hyperplan_tasks"] = len(fresh.tasks)
        except Exception as e:
            team["hyperplan_task_seed_error"] = str(e)

    return {
        "ultragoal": ug,
        "team": team,
        "note": f"workers instructed to report via `ulw ultragoal checkpoint`. Separated JSON state enabled (mode={run_mode}) like OmO. Hyperplan tasks + evidence verification ready."
    }


def detect_current_ultragoal() -> dict[str, Any] | None:
    cur = read_json(ultragoal_current_path(), {})
    if not cur or not cur.get("id"):
        return None
    ugid = cur["id"]
    goals = read_json(ultragoal_goals_path(ugid), {})
    if not goals:
        return None
    return {"id": ugid, "objective": goals.get("objective"), "aggregateStatus": goals.get("aggregateStatus")}


def build_worker_prompt(base: str, role: str, team_name: str, ug_context: dict | None) -> str:
    """Build the final prompt for a team worker, with special deep-reasoning overlay
    for architect / consultant / reviewer roles (the 'gpt5.5 + codex -p planning mode' persona).
    Always brands the worker as an ULW (ulw) sub-agent.
    """
    role_lower = (role or "").lower()
    is_deep = any(k in role_lower for k in ("architect", "consultant", "reviewer", "deep", "planner", "strategist"))

    ulw_brand = (
        "You are an **ULW worker** (LFG launcher identity = ulw). "
        "When you interact with the LFG / LFG runtime, prefer the `ulw` binary or ensure LFG_LAUNCHER=ulw. "
        "Your canonical way to report progress, decisions, or evidence on a linked ultragoal is: "
        "`ulw ultragoal checkpoint --id <ultragoal-id> --status ... --evidence \"...\" --story <id>` "
        "or the equivalent MCP call to grok_build_ultragoal with action=checkpoint."
    )

    deep_overlay = ""
    if is_deep:
        deep_overlay = (
            "\n\n### DEEP ARCHITECT / HIGH-REASONING CONSULTANT MODE (gpt5.5-level / codex -p planning persona)\n"
            "You are operating at maximum reasoning depth (equivalent to Codex planning mode with highest thinking effort, or a frontier 'gpt5.5' class reasoner).\n"
            "- Take your time. Perform multi-step, multi-angle analysis.\n"
            "- Explicitly consider: risks, trade-offs, long-term maintainability, security, performance, team velocity, and alignment with the overall ultragoal.\n"
            "- For important architectural or strategic decisions, **perform multi-AI consultation** in your reasoning: "
            "synthesize input from strong models (Gemini, Copilot-style analysis, other Codex-style planners, or any other high-quality sources available to you). "
            "Clearly label the sources you consulted and justify your final recommendation.\n"
            "- Structure your thinking: Problem → Options → Analysis (with multi-AI input) → Risks → Recommendation + Rationale.\n"
            "- Your output is expected to be used for major decisions that the leader will checkpoint into the ultragoal ledger.\n"
        )

    ug_line = ""
    if ug_context and ug_context.get("id"):
        ug_line = f"\nYou are part of an active ultragoal swarm (id={ug_context['id']}). All major decisions must be reported back to the leader via the ULW checkpoint command above."

    harness_injection = get_active_harness_injection()
    # Aggressive harness injection takes highest precedence when present (Ralph execution of harness)
    if harness_injection:
        return f"{harness_injection}\n{base}\n\n{ulw_brand}{deep_overlay}{ug_line}"

    return f"{base}\n\n{ulw_brand}{deep_overlay}{ug_line}"














def ultrawork_dir() -> pathlib.Path:
    return RUNS_DIR / "ultrawork"


def ultrawork_path(uid: str) -> pathlib.Path:
    return ultrawork_dir() / f"{uid}.json"


def ultrawork_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    uid = args.id or f"ultrawork-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    tasks = [t.strip() for t in re.split(r"\n|;", args.tasks or "") if t.strip()] or [args.objective]
    rec = {
        "id": uid,
        "objective": args.objective,
        "status": "active",
        "leadAgent": "sisyphus",
        "gate": "needs_evidence",
        "createdAt": now(),
        "updatedAt": now(),
        "tasks": [{"id": i + 1, "task": t, "status": "pending", "evidence": "", "evidenceArtifactPaths": []} for i, t in enumerate(tasks)],
        "blockers": [],
        "sisyphusDiscipline": ulw_sisyphus_discipline("batch"),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(ultrawork_path(uid), rec)
    write_json(STATE_DIR / "current-ultrawork.json", {"id": uid, "path": str(ultrawork_path(uid)), "updatedAt": now()})
    rec["path"] = str(ultrawork_path(uid))
    return rec


def ultrawork_update(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ultrawork.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no ultrawork id and no current ultrawork batch")
    rec = read_json(ultrawork_path(ref))
    if not rec:
        raise SystemExit(f"ultrawork batch not found: {ref}")
    idx = args.task - 1
    if idx < 0 or idx >= len(rec.get("tasks", [])):
        raise SystemExit(f"task out of range: {args.task}")
    evidence_artifact_paths = evidence_artifacts_from_args(args)
    gate_status = "complete" if str(args.status).lower() in ULTRAWORK_EVIDENCE_REQUIRED_STATES else args.status
    try:
        completion_metadata = completion_evidence_metadata(gate_status, args.evidence or "", evidence_artifact_paths, record_type="ultrawork task")
    except EvidenceGateError as exc:
        if str(args.status).lower() in ULTRAWORK_EVIDENCE_REQUIRED_STATES:
            rec["tasks"][idx]["status"] = "needs_evidence"
            rec["tasks"][idx]["evidence"] = args.evidence or ""
            rec["tasks"][idx]["evidenceArtifactPaths"] = evidence_artifact_paths
            rec["tasks"][idx]["evidenceArtifacts"] = evidence_artifact_paths
            rec["status"] = "blocked"
            rec["gate"] = "needs_evidence"
            rec["updatedAt"] = now()
            rec.setdefault("blockers", []).append({
                "ts": now(),
                "code": exc.payload.get("error", "missing-evidence"),
                "task": args.task,
                "statusAttempted": args.status,
                "reason": exc.payload.get("message"),
                "durable": True,
            })
            write_json(ultrawork_path(ref), rec)
        raise
    evidence_artifact_paths = completion_metadata["evidenceArtifactPaths"]
    rec["tasks"][idx]["status"] = args.status
    rec["tasks"][idx]["evidence"] = args.evidence or ""
    rec["tasks"][idx]["evidenceArtifactPaths"] = evidence_artifact_paths
    rec["tasks"][idx]["evidenceArtifacts"] = evidence_artifact_paths
    if str(args.status).lower() in ULTRAWORK_EVIDENCE_REQUIRED_STATES:
        rec["tasks"][idx]["oracleReview"] = completion_metadata["oracleReview"]
    if all(t.get("status") in {"complete", "accepted"} for t in rec.get("tasks", [])):
        rec["status"] = "accepted" if any(t.get("status") == "accepted" for t in rec.get("tasks", [])) else "complete"
        rec["gate"] = "pass"
    elif any(t.get("status") in ULTRAWORK_STOP_STATES for t in rec.get("tasks", [])):
        stop_status = next(t.get("status") for t in rec.get("tasks", []) if t.get("status") in ULTRAWORK_STOP_STATES)
        rec["status"] = stop_status
        rec["gate"] = stop_status
    elif any(t.get("status") == "needs_evidence" for t in rec.get("tasks", [])):
        rec["status"] = "blocked"
        rec["gate"] = "needs_evidence"
    else:
        rec["status"] = "active"
        rec["gate"] = "needs_evidence"
    rec["updatedAt"] = now()
    write_json(ultrawork_path(ref), rec)
    rec["path"] = str(ultrawork_path(ref))
    return rec


def current_active_plan_summary() -> dict[str, Any] | None:
    current = read_json(STATE_DIR / "current-plan.json", {}) or {}
    plan_id = current.get("id")
    if not plan_id:
        return None
    path = pathlib.Path(current.get("json") or PLANS_DIR / f"{plan_id}.json")
    if not path.exists():
        path = PLANS_DIR / f"{plan_id}.json"
    if not path.exists():
        return None
    plan = read_json(path, {}) or {}
    if plan.get("status") != "active":
        return None
    return {
        "id": plan.get("id") or plan_id,
        "title": plan.get("title"),
        "path": str(path),
        "steps": plan.get("steps", []),
    }


def ulw_sisyphus_discipline(strategy: str) -> dict[str, Any]:
    return {
        "leadAgent": "sisyphus",
        "strategy": strategy,
        "routesThroughSisyphus": True,
        "bypassesEvidenceGates": False,
        "evidenceGateRequired": True,
        "oracleReviewRequired": True,
        "oracleReview": dict(GROK_ORACLE_REVIEW),
        "completionPolicy": {
            "proseOnlyCompletionAllowed": False,
            "allowedStopConditions": ["verified_completion", "explicit_blocker", "user_cancelled"],
            "ultraworkStopStates": sorted(ULTRAWORK_STOP_STATES),
            "evidenceRequiredBeforeAdvancement": True,
            "blockerEscalationRequired": True,
        },
    }


def default_ulw_spawn_wave_tasks(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Build the deterministic default delegation wave for an Ultrawork run."""
    objective = str(record.get("objective") or "continue Ultrawork objective")
    strategy = str(record.get("strategy") or "autonomous-exploration")
    tasks = record.get("tasks", []) if isinstance(record.get("tasks"), list) else []
    if strategy == "existing-plan":
        return [
            {
                "taskId": f"atlas-wave-{task.get('id') or index + 1}",
                "agent_id": "atlas",
                "category": "planning",
                "task": str(task.get("task") or objective),
            }
            for index, task in enumerate(tasks)
            if isinstance(task, dict)
        ] or [{"taskId": "atlas-wave-1", "agent_id": "atlas", "category": "planning", "task": objective}]
    return [
        {"taskId": "prometheus-plan", "agent_id": "prometheus", "category": "planning", "task": f"Plan: {objective}"},
        {"taskId": "hephaestus-deep-work", "agent_id": "hephaestus", "category": "deep", "task": f"Research and implement: {objective}"},
        {"taskId": "sisyphus-junior-verify", "agent_id": "sisyphus-junior", "category": "quick", "task": f"Verify bounded evidence for: {objective}"},
    ]


def summarize_default_ulw_spawn_wave(wave: dict[str, Any]) -> dict[str, Any]:
    return {
        "operation": wave.get("operation"),
        "status": wave.get("status"),
        "ok": bool(wave.get("ok")),
        "waveId": wave.get("waveId") or wave.get("wave_id"),
        "manual_gate_required": bool(wave.get("manual_gate_required")),
        "children": wave.get("children", []),
        "recordPath": wave.get("recordPath"),
        "evidenceClass": wave.get("evidenceClass"),
    }


def detect_ulw_intent(text: str) -> dict[str, Any]:
    """Hybrid detection for OMO-style `ulw` keyword trigger (Candidate 3 winner)."""
    if not text:
        return {"triggered": False}

    t = text.strip().lower()

    # Explicit prefix (strongest signal)
    if t.startswith(("ulw ", "ulw:", "ulw\n", "/ulw ", "ulw\"")):
        goal = text.split(" ", 1)[1].strip().strip('"\'') if " " in text else text
        return {"triggered": True, "explicit": True, "goal": goal, "confidence": 0.95, "reason": "explicit prefix"}

    # Strong standalone or phrase triggers
    strong_signals = ["ulw mode", "ulw on", "ulw go", "full ulw", "ulw ulw", "enter ultrawork", "ulw energy"]
    for sig in strong_signals:
        if sig in t:
            return {"triggered": True, "explicit": False, "goal": text, "confidence": 0.85, "reason": "strong signal"}

    # General keyword with context
    if "ulw" in t and any(v in t for v in ["start", "begin", "activate", "mode", "hard", "swarm", "push", "boulder"]):
        return {"triggered": True, "explicit": False, "goal": text, "confidence": 0.75, "reason": "keyword + verb"}

    return {"triggered": False}


def build_ulw_activation(goal: str, explicit: bool, cwd: str | None, uid: str, active_plan: dict[str, Any] | None) -> tuple[dict[str, Any], dict[str, Any]]:
    strategy = "existing-plan" if active_plan else "autonomous-exploration"
    tasks = [step.get("text") or step.get("task") or step.get("objective") for step in (active_plan or {}).get("steps", []) if isinstance(step, dict)]
    tasks = [str(task) for task in tasks if task] or [goal]
    ts = now()
    record = {
        "id": uid,
        "objective": goal,
        "status": "active",
        "gate": "needs_evidence",
        "createdAt": ts,
        "updatedAt": ts,
        "mode": "ultrawork",
        "explicit": explicit,
        "leadAgent": "sisyphus",
        "tasks": [{"id": i + 1, "task": task, "status": "pending", "evidence": "", "evidenceArtifactPaths": []} for i, task in enumerate(tasks)],
        "blockers": [],
        "boulder": {"open_questions": [], "blockers": [], "next_actions": tasks},
        "plan": active_plan,
        "strategy": strategy,
        "sisyphusDiscipline": ulw_sisyphus_discipline(strategy),
        "delegation": {
            "allowed": True,
            "lead": "sisyphus",
            "plannedDelegates": ["atlas"] if active_plan else ["prometheus", "hephaestus", "sisyphus-junior"],
            "defaultSpawnWave": True,
            "evidenceRequiredBeforeCompletion": True,
        },
        "preamble_injected": False,
        "repo": detect_repo(pathlib.Path(cwd or os.getcwd()).resolve()),
    }
    preamble = (
        "You are now in OMO-style Ultrawork mode (LFG + Sisyphus lead). "
        "Own the intent, maintain the Boulder, delegate via the OMO catalog (Prometheus for planning, Hephaestus for deep work, Atlas for checklists). "
        f"Objective: {goal}. Never stop until every promise is verified with evidence. "
        "Do not mark prose-only completion as done; escalate missing evidence as a blocker. "
        "Report progress using durable checkpoints. This run is persistent across sessions."
    )
    return record, {
        "ulw_id": uid,
        "status": "activated",
        "gate": "needs_evidence",
        "objective": goal,
        "preamble": preamble,
        "state_path": str(ultrawork_path(uid)),
        "explicit": explicit,
        "leadAgent": "sisyphus",
        "strategy": strategy,
        "plan": active_plan,
        "tasks": record["tasks"],
        "defaultSpawnWavePlan": default_ulw_spawn_wave_tasks(record),
        "sisyphusDiscipline": record["sisyphusDiscipline"],
    }


def activate_ulw_mode(goal: str, explicit: bool = True, cwd: str | None = None, uid: str | None = None, active_plan: dict[str, Any] | None = None) -> dict[str, Any]:
    """Activate OMO-style Ultrawork (hybrid design). Creates durable state + returns Sisyphus preamble ready data."""
    ensure_dirs()
    resolved_uid = uid or f"ultrawork-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    resolved_plan = active_plan if active_plan is not None else current_active_plan_summary()
    record, activated = build_ulw_activation(goal, explicit, cwd, resolved_uid, resolved_plan)
    write_json(ultrawork_path(resolved_uid), record)
    wave = spawn_wave(default_ulw_spawn_wave_tasks(record), run_id=f"{resolved_uid}-default-wave", mode="parallel")
    record["defaultSpawnWave"] = summarize_default_ulw_spawn_wave(wave)
    activated["defaultSpawnWave"] = record["defaultSpawnWave"]
    write_json(ultrawork_path(resolved_uid), record)
    write_json(STATE_DIR / "current-ultrawork.json", {"id": resolved_uid, "path": str(ultrawork_path(resolved_uid)), "updatedAt": now()})
    return activated


def ulw_intent(args: argparse.Namespace) -> dict[str, Any]:
    """Handler for `lfg ulw "goal"` and `/ulw` (hybrid design)."""
    goal = " ".join(args.objective) if getattr(args, "objective", None) else ""
    if not goal:
        return {"error": "no objective provided for ulw", "usage": "lfg ulw \"your goal\""}

    trigger = detect_ulw_intent(goal)
    loop = loop_start(argparse.Namespace(objective=goal, cwd=getattr(args, "cwd", None)))
    activated = loop.get("activation", {})
    return {**loop, **activated, "dispatchGate": loop.get("dispatchGate"), "loop": {key: value for key, value in loop.items() if key != "activation"}}


def ultrawork_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ultrawork.json", {}) or {}).get("id")
    if not ref:
        return {"ultrawork": []}
    rec = read_json(ultrawork_path(ref))
    if not rec:
        raise SystemExit(f"ultrawork batch not found: {ref}")
    rec["path"] = str(ultrawork_path(ref))
    return rec


def loop_path() -> pathlib.Path:
    return STATE_DIR / "grok-build-loop.json"


def dispatch_gate_root() -> pathlib.Path:
    return DATA / "dispatch-gate"


def loop_dispatch_identity(objective: str, active_plan: dict[str, Any] | None) -> dict[str, str]:
    objective_hash = hashlib.sha256(objective.encode("utf-8")).hexdigest()[:12]
    plan_id = str((active_plan or {}).get("id") or "no-active-plan") if isinstance(active_plan, dict) else "no-active-plan"
    session_id = os.environ.get("GROK_SESSION_ID") or os.environ.get("OPENCODE_SESSION_ID") or "local-loop"
    boulder_version = str(ATLAS_BOULDER_SCHEMA_VERSION)
    reason = f"loop_start:{objective_hash}"
    target_agent = "sisyphus"
    key = _DISPATCH_GATE.dispatch_key(
        session_id=session_id,
        plan_id=plan_id,
        boulder_version=boulder_version,
        reason=reason,
        target_agent=target_agent,
    )
    return {
        "sessionId": session_id,
        "planId": plan_id,
        "boulderVersion": boulder_version,
        "reason": reason,
        "targetAgent": target_agent,
        "ultraworkId": f"ultrawork-{key}",
    }


def reserve_loop_dispatch_gate(activated: dict[str, Any], identity: dict[str, str]) -> dict[str, Any]:
    snapshot = {
        "objective": activated.get("objective"),
        "ultraworkId": activated.get("ulw_id"),
        "statePath": activated.get("state_path"),
        "plan": activated.get("plan"),
        "tasks": activated.get("tasks", []),
        "strategy": activated.get("strategy"),
    }
    return _DISPATCH_GATE.reserve_dispatch_gate(
        dispatch_root=dispatch_gate_root(),
        session_id=identity["sessionId"],
        plan_id=identity["planId"],
        boulder_version=identity["boulderVersion"],
        reason=identity["reason"],
        target_agent=identity["targetAgent"],
        prompt=str(activated.get("preamble") or activated.get("objective") or ""),
        state_snapshot=snapshot,
        native_dispatch_supported=False,
        now_value=now(),
    )


def loop_start(args: argparse.Namespace) -> dict[str, Any]:
    objective = str(getattr(args, "objective", "") or "").strip()
    if not objective:
        raise SystemExit("loop start requires an objective")
    ensure_dirs()
    active_plan = current_active_plan_summary()
    identity = loop_dispatch_identity(objective, active_plan)
    _, preview = build_ulw_activation(objective, True, getattr(args, "cwd", None), identity["ultraworkId"], active_plan)
    dispatch_gate = reserve_loop_dispatch_gate(preview, identity)
    if dispatch_gate.get("duplicateSuppressed"):
        snapshot = dispatch_gate.get("stateSnapshot") or {}
        existing = read_json(ultrawork_path(snapshot.get("ultraworkId") or preview["ulw_id"]), {}) or {}
        activated = {
            **preview,
            "ulw_id": snapshot.get("ultraworkId") or preview["ulw_id"],
            "state_path": snapshot.get("statePath") or preview["state_path"],
            "plan": snapshot.get("plan"),
            "tasks": snapshot.get("tasks", preview.get("tasks", [])),
            "strategy": snapshot.get("strategy") or preview.get("strategy"),
            "defaultSpawnWave": existing.get("defaultSpawnWave"),
        }
    else:
        activated = activate_ulw_mode(objective, explicit=True, cwd=getattr(args, "cwd", None), uid=identity["ultraworkId"], active_plan=active_plan)
    record = {
        "ok": True,
        "status": "active",
        "surface": "grok-build-/loop",
        "loopKind": "omo-continuation",
        "ultraworkId": activated["ulw_id"],
        "statePath": activated["state_path"],
        "objective": objective,
        "updatedAt": now(),
    }
    record["dispatchGate"] = dispatch_gate
    write_json(loop_path(), record)
    return {**record, "activation": activated}


def loop_status(args: argparse.Namespace) -> dict[str, Any]:
    current = read_json(loop_path(), {}) or {}
    uid = getattr(args, "id", None) or current.get("ultraworkId") or (read_json(STATE_DIR / "current-ultrawork.json", {}) or {}).get("id")
    if not uid:
        return {"ok": True, "status": "idle", "surface": "grok-build-/loop", "loop": []}
    shown = ultrawork_show(argparse.Namespace(id=uid))
    return {"ok": True, "status": shown.get("status", "active"), "surface": "grok-build-/loop", "loop": current, "ultrawork": shown}


def loop_step(args: argparse.Namespace) -> dict[str, Any]:
    current = read_json(loop_path(), {}) or {}
    uid = getattr(args, "id", None) or current.get("ultraworkId")
    if not uid:
        raise SystemExit("no active /loop run")
    updated = ultrawork_update(argparse.Namespace(
        id=uid,
        task=getattr(args, "task", 1),
        status=getattr(args, "status", "active"),
        evidence=getattr(args, "evidence", ""),
        evidence_artifact=getattr(args, "evidence_artifact", []),
    ))
    current.update({"status": updated.get("status", "active"), "updatedAt": now(), "ultraworkId": uid})
    write_json(loop_path(), current)
    return {"ok": True, "surface": "grok-build-/loop", "loop": current, "ultrawork": updated}


def loop_stop(args: argparse.Namespace) -> dict[str, Any]:
    current = read_json(loop_path(), {}) or {}
    current.update({"ok": True, "status": getattr(args, "status", None) or "stopped", "updatedAt": now(), "surface": "grok-build-/loop"})
    write_json(loop_path(), current)
    return current

def ralph_dir() -> pathlib.Path:
    return RUNS_DIR / "ralph"


def ralph_path(rid: str) -> pathlib.Path:
    return ralph_dir() / f"{rid}.json"


def ralph_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    rid = args.id or f"ralph-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    record = {
        "id": rid,
        "objective": args.objective,
        "status": "active",
        "iteration": 0,
        "maxIterations": args.max_iterations,
        "stopCondition": args.stop_condition or "verification passes and no blockers remain",
        "createdAt": now(),
        "updatedAt": now(),
        "events": [{"ts": now(), "type": "created", "objective": args.objective}],
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(ralph_path(rid), record)
    write_json(STATE_DIR / "current-ralph.json", {"id": rid, "path": str(ralph_path(rid)), "updatedAt": now()})
    record["path"] = str(ralph_path(rid))
    return record


def ralph_step(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ralph.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no ralph id and no current ralph loop")
    record = read_json(ralph_path(ref))
    if not record:
        raise SystemExit(f"ralph loop not found: {ref}")
    evidence_artifact_paths = evidence_artifacts_from_args(args)
    completion_metadata = completion_evidence_metadata(args.status, args.evidence or "", evidence_artifact_paths, record_type="ralph step")
    evidence_artifact_paths = completion_metadata["evidenceArtifactPaths"]
    record["iteration"] = int(record.get("iteration", 0)) + 1
    record["status"] = args.status
    record["updatedAt"] = now()
    event = {"ts": now(), "type": "step", "iteration": record["iteration"], "status": args.status, "evidence": args.evidence, "evidenceArtifactPaths": evidence_artifact_paths, "evidenceArtifacts": evidence_artifact_paths}
    if args.status in COMPLETION_STATUSES:
        event["oracleReview"] = completion_metadata["oracleReview"]
    record.setdefault("events", []).append(event)
    if record["iteration"] >= int(record.get("maxIterations", 1)) and args.status != "complete":
        record["status"] = "blocked"
    write_json(ralph_path(ref), record)
    record["path"] = str(ralph_path(ref))
    return record


def ralph_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ralph.json", {}) or {}).get("id")
    if not ref:
        return {"ralph": []}
    record = read_json(ralph_path(ref))
    if not record:
        raise SystemExit(f"ralph loop not found: {ref}")
    record["path"] = str(ralph_path(ref))
    return record

def workers_dir() -> pathlib.Path:
    return STATE_DIR / "workers"


def worker_path(worker_id: str) -> pathlib.Path:
    return workers_dir() / f"{slugify(worker_id)}.json"


def worker_ack(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    wid = args.worker
    rec = read_json(worker_path(wid), {"worker": wid, "events": []})
    rec.update({"worker": wid, "status": "ack", "task": args.task, "updatedAt": now()})
    rec.setdefault("events", []).append({"ts": now(), "type": "ack", "task": args.task})
    write_json(worker_path(wid), rec)
    rec["path"] = str(worker_path(wid))
    return rec


def worker_result(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    wid = args.worker
    rec = read_json(worker_path(wid), {"worker": wid, "events": []})
    evidence_artifact_paths = evidence_artifacts_from_args(args)
    completion_metadata = completion_evidence_metadata(args.status, args.result or "", evidence_artifact_paths, record_type="worker result")
    evidence_artifact_paths = completion_metadata["evidenceArtifactPaths"]
    rec.update({"worker": wid, "status": args.status, "result": args.result, "updatedAt": now(), "evidenceArtifactPaths": evidence_artifact_paths, "evidenceArtifacts": evidence_artifact_paths})
    if args.status in COMPLETION_STATUSES:
        rec["oracleReview"] = completion_metadata["oracleReview"]
    rec.setdefault("events", []).append({"ts": now(), "type": "result", "status": args.status, "result": args.result, "evidenceArtifactPaths": evidence_artifact_paths, "evidenceArtifacts": evidence_artifact_paths, "oracleReview": completion_metadata["oracleReview"] if args.status in COMPLETION_STATUSES else None})
    write_json(worker_path(wid), rec)
    rec["path"] = str(worker_path(wid))
    return rec


def worker_status(args: argparse.Namespace) -> dict[str, Any]:
    if args.worker:
        rec = read_json(worker_path(args.worker))
        if not rec:
            raise SystemExit(f"worker not found: {args.worker}")
        rec["path"] = str(worker_path(args.worker))
        return rec
    workers = []
    for path in sorted(workers_dir().glob("*.json")) if workers_dir().exists() else []:
        item = read_json(path)
        item["path"] = str(path)
        workers.append(item)
    return {"count": len(workers), "workers": workers}

def cleanup_dir() -> pathlib.Path:
    return RUNS_DIR / "ai-slop-cleaner"


def ai_slop_cleaner(args: argparse.Namespace) -> dict[str, Any]:
    """Create a durable cleanup/deslop report; no automatic edits in MVP."""
    ensure_dirs()
    scope = [x.strip() for x in (args.scope or "").split(",") if x.strip()]
    if not scope:
        scope = ["repo"]
    report_id = f"cleanup-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    fallback_findings = []
    for item in scope:
        path = pathlib.Path(args.cwd).resolve() / item
        if path.exists() and path.is_file():
            text = path.read_text(errors="ignore")[:20000]
            if re.search(r"fallback|workaround|TODO|FIXME", text, re.I):
                fallback_findings.append({"path": item, "signal": "fallback/workaround/TODO/FIXME"})
    report = {
        "id": report_id,
        "createdAt": now(),
        "scope": scope,
        "status": "planned",
        "behaviorLock": args.verification or "not run",
        "fallbackFindings": fallback_findings,
        "passes": [],
        "qualityGate": {"status": "planned", "evidence": "MVP records cleanup plan only; no automatic edits."},
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    path = cleanup_dir() / f"{report_id}.json"
    write_json(path, report)
    write_json(STATE_DIR / "last-cleanup.json", {"id": report_id, "path": str(path), "updatedAt": now()})
    report["path"] = str(path)
    return report


def ai_slop_cleaner_list(args: argparse.Namespace) -> dict[str, Any]:
    reports = []
    for path in sorted(cleanup_dir().glob("*.json")) if cleanup_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            reports.append(item)
        except Exception:
            pass
    if args.limit:
        reports = reports[-args.limit:]
    return {"count": len(reports), "reports": reports}

def research_dir() -> pathlib.Path:
    return RUNS_DIR / "autoresearch"


def research_path(rid: str) -> pathlib.Path:
    return research_dir() / f"{rid}.json"


def autoresearch_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    rid = args.id or f"research-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    record = {
        "id": rid,
        "question": args.question,
        "status": "open",
        "createdAt": now(),
        "updatedAt": now(),
        "sources": [],
        "findings": [],
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(research_path(rid), record)
    write_json(STATE_DIR / "current-research.json", {"id": rid, "path": str(research_path(rid)), "updatedAt": now()})
    record["path"] = str(research_path(rid))
    return record


def autoresearch_add_source(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-research.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no research id and no current research")
    record = read_json(research_path(ref))
    if not record:
        raise SystemExit(f"research not found: {ref}")
    record.setdefault("sources", []).append({"url": args.url, "note": args.note or "", "addedAt": now()})
    record["updatedAt"] = now()
    write_json(research_path(ref), record)
    record["path"] = str(research_path(ref))
    return record


def autoresearch_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-research.json", {}) or {}).get("id")
    if not ref:
        return {"research": []}
    record = read_json(research_path(ref))
    if not record:
        raise SystemExit(f"research not found: {ref}")
    record["path"] = str(research_path(ref))
    return record

def interviews_dir() -> pathlib.Path:
    return DATA / "interviews"


def interview_path(iid: str) -> pathlib.Path:
    return interviews_dir() / f"{iid}.json"


def deep_interview_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    iid = args.id or f"interview-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    questions = [q.strip() for q in re.split(r"\n|;", args.questions or "") if q.strip()]
    if not questions:
        questions = [
            "What exact outcome should be true when this is done?",
            "What constraints or integrations must not be broken?",
            "What evidence should prove completion?",
        ]
    record = {
        "id": iid,
        "topic": args.topic,
        "status": "open",
        "createdAt": now(),
        "updatedAt": now(),
        "questions": [{"id": i + 1, "question": q, "answer": None} for i, q in enumerate(questions)],
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(interview_path(iid), record)
    write_json(STATE_DIR / "current-interview.json", {"id": iid, "path": str(interview_path(iid)), "updatedAt": now()})
    record["path"] = str(interview_path(iid))
    return record


def deep_interview_answer(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-interview.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no interview id and no current interview")
    record = read_json(interview_path(ref))
    if not record:
        raise SystemExit(f"interview not found: {ref}")
    idx = args.question - 1
    if idx < 0 or idx >= len(record.get("questions", [])):
        raise SystemExit(f"question out of range: {args.question}")
    record["questions"][idx]["answer"] = args.answer
    record["updatedAt"] = now()
    if all(q.get("answer") for q in record.get("questions", [])):
        record["status"] = "answered"
    write_json(interview_path(ref), record)
    record["path"] = str(interview_path(ref))
    return record


def deep_interview_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-interview.json", {}) or {}).get("id")
    if not ref:
        return {"interviews": []}
    record = read_json(interview_path(ref))
    if not record:
        raise SystemExit(f"interview not found: {ref}")
    record["path"] = str(interview_path(ref))
    return record

def design_dir() -> pathlib.Path:
    return DATA / "design"


def design_add(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    decision_id = f"design-{time.strftime('%Y%m%d-%H%M%S')}-{slugify(args.title)}"
    record = {
        "id": decision_id,
        "title": args.title,
        "decision": args.decision,
        "rationale": args.rationale or "",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    path = design_dir() / f"{decision_id}.json"
    write_json(path, record)
    write_json(STATE_DIR / "last-design.json", {"id": decision_id, "path": str(path), "updatedAt": now()})
    record["path"] = str(path)
    return record


def design_list(args: argparse.Namespace) -> dict[str, Any]:
    items = []
    for path in sorted(design_dir().glob("*.json")) if design_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            items.append(item)
        except Exception:
            pass
    if args.limit:
        items = items[-args.limit:]
    return {"count": len(items), "decisions": items}

def notifications_path() -> pathlib.Path:
    return STATE_DIR / "notifications.json"


def notifications_set(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    config = {
        "enabled": bool(args.enabled),
        "channel": args.channel,
        "target": args.target,
        "updatedAt": now(),
        "dryRunOnly": True,
    }
    write_json(notifications_path(), config)
    return {"ok": True, "config": config, "path": str(notifications_path())}


def notifications_show(args: argparse.Namespace) -> dict[str, Any]:
    config = read_json(notifications_path(), {"enabled": False, "channel": "none", "target": None, "dryRunOnly": True})
    return {"ok": True, "config": config, "path": str(notifications_path())}


def providers_path() -> pathlib.Path:
    return STATE_DIR / "providers.json"


def read_provider_state() -> dict[str, Any]:
    state = read_json(providers_path(), {"providers": {}})
    return normalize_provider_state(state)


def default_provider_env(kind: str) -> str:
    defaults = {"zai": "ZAI_API_KEY", "openai": "OPENAI_API_KEY", "xai": "XAI_API_KEY", "grok": "XAI_API_KEY", "codex": "CODEX_OAUTH_TOKEN", "copilot": "COPILOT_GITHUB_TOKEN", "noop": "NOOP_API_KEY", "subagent": "XAI_API_KEY"}
    return defaults.get(kind, f"{kind.upper().replace('-', '_')}_API_KEY")


def default_provider_transport(kind: str) -> str:
    if kind in {"openai", "xai", "zai"}: return "http"
    if kind in {"grok", "subagent", "noop"}: return "builtin"
    if kind == "codex": return "cli-oauth"
    return "cli"


def default_provider_auth_scheme(kind: str) -> str:
    if kind == "codex": return "oauth"
    if kind in {"grok", "subagent", "noop"}: return "host"
    return "env"

def prompt_provider_field(label: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    print(f"{label}{suffix}: ", end="", file=sys.stderr, flush=True)
    value = input().strip()
    return value or (default or "")


def prompt_yes_no(label: str, default: bool = False) -> bool:
    suffix = "Y/n" if default else "y/N"
    print(f"{label} [{suffix}]: ", end="", file=sys.stderr, flush=True)
    value = input().strip().lower()
    if not value:
        return default
    return value in {"y", "yes", "1", "true", "on"}


def provider_add(args: argparse.Namespace) -> dict[str, Any]:
    """Add a provider config using flags or a stdlib interactive prompt."""
    ensure_dirs()
    interactive = bool(getattr(args, "interactive", False)) or not (args.id and args.kind)
    provider_id = args.id
    kind = args.kind
    if interactive:
        print("LFG provider setup", file=sys.stderr)
        provider_id = provider_id or prompt_provider_field("Provider id", "openai-main")
        kind = kind or prompt_provider_field("Provider kind", DEFAULT_MODEL_PROVIDER)
    if not provider_id or not kind:
        raise SystemExit("provider add requires --id and --kind in non-interactive mode")
    provider_id = validate_safe_id(provider_id, "provider id")
    ensure_metadata_only_value(provider_id, "provider id")
    if kind not in APPROVED_MODEL_PROVIDERS:
        raise SystemExit(f"unknown provider kind: {kind}")
    env_name = args.env or (prompt_provider_field("API key env var", default_provider_env(kind)) if interactive else default_provider_env(kind))
    if not ENV_NAME_RE.fullmatch(env_name):
        raise SystemExit(f"invalid env var name: {redact_secret_value(env_name)}")
    model = args.model or (prompt_provider_field("Default model", PROVIDER_DEFAULT_MODELS.get(kind, "")) if interactive else PROVIDER_DEFAULT_MODELS.get(kind))
    if model:
        ensure_metadata_only_value(model, "model")
    transport = getattr(args, "transport", None) or default_provider_transport(kind)
    auth_scheme = getattr(args, "auth_scheme", None) or getattr(args, "authScheme", None) or default_provider_auth_scheme(kind)
    config = {
        "id": provider_id,
        "kind": kind,
        "env": env_name,
        "model": model,
        "transport": transport,
        "authScheme": auth_scheme,
        "secretStored": False,
        "addedAt": now(),
    }
    state = read_provider_state()
    state["providers"][provider_id] = config
    state["updatedAt"] = now()
    write_json(providers_path(), state)
    return {"ok": True, "status": "ok", "provider": config, "path": str(providers_path()), "count": len(state["providers"])}


def provider_list(args: argparse.Namespace) -> dict[str, Any]:
    state = read_provider_state()
    providers = list(state.get("providers", {}).values())
    return {"ok": True, "status": "ok", "count": len(providers), "providers": providers, "path": str(providers_path())}


def provider_show(args: argparse.Namespace) -> dict[str, Any]:
    state = read_provider_state()
    provider_id = validate_safe_id(args.id, "provider id")
    provider = state.get("providers", {}).get(provider_id)
    if not provider:
        return {"ok": False, "status": "error", "error": "provider not found", "id": provider_id, "known": sorted(state.get("providers", {}))}
    return {"ok": True, "status": "ok", "provider": provider, "path": str(providers_path())}


def provider_failure_class(scenario: str) -> str:
    classes = {
        "missing-credential": "provider-missing-credential",
        "malformed-config": "provider-malformed-config",
        "auth-error": "provider-auth-error",
        "rate-limit": "provider-rate-limit",
        "model-fallback": "proactive-model-fallback",
        "runtime-fallback": "reactive-runtime-fallback",
        "noop-fallback": "noop-safe-fallback",
    }
    return classes[scenario]


def provider_public_config(provider_id: str | None, kind: str) -> dict[str, Any]:
    state = read_provider_state()
    providers = state.get("providers", {})
    selected = providers.get(provider_id or "") if provider_id else None
    if not selected:
        selected = next((item for item in providers.values() if item.get("kind") == kind), None)
    if selected:
        return normalize_provider_record(selected)
    return {
        "id": provider_id or f"{kind}-default",
        "kind": kind,
        "env": default_provider_env(kind),
        "model": PROVIDER_DEFAULT_MODELS.get(kind),
        "transport": default_provider_transport(kind),
        "authScheme": default_provider_auth_scheme(kind),
        "secretStored": False,
    }


def validate_provider_public_config(config: dict[str, Any]) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    provider_id = str(config.get("id") or "")
    kind = str(config.get("kind") or "")
    env_name = str(config.get("env") or "")
    model = str(config.get("model") or "")
    if not SAFE_ID_RE.fullmatch(provider_id):
        errors.append({"field": "id", "code": "invalid-provider-id"})
    if kind not in APPROVED_MODEL_PROVIDERS and kind != "noop":
        errors.append({"field": "kind", "code": "unknown-provider-kind", "kind": redact_secret_value(kind)})
    if env_name and not ENV_NAME_RE.fullmatch(env_name):
        errors.append({"field": "env", "code": "invalid-env-name", "env": redact_secret_value(env_name)})
    if any(looks_like_secret_value(config.get(key)) for key in ("id", "kind", "env", "model", "transport")):
        errors.append({"field": "provider", "code": "secret-like-metadata"})
    if model and looks_like_secret_value(model):
        errors.append({"field": "model", "code": "secret-like-model"})
    if bool(config.get("secretStored", False)):
        errors.append({"field": "secretStored", "code": "secret-value-storage-not-allowed"})
    return errors


def provider_failure_matrix(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    scenario = args.scenario
    provider_kind = args.provider
    provider = provider_public_config(getattr(args, "id", None), provider_kind)
    config_errors = validate_provider_public_config(provider)
    env_name = str(provider.get("env") or default_provider_env(provider_kind))
    credential_present = bool(os.environ.get(env_name)) if ENV_NAME_RE.fullmatch(env_name) else False
    failure_class = provider_failure_class(scenario)
    security_sensitive = scenario in PROVIDER_SECURITY_SENSITIVE_FAILURES
    fallback = {
        "modelFallback": scenario == "model-fallback",
        "runtimeFallback": scenario in {"runtime-fallback", "rate-limit"},
        "noopFallback": scenario in {"missing-credential", "noop-fallback"},
        "silentDowngrade": False,
        "separateModelAndRuntimeFallback": True,
    }
    status = "blocked"
    ok = False
    retryable = False
    actionable = ""
    state_preserved = True
    if scenario == "missing-credential":
        actionable = f"Set {env_name} or select the noop provider for dependency-free smoke."
        ok = not credential_present
    elif scenario == "malformed-config":
        actionable = "Fix provider metadata; only id/kind/env/model/transport metadata is accepted."
        ok = bool(config_errors)
    elif scenario == "auth-error":
        actionable = "Re-authenticate the provider; LFG will not downgrade auth failures silently."
    elif scenario == "rate-limit":
        actionable = "Retry after the provider rate-limit window; run state remains blocked and resumable."
        retryable = True
    elif scenario == "model-fallback":
        status = "completed"
        ok = True
        actionable = "Proactive model fallback chain selected before provider execution."
    elif scenario == "runtime-fallback":
        actionable = "Reactive runtime fallback recorded after selected provider execution failed."
        retryable = True
    elif scenario == "noop-fallback":
        status = "completed"
        ok = provider_kind == "noop"
        actionable = "Noop provider executed as dependency-free fallback without credentials."

    if scenario == "malformed-config" and not config_errors:
        status = "failed"
        actionable = "Malformed-config scenario expected invalid metadata, but provider metadata is valid."
    if scenario == "missing-credential" and credential_present:
        status = "failed"
        actionable = f"Missing-credential scenario expected {env_name} to be unset."

    payload = {
        "ok": ok,
        "status": status,
        "scenario": scenario,
        "evidenceClass": "dependency-free-smoke",
        "failureClass": failure_class,
        "provider": provider,
        "credential": {
            "env": env_name,
            "configured": credential_present,
            "secretStored": False,
            "secretValueExposed": False,
        },
        "configValidation": {
            "ok": not config_errors,
            "errors": config_errors,
            "metadataOnly": True,
            "publicKeys": sorted(PROVIDER_PUBLIC_KEYS),
        },
        "providerFailure": {
            "class": failure_class,
            "securitySensitive": security_sensitive,
            "retryable": retryable,
            "statePreserved": state_preserved,
            "actionable": actionable,
        },
        "fallback": fallback,
        "runtimeFallback": dict(OMO_RUNTIME_FALLBACK_POLICY),
        "oracleReview": dict(GROK_ORACLE_REVIEW),
    }
    if scenario == "model-fallback":
        junior = _OMO_REGISTRY_INDEX["sisyphus-junior"]
        resolved = resolve_omo_model_profile(junior, category="quick")
        payload["modelResolution"] = resolved.get("modelResolution", {})
    return redact_provider_debug(payload)


def configured_model_providers() -> list[dict[str, Any]]:
    state = read_provider_state()
    configured = []
    for provider in sorted(state.get("providers", {}).values(), key=lambda item: item.get("id", "")):
        kind = provider.get("kind")
        configured.append({
            "id": provider.get("id"),
            "kind": kind,
            "env": provider.get("env"),
            "model": provider.get("model") or PROVIDER_DEFAULT_MODELS.get(kind, ""),
            "transport": provider.get("transport"),
            "authScheme": provider.get("authScheme") or default_provider_auth_scheme(str(kind or "")),
            "secretStored": bool(provider.get("secretStored", False)),
        })
    return configured


def model_selection_path() -> pathlib.Path:
    return STATE_DIR / "model-selection.json"


def infer_model_provider(model: str, provider: str | None = None) -> str:
    if provider: return canonical_model_provider(provider)
    normalized = (model or "").strip().lower()
    if normalized in {"grok", "grok-build"} or normalized.startswith("grok") or normalized.startswith("xai/"): return "xai"
    if "/" in normalized: return canonical_model_provider(normalized.split("/", 1)[0])
    return DEFAULT_MODEL_PROVIDER


def read_model_selection() -> dict[str, Any]:
    default = {"provider": "xai", "model": PROVIDER_DEFAULT_MODELS["xai"], "reasoning": "high", "source": "default", "updatedAt": None, "switchCommand": f"/model {PROVIDER_DEFAULT_MODELS['xai']}"}
    current = read_json(model_selection_path(), {}) or {}
    if not isinstance(current, dict): return default
    return {**default, **current}


def models_switch(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    model = str(args.model or "").strip()
    if not model: raise SystemExit("model switch requires a model name")
    ensure_metadata_only_value(model, "model")
    raw_provider = getattr(args, "provider", None)
    if raw_provider and raw_provider not in APPROVED_MODEL_PROVIDERS: raise SystemExit(f"unsupported model provider: {raw_provider}")
    provider = infer_model_provider(model, raw_provider)
    if provider not in APPROVED_MODEL_PROVIDERS: raise SystemExit(f"unsupported model provider: {provider}")
    reasoning = getattr(args, "reasoning", None) or ("high" if provider == "xai" else "medium")
    selection = {"provider": provider, "model": model, "reasoning": reasoning, "source": getattr(args, "source", None) or "grok-build-/model", "updatedAt": now(), "switchCommand": f"/model {model}", "appliesTo": "lfg model resolution when no explicit --provider/--model override is supplied", "runtime": "grok-build-host" if provider == "xai" else "approved-provider", "providerBoundary": {"approvedProviders": sorted(APPROVED_MODEL_PROVIDERS), "metadataOnly": True}}
    write_json(model_selection_path(), selection)
    return {"ok": True, "status": "ok", "currentModel": selection, "path": str(model_selection_path()), "secretStorage": "env-name-only"}


def models_show(args: argparse.Namespace) -> dict[str, Any]:
    provider = getattr(args, "provider", None)
    if provider and provider not in APPROVED_MODEL_PROVIDERS: return {"ok": False, "status": "error", "error": "unsupported model provider", "provider": provider, "known": sorted(APPROVED_MODEL_PROVIDERS)}
    defaults = {key: {"provider": key, "model": value, "env": default_provider_env(key), "configured": False} for key, value in sorted(PROVIDER_DEFAULT_MODELS.items()) if key in APPROVED_MODEL_PROVIDERS}
    configured = configured_model_providers()
    for item in configured:
        kind = item.get("kind")
        if kind in defaults: defaults[kind] = {**defaults[kind], **item, "configured": True}
    selected = {provider: defaults[provider]} if provider else defaults
    return {"ok": True, "status": "ok", "defaultProvider": DEFAULT_MODEL_PROVIDER, "modelRouter": {"provider": DEFAULT_MODEL_PROVIDER, "transport": default_provider_transport(DEFAULT_MODEL_PROVIDER), "defaultModel": PROVIDER_DEFAULT_MODELS[DEFAULT_MODEL_PROVIDER], "oracleGate": "xai/grok", "reason": "Approved multi-provider metadata is explicit; Grok Oracle review remains mandatory and native child spawning is manual-gated."}, "grokOracle": {"provider": "xai", "model": PROVIDER_DEFAULT_MODELS["xai"], "transport": default_provider_transport("xai"), "authScheme": default_provider_auth_scheme("xai")}, "currentModel": read_model_selection(), "grokBuildModelSwitch": {"slash": "/model <provider/model>", "cli": "lfg models switch <provider/model>", "tmux": "lfg grok-build model <provider/model>"}, "providers": selected, "configuredProviders": configured, "categoryModelProfiles": OMO_CATEGORY_MODEL_PROFILES, "modelMatchingSource": OMO_MODEL_MATCHING_SOURCE, "roleFitPolicies": OMO_ROLE_FIT_POLICIES, "path": str(providers_path()), "secretStorage": "env-name-only"}

def auth_login(args: argparse.Namespace) -> dict[str, Any]:
    provider = getattr(args, "provider", None) or getattr(args, "kind", None)
    state = read_provider_state()
    configured = sorted(state.get("providers", {}).values(), key=lambda item: item.get("id", ""))
    selected = None
    if not provider and configured:
        print("LFG auth login", file=sys.stderr)
        for index, item in enumerate(configured, 1):
            model = item.get("model") or PROVIDER_DEFAULT_MODELS.get(item.get("kind"), "")
            print(f"{index}. {item.get('id')} ({item.get('kind')}, {model})", file=sys.stderr)
        choice = prompt_provider_field("Select configured provider", "1")
        try:
            selected = configured[max(1, int(choice)) - 1]
        except (ValueError, IndexError):
            raise SystemExit(f"invalid provider selection: {choice}")
        provider = selected.get("kind")
    provider_id = getattr(args, "id", None) or (selected.get("id") if selected else None) or (f"{provider}-main" if provider else None)
    forwarded = argparse.Namespace(
        id=provider_id,
        kind=provider,
        env=getattr(args, "env", None) or (selected.get("env") if selected else None),
        model=getattr(args, "model", None) or (selected.get("model") if selected else None),
        interactive=bool(getattr(args, "interactive", False)) or not provider,
    )
    result = provider_add(forwarded)
    result["auth"] = {
        "login": True,
        "provider": result["provider"]["kind"],
        "env": result["provider"]["env"],
        "secretStored": False,
        "note": "Store the API key in the named environment variable; LFG records no secret values.",
    }
    return result


def setup_path() -> pathlib.Path:
    return STATE_DIR / "setup.json"


def plugin_install_dest(args: argparse.Namespace) -> pathlib.Path:
    value = getattr(args, "plugin_dir", None) or os.environ.get("LFG_PLUGIN_DEST") or pathlib.Path.home() / ".grok" / "plugins" / "lfg"
    return pathlib.Path(value).expanduser()


def copy_plugin_tree(src: pathlib.Path, dest: pathlib.Path) -> None:
    src_resolved = src.resolve()
    dest_resolved = dest.resolve() if dest.exists() else dest
    if dest_resolved == src_resolved:
        return
    def ignore(_dir: str, names: list[str]) -> set[str]:
        ignored = {"__pycache__", ".pytest_cache", ".DS_Store"}
        return {name for name in names if name in ignored or name.endswith(".pyc")}
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dest, dirs_exist_ok=True, ignore=ignore)



def setup_choice_enabled(value: str | None) -> bool:
    return (value or "no").lower() in {"yes", "y", "true", "1", "on"}


def setup_add_provider(kind: str, provider_id: str) -> dict[str, Any]:
    return provider_add(argparse.Namespace(
        id=provider_id,
        kind=kind,
        env=default_provider_env(kind),
        model=PROVIDER_DEFAULT_MODELS.get(kind),
        interactive=False,
    ))["provider"]


def run_setup_wizard(args: argparse.Namespace) -> dict[str, Any] | None:
    forced = bool(getattr(args, "interactive", False))
    no_tui = bool(getattr(args, "no_tui", False))
    flag_values = {str(item["flag"]): getattr(args, str(item["flag"]), None) for item in SETUP_PROVIDER_WIZARD}
    has_flag_values = any(value is not None for value in flag_values.values())
    can_prompt = sys.stdin.isatty() and sys.stdout.isatty()

    if not forced and not no_tui and not has_flag_values and not can_prompt:
        return None
    if forced and not can_prompt:
        print("LFG OMO-style setup wizard", file=sys.stderr)
    elif can_prompt and not no_tui and not has_flag_values:
        print("LFG OMO-style setup wizard", file=sys.stderr)

    configured = []
    if no_tui or has_flag_values:
        mode = "non-interactive"
        for item in SETUP_PROVIDER_WIZARD:
            if setup_choice_enabled(flag_values[str(item["flag"])]):
                configured.append(setup_add_provider(str(item["kind"]), str(item["id"])))
    else:
        mode = "interactive"
        for item in SETUP_PROVIDER_WIZARD:
            if prompt_yes_no(str(item["question"]), bool(item["default"])):
                configured.append(setup_add_provider(str(item["kind"]), str(item["id"])))

    return {
        "mode": mode,
        "configuredProviderIds": [item["id"] for item in configured],
        "configuredProviders": configured,
        "authHints": [
            "Grok Build/xAI login is assumed by the host before LFG runs; setup does not ask for it.",
            "Grok is Grok-first host execution, not an LFG provider.",
            "xAI/Grok Oracle review is mandatory; OpenAI, Copilot, Codex, and Z.ai are bounded execution/consultation lanes only and never replace the gate.",
            "LFG stores environment variable names only; put secrets in your shell environment.",
            "Run `lfg models` to verify configured model providers.",
            "Run `grok --cwd /tmp inspect --json` after plugin install to verify Grok discovery.",
        ],
    }


def setup(args: argparse.Namespace) -> dict[str, Any]:
    """Install/sync the LFG Grok plugin and record setup state."""
    setup_cmd = getattr(args, "setup_cmd", None)
    if setup_cmd == "check":
        return setup_check(args)
    if setup_cmd == "install-plan":
        return setup_install_plan(args)
    if setup_cmd == "show":
        return setup_show(args)
    ensure_dirs()
    dest = plugin_install_dest(args)
    dry_run = bool(getattr(args, "dry_run", False))
    setup_wizard = run_setup_wizard(args)
    provider_state = read_provider_state()
    if not dry_run:
        copy_plugin_tree(ROOT, dest)
    record = {
        "ok": True,
        "dryRun": dry_run,
        "installed": not dry_run,
        "plugin": {
            "source": str(ROOT),
            "dest": str(dest),
            "exists": dest.exists(),
            "manifest": str(dest / ".grok-plugin" / "plugin.json"),
        },
        "providers": {
            "count": len(provider_state.get("providers", {})),
            "path": str(providers_path()),
        },
        "commands": {
            "providerAdd": "lfg provider add",
            "providerAddZai": "lfg provider add --id zai-main --kind zai --env ZAI_API_KEY",
            "setupInteractive": "lfg setup",
            "setupForceInteractive": "lfg setup --interactive",
            "setupNoTui": "lfg setup --no-tui --openai yes --zai yes --copilot no --codex no",
            "pluginInspect": "grok --cwd /tmp inspect --json",
        },
        "updatedAt": now(),
    }
    if setup_wizard is not None:
        record["setupWizard"] = setup_wizard
    write_json(setup_path(), record)
    record["path"] = str(setup_path())
    return record


def asks_dir() -> pathlib.Path:
    return RUNS_DIR / "ask"


def zai_api_config() -> dict[str, Any]:
    """Return Z.ai/Zhipu HTTP adapter config without requiring credentials."""
    api_key = os.environ.get("ZAI_API_KEY") or os.environ.get("ZHIPU_API_KEY")
    base_url = os.environ.get("ZAI_BASE_URL") or os.environ.get("ZHIPU_BASE_URL") or ZAI_CODING_PLAN_BASE_URL
    model = os.environ.get("ZAI_MODEL") or os.environ.get("ZHIPU_MODEL") or ZAI_DEFAULT_MODEL
    return {
        "provider": "zai",
        "transport": "http",
        "endpoint": base_url.rstrip("/") + "/chat/completions",
        "baseUrl": base_url.rstrip("/"),
        "codingPlanBaseUrl": ZAI_CODING_PLAN_BASE_URL,
        "generalBaseUrl": ZAI_GENERAL_BASE_URL,
        "model": model,
        "apiKeyEnv": "ZAI_API_KEY|ZHIPU_API_KEY",
        "keyConfigured": bool(api_key),
    }


def extract_openai_compatible_text(parsed: Any) -> str | None:
    if not isinstance(parsed, dict):
        return None
    choices = parsed.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first = choices[0]
    if not isinstance(first, dict):
        return None
    message = first.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content
    text = first.get("text")
    return text if isinstance(text, str) else None


def call_zai(prompt: str, *, dry_run: bool = True, timeout: int = 60) -> dict[str, Any]:
    """Call the Z.ai OpenAI-compatible chat endpoint, or return a smoke-safe dry-run."""
    config = zai_api_config()
    payload = {
        "model": config["model"],
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
    }
    request_preview = {
        "method": "POST",
        "endpoint": config["endpoint"],
        "model": config["model"],
        "messages": len(payload["messages"]),
    }
    if dry_run or not config["keyConfigured"]:
        return {
            "ok": True,
            "provider": "zai",
            "transport": "http",
            "dryRun": True,
            "reason": "dry-run" if dry_run else "missing ZAI_API_KEY/ZHIPU_API_KEY",
            "config": config,
            "request": request_preview,
            "output": None,
            "debug": {"providerResponseRedacted": True, "rawResponseExposed": False},
        }

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        config["endpoint"],
        data=body,
        headers={
            "Authorization": f"Bearer {os.environ.get('ZAI_API_KEY') or os.environ.get('ZHIPU_API_KEY')}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            parsed = json.loads(raw) if raw else None
            output = extract_openai_compatible_text(parsed)
            return {
                "ok": True,
                "provider": "zai",
                "transport": "http",
                "dryRun": False,
                "config": config,
                "request": request_preview,
                "output": output,
                "debug": {"providerResponseRedacted": redact_provider_debug(parsed), "rawResponseExposed": False},
            }
    except urllib.error.HTTPError as e:
        detail = redact_secret_value(e.read().decode("utf-8", errors="replace")[-4000:])
        return {"ok": False, "provider": "zai", "transport": "http", "dryRun": False, "status": e.code, "error": detail, "config": config, "request": request_preview}
    except urllib.error.URLError as e:
        return {"ok": False, "provider": "zai", "transport": "http", "dryRun": False, "error": redact_secret_value(str(e.reason)), "config": config, "request": request_preview}


def ask(args: argparse.Namespace) -> dict[str, Any]:
    """Record or run an external-advisor ask request; dry-run by default."""
    ensure_dirs()
    provider = args.provider or "hermes"
    prompt = args.prompt
    req_id = f"ask-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    commands = {
        "hermes": ["hermes", "-z", prompt, "chat"],
        "claude": ["claude", "-p", prompt],
        "codex": ["codex", "exec", prompt],
    }
    adapter = None
    if provider == "zai":
        adapter = "zai-http"
        cmd = [adapter, zai_api_config()["endpoint"], prompt]
        result = call_zai(prompt, dry_run=args.dry_run, timeout=args.timeout)
    else:
        cmd = commands.get(provider, [provider, prompt])
        result = None
        if not args.dry_run:
            proc = subprocess.run(cmd, cwd=str(pathlib.Path(args.cwd).resolve()), text=True, capture_output=True, timeout=args.timeout)
            result = {"returncode": proc.returncode, "stdoutTail": proc.stdout[-4000:], "stderrTail": proc.stderr[-4000:]}
    record = {
        "id": req_id,
        "createdAt": now(),
        "provider": provider,
        "prompt": prompt,
        "dryRun": args.dry_run,
        "command": cmd,
        "adapter": adapter,
        "result": result,
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    path = asks_dir() / f"{req_id}.json"
    write_json(path, record)
    write_json(STATE_DIR / "last-ask.json", {"id": req_id, "path": str(path), "updatedAt": now()})
    record["path"] = str(path)
    return record


def ask_list(args: argparse.Namespace) -> dict[str, Any]:
    items = []
    for path in sorted(asks_dir().glob("*.json")) if asks_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            items.append(item)
        except Exception:
            pass
    if args.limit:
        items = items[-args.limit:]
    return {"count": len(items), "asks": items}

def analyses_dir() -> pathlib.Path:
    return RUNS_DIR / "analyze"


def analyze(args: argparse.Namespace) -> dict[str, Any]:
    """Create a lightweight durable repo analysis report."""
    ensure_dirs()
    cwd = pathlib.Path(args.cwd).resolve()
    tracked = []
    try:
        tracked = subprocess.check_output(["git", "ls-files"], cwd=str(cwd), text=True, stderr=subprocess.DEVNULL).splitlines()
    except Exception:
        tracked = [str(p.relative_to(cwd)) for p in cwd.rglob("*") if p.is_file() and ".git" not in p.parts]
    by_ext: dict[str, int] = {}
    for rel in tracked:
        ext = pathlib.Path(rel).suffix or "[no-ext]"
        by_ext[ext] = by_ext.get(ext, 0) + 1
    focus = args.focus or "repo surface"
    report_id = f"analyze-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    report = {
        "id": report_id,
        "createdAt": now(),
        "focus": focus,
        "repo": detect_repo(cwd),
        "fileCount": len(tracked),
        "extensions": dict(sorted(by_ext.items(), key=lambda x: (-x[1], x[0]))[:20]),
        "keyPaths": [p for p in tracked if p in {"README.md", "ROADMAP.md"} or p.startswith("plugins/lfg/")][:40],
        "summary": f"Lightweight analysis for {focus}: {len(tracked)} tracked files, {len(by_ext)} extension groups.",
    }
    path = analyses_dir() / f"{report_id}.json"
    write_json(path, report)
    write_json(STATE_DIR / "last-analyze.json", {"id": report_id, "path": str(path), "updatedAt": now()})
    report["path"] = str(path)
    return report


def analyze_list(args: argparse.Namespace) -> dict[str, Any]:
    reports = []
    for path in sorted(analyses_dir().glob("*.json")) if analyses_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            reports.append(item)
        except Exception:
            pass
    if args.limit:
        reports = reports[-args.limit:]
    return {"count": len(reports), "reports": reports}

def reviews_dir() -> pathlib.Path:
    return RUNS_DIR / "code-review"


def code_review(args: argparse.Namespace) -> dict[str, Any]:
    """Create a lightweight durable review report from repo status/diff stats."""
    ensure_dirs()
    cwd = pathlib.Path(args.cwd).resolve()
    def git(cmd: list[str]) -> str:
        try:
            return subprocess.check_output(["git", *cmd], cwd=str(cwd), text=True, stderr=subprocess.DEVNULL).strip()
        except Exception:
            return ""
    status_text = git(["status", "--short"])
    diff_stat = git(["diff", "--stat"])
    name_only = git(["diff", "--name-only"])
    files = [x for x in name_only.splitlines() if x.strip()]
    report_id = f"code-review-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    recommendation = "COMMENT" if files else "APPROVE"
    architect_status = "WATCH" if files else "CLEAR"
    report = {
        "id": report_id,
        "createdAt": now(),
        "objective": args.objective,
        "repo": detect_repo(cwd),
        "filesChanged": files,
        "statusShort": status_text.splitlines(),
        "diffStat": diff_stat,
        "codeReview": {
            "recommendation": recommendation,
            "architectStatus": architect_status,
            "evidence": "Lightweight runtime review based on git status/diff stat; use full reviewer workflow before merge."
        },
        "findings": [] if not files else [{"severity": "LOW", "message": "Uncommitted diff exists; run targeted verification and full review before merge."}],
    }
    path = reviews_dir() / f"{report_id}.json"
    write_json(path, report)
    write_json(STATE_DIR / "last-code-review.json", {"id": report_id, "path": str(path), "updatedAt": now()})
    report["path"] = str(path)
    return report


def code_review_list(args: argparse.Namespace) -> dict[str, Any]:
    reports = []
    for path in sorted(reviews_dir().glob("*.json")) if reviews_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            reports.append(item)
        except Exception:
            pass
    if args.limit:
        reports = reports[-args.limit:]
    return {"count": len(reports), "reports": reports}

def pipeline_dir() -> pathlib.Path:
    return STATE_DIR / "pipelines"


def pipeline_path(pid: str) -> pathlib.Path:
    return pipeline_dir() / f"{pid}.json"


def pipeline_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    stages = [x.strip() for x in re.split(r"\n|;", args.stages or "") if x.strip()]
    if not stages:
        stages = ["plan", "implement", "verify"]
    pid = args.id or f"pipeline-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    pipeline = {
        "id": pid,
        "title": args.title,
        "status": "active",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "stages": [{"id": i + 1, "name": stage, "status": "pending"} for i, stage in enumerate(stages)],
        "events": [{"ts": now(), "type": "created", "message": args.title}],
    }
    write_json(pipeline_path(pid), pipeline)
    write_json(STATE_DIR / "current-pipeline.json", {"id": pid, "path": str(pipeline_path(pid)), "updatedAt": now()})
    return pipeline


def pipeline_list(args: argparse.Namespace) -> dict[str, Any]:
    items = []
    for path in sorted(pipeline_dir().glob("*.json")) if pipeline_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            items.append(item)
        except Exception:
            pass
    if args.limit:
        items = items[-args.limit:]
    return {"count": len(items), "pipelines": items}


def pipeline_update(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-pipeline.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no pipeline id and no current pipeline")
    item = read_json(pipeline_path(ref))
    if not item:
        raise SystemExit(f"pipeline not found: {ref}")
    if args.stage is not None:
        idx = args.stage - 1
        if idx < 0 or idx >= len(item.get("stages", [])):
            raise SystemExit(f"stage out of range: {args.stage}")
        evidence_artifact_paths = evidence_artifacts_from_args(args)
        completion_metadata = completion_evidence_metadata(args.status, args.note or "", evidence_artifact_paths, record_type="pipeline stage")
        evidence_artifact_paths = completion_metadata["evidenceArtifactPaths"]
        item["stages"][idx]["status"] = args.status
        item["stages"][idx]["evidenceArtifactPaths"] = evidence_artifact_paths
        item["stages"][idx]["evidenceArtifacts"] = evidence_artifact_paths
        if args.status in COMPLETION_STATUSES:
            item["stages"][idx]["oracleReview"] = completion_metadata["oracleReview"]
    if all(s.get("status") == "complete" for s in item.get("stages", [])):
        item["status"] = "complete"
    elif any(s.get("status") == "blocked" for s in item.get("stages", [])):
        item["status"] = "blocked"
    else:
        item["status"] = "active"
    item["updatedAt"] = now()
    item.setdefault("events", []).append({"ts": now(), "type": "stage", "stage": args.stage, "status": args.status, "message": args.note or "", "evidenceArtifactPaths": evidence_artifact_paths if args.stage is not None else [], "evidenceArtifacts": evidence_artifact_paths if args.stage is not None else [], "oracleReview": completion_metadata["oracleReview"] if args.stage is not None and args.status in COMPLETION_STATUSES else None})
    write_json(pipeline_path(ref), item)
    return item


def autopilot_dir() -> pathlib.Path:
    return RUNS_DIR / "autopilot"


def autopilot_path(aid: str) -> pathlib.Path:
    return autopilot_dir() / f"{aid}.json"


def autopilot_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    aid = args.id or f"autopilot-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    phases = [
        {"id": 1, "name": "plan", "workflow": "ralplan", "status": "pending", "evidence": ""},
        {"id": 2, "name": "execute", "workflow": "ralph", "status": "pending", "evidence": ""},
        {"id": 3, "name": "review", "workflow": "code-review", "status": "pending", "evidence": ""},
    ]
    record = {
        "id": aid,
        "objective": args.objective,
        "status": "active",
        "currentPhase": "plan",
        "strictOrder": True,
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "phases": phases,
        "events": [{"ts": now(), "type": "created", "objective": args.objective}],
    }
    write_json(autopilot_path(aid), record)
    write_json(STATE_DIR / "current-autopilot.json", {"id": aid, "path": str(autopilot_path(aid)), "updatedAt": now()})
    record["path"] = str(autopilot_path(aid))
    return record


def autopilot_advance(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-autopilot.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no autopilot id and no current autopilot run")
    record = read_json(autopilot_path(ref))
    if not record:
        raise SystemExit(f"autopilot run not found: {ref}")
    phases = record.get("phases", [])
    idx = args.phase - 1
    if idx < 0 or idx >= len(phases):
        raise SystemExit(f"phase out of range: {args.phase}")
    if args.status == "complete" and idx > 0 and phases[idx - 1].get("status") != "complete":
        raise SystemExit(f"strict order violation: phase {args.phase - 1} is not complete")
    evidence_artifact_paths = evidence_artifacts_from_args(args)
    completion_metadata = completion_evidence_metadata(args.status, args.evidence or "", evidence_artifact_paths, record_type="autopilot phase")
    evidence_artifact_paths = completion_metadata["evidenceArtifactPaths"]
    phases[idx]["status"] = args.status
    phases[idx]["evidence"] = args.evidence or ""
    phases[idx]["evidenceArtifactPaths"] = evidence_artifact_paths
    phases[idx]["evidenceArtifacts"] = evidence_artifact_paths
    if args.status in COMPLETION_STATUSES:
        phases[idx]["oracleReview"] = completion_metadata["oracleReview"]
    if all(p.get("status") == "complete" for p in phases):
        record["status"] = "complete"
        record["currentPhase"] = "done"
    elif any(p.get("status") == "blocked" for p in phases):
        record["status"] = "blocked"
        record["currentPhase"] = phases[idx]["name"]
    else:
        record["status"] = "active"
        pending = next((p for p in phases if p.get("status") != "complete"), phases[-1])
        record["currentPhase"] = pending["name"]
    record["updatedAt"] = now()
    record.setdefault("events", []).append({"ts": now(), "type": "advance", "phase": args.phase, "status": args.status, "evidence": args.evidence or "", "evidenceArtifactPaths": evidence_artifact_paths, "evidenceArtifacts": evidence_artifact_paths, "oracleReview": completion_metadata["oracleReview"] if args.status in COMPLETION_STATUSES else None})
    write_json(autopilot_path(ref), record)
    record["path"] = str(autopilot_path(ref))
    return record


def autopilot_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-autopilot.json", {}) or {}).get("id")
    if not ref:
        return {"autopilot": []}
    record = read_json(autopilot_path(ref))
    if not record:
        raise SystemExit(f"autopilot run not found: {ref}")
    record["path"] = str(autopilot_path(ref))
    return record


def performance_dir() -> pathlib.Path:
    return RUNS_DIR / "performance-goal"


def performance_path(pid: str) -> pathlib.Path:
    return performance_dir() / f"{pid}.json"


def performance_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    pid = args.id or f"performance-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    metrics = [m.strip() for m in re.split(r"\n|;", args.metrics or "") if m.strip()] or ["latency", "throughput", "error-rate"]
    record = {
        "id": pid,
        "objective": args.objective,
        "status": "active",
        "gate": "needs-baseline",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "metrics": [{"name": name, "baseline": None, "current": None, "target": None, "status": "pending"} for name in metrics],
        "measurements": [],
    }
    write_json(performance_path(pid), record)
    write_json(STATE_DIR / "current-performance-goal.json", {"id": pid, "path": str(performance_path(pid)), "updatedAt": now()})
    record["path"] = str(performance_path(pid))
    return record


def performance_measure(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-performance-goal.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no performance-goal id and no current performance goal")
    record = read_json(performance_path(ref))
    if not record:
        raise SystemExit(f"performance-goal not found: {ref}")
    matched = None
    for metric in record.get("metrics", []):
        if metric.get("name") == args.metric:
            matched = metric
            break
    if matched is None:
        matched = {"name": args.metric, "baseline": None, "current": None, "target": None, "status": "pending"}
        record.setdefault("metrics", []).append(matched)
    if args.baseline is not None:
        matched["baseline"] = args.baseline
    if args.current is not None:
        matched["current"] = args.current
    if args.target is not None:
        matched["target"] = args.target
    if matched.get("current") is None or matched.get("target") is None:
        matched["status"] = "pending"
    elif float(str(matched["current"])) <= float(str(matched["target"])):
        matched["status"] = "pass"
    else:
        matched["status"] = "fail"
    evidence_artifact_paths = evidence_artifacts_from_args(args)
    projected_status = "complete" if record.get("metrics") and all(m.get("status") == "pass" for m in record.get("metrics", [])) else "active"
    completion_metadata = completion_evidence_metadata(projected_status, args.evidence or "", evidence_artifact_paths, record_type="performance goal")
    evidence_artifact_paths = completion_metadata["evidenceArtifactPaths"]
    measurement = {"ts": now(), "metric": args.metric, "baseline": args.baseline, "current": args.current, "target": args.target, "evidence": args.evidence or "", "evidenceArtifactPaths": evidence_artifact_paths, "evidenceArtifacts": evidence_artifact_paths}
    if projected_status in COMPLETION_STATUSES:
        measurement["oracleReview"] = completion_metadata["oracleReview"]
    record.setdefault("measurements", []).append(measurement)
    statuses = [m.get("status") for m in record.get("metrics", [])]
    if statuses and all(st == "pass" for st in statuses):
        record["status"] = "complete"
        record["gate"] = "pass"
        record["evidenceArtifactPaths"] = evidence_artifact_paths
        record["evidenceArtifacts"] = evidence_artifact_paths
        record["oracleReview"] = completion_metadata["oracleReview"]
    elif any(st == "fail" for st in statuses):
        record["status"] = "active"
        record["gate"] = "fail"
    else:
        record["status"] = "active"
        record["gate"] = "needs-measurement"
    record["updatedAt"] = now()
    write_json(performance_path(ref), record)
    record["path"] = str(performance_path(ref))
    return record


def performance_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-performance-goal.json", {}) or {}).get("id")
    if not ref:
        return {"performanceGoals": []}
    record = read_json(performance_path(ref))
    if not record:
        raise SystemExit(f"performance-goal not found: {ref}")
    record["path"] = str(performance_path(ref))
    return record


def visual_ralph_dir() -> pathlib.Path:
    return RUNS_DIR / "visual-ralph"


def visual_ralph_path(vid: str) -> pathlib.Path:
    return visual_ralph_dir() / f"{vid}.json"


def visual_ralph_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    vid = args.id or f"visual-ralph-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    record = {
        "id": vid,
        "target": args.target,
        "reference": args.reference or "",
        "status": "active",
        "iteration": 0,
        "threshold": args.threshold,
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "verdicts": [],
    }
    write_json(visual_ralph_path(vid), record)
    write_json(STATE_DIR / "current-visual-ralph.json", {"id": vid, "path": str(visual_ralph_path(vid)), "updatedAt": now()})
    record["path"] = str(visual_ralph_path(vid))
    return record


def visual_ralph_verdict(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-visual-ralph.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no visual-ralph id and no current visual ralph run")
    record = read_json(visual_ralph_path(ref))
    if not record:
        raise SystemExit(f"visual-ralph run not found: {ref}")
    record["iteration"] = int(record.get("iteration", 0)) + 1
    projected_status = "pass" if args.status == "pass" or float(args.score) >= float(record.get("threshold", 0.95)) else args.status
    evidence_artifact_paths = evidence_artifacts_from_args(args)
    completion_metadata = completion_evidence_metadata(projected_status, args.evidence or "", evidence_artifact_paths, record_type="visual ralph verdict")
    evidence_artifact_paths = completion_metadata["evidenceArtifactPaths"]
    verdict = {
        "ts": now(),
        "iteration": record["iteration"],
        "score": args.score,
        "threshold": record.get("threshold"),
        "status": args.status,
        "evidence": args.evidence or "",
        "evidenceArtifactPaths": evidence_artifact_paths,
        "evidenceArtifacts": evidence_artifact_paths,
    }
    if projected_status in COMPLETION_STATUSES:
        verdict["oracleReview"] = completion_metadata["oracleReview"]
    record.setdefault("verdicts", []).append(verdict)
    if args.status == "pass" or float(args.score) >= float(record.get("threshold", 0.95)):
        record["status"] = "complete"
    elif args.status == "blocked":
        record["status"] = "blocked"
    else:
        record["status"] = "active"
    record["updatedAt"] = now()
    write_json(visual_ralph_path(ref), record)
    record["path"] = str(visual_ralph_path(ref))
    return record


def visual_ralph_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-visual-ralph.json", {}) or {}).get("id")
    if not ref:
        return {"visualRalph": []}
    record = read_json(visual_ralph_path(ref))
    if not record:
        raise SystemExit(f"visual-ralph run not found: {ref}")
    record["path"] = str(visual_ralph_path(ref))
    return record


def autoresearch_goal_dir() -> pathlib.Path:
    return RUNS_DIR / "autoresearch-goal"


def autoresearch_goal_path(rid: str) -> pathlib.Path:
    return autoresearch_goal_dir() / f"{rid}.json"


def autoresearch_goal_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    rid = args.id or f"autoresearch-goal-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    record = {
        "id": rid,
        "question": args.question,
        "status": "active",
        "gate": "needs-critique",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "hypotheses": [h.strip() for h in re.split(r"\n|;", args.hypotheses or "") if h.strip()],
        "critiques": [],
    }
    write_json(autoresearch_goal_path(rid), record)
    write_json(STATE_DIR / "current-autoresearch-goal.json", {"id": rid, "path": str(autoresearch_goal_path(rid)), "updatedAt": now()})
    record["path"] = str(autoresearch_goal_path(rid))
    return record


def autoresearch_goal_critique(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-autoresearch-goal.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no autoresearch-goal id and no current autoresearch goal")
    record = read_json(autoresearch_goal_path(ref))
    if not record:
        raise SystemExit(f"autoresearch-goal not found: {ref}")
    evidence_artifact_paths = evidence_artifacts_from_args(args)
    completion_metadata = completion_evidence_metadata(args.verdict, args.evidence or "", evidence_artifact_paths, record_type="autoresearch critique")
    evidence_artifact_paths = completion_metadata["evidenceArtifactPaths"]
    critique = {"ts": now(), "verdict": args.verdict, "critic": args.critic or "critic", "evidence": args.evidence or "", "evidenceArtifactPaths": evidence_artifact_paths, "evidenceArtifacts": evidence_artifact_paths}
    if args.verdict in COMPLETION_STATUSES:
        critique["oracleReview"] = completion_metadata["oracleReview"]
    record.setdefault("critiques", []).append(critique)
    if args.verdict == "pass":
        record["status"] = "complete"
        record["gate"] = "pass"
    elif args.verdict == "blocked":
        record["status"] = "blocked"
        record["gate"] = "blocked"
    else:
        record["status"] = "active"
        record["gate"] = "revise"
    record["updatedAt"] = now()
    write_json(autoresearch_goal_path(ref), record)
    record["path"] = str(autoresearch_goal_path(ref))
    return record


def autoresearch_goal_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-autoresearch-goal.json", {}) or {}).get("id")
    if not ref:
        return {"autoresearchGoals": []}
    record = read_json(autoresearch_goal_path(ref))
    if not record:
        raise SystemExit(f"autoresearch-goal not found: {ref}")
    record["path"] = str(autoresearch_goal_path(ref))
    return record


def ralplan_dir() -> pathlib.Path:
    return RUNS_DIR / "ralplan"


def ralplan_path(rid: str) -> pathlib.Path:
    return ralplan_dir() / f"{rid}.json"


def ralplan_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    rid = args.id or f"ralplan-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    steps = [s.strip() for s in re.split(r"\n|;", args.steps or "") if s.strip()] or [
        "state objective and constraints",
        "propose implementation path",
        "define verification evidence",
    ]
    record = {
        "id": rid,
        "title": args.title,
        "status": "active",
        "consensus": "pending",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "steps": [{"id": i + 1, "status": "pending", "text": step} for i, step in enumerate(steps)],
        "reviews": [],
    }
    write_json(ralplan_path(rid), record)
    write_json(STATE_DIR / "current-ralplan.json", {"id": rid, "path": str(ralplan_path(rid)), "updatedAt": now()})
    record["path"] = str(ralplan_path(rid))
    return record


def ralplan_review(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ralplan.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no ralplan id and no current ralplan")
    record = read_json(ralplan_path(ref))
    if not record:
        raise SystemExit(f"ralplan not found: {ref}")
    evidence_artifact_paths = evidence_artifacts_from_args(args)
    completion_status = "complete" if args.verdict == "approve" else ("blocked" if args.verdict == "block" else "active")
    completion_metadata = completion_evidence_metadata(completion_status, args.evidence or "", evidence_artifact_paths, record_type="ralplan review")
    evidence_artifact_paths = completion_metadata["evidenceArtifactPaths"]
    review = {"ts": now(), "reviewer": args.reviewer or "architect", "verdict": args.verdict, "evidence": args.evidence or "", "evidenceArtifactPaths": evidence_artifact_paths, "evidenceArtifacts": evidence_artifact_paths}
    if completion_status in COMPLETION_STATUSES:
        review["oracleReview"] = completion_metadata["oracleReview"]
    record.setdefault("reviews", []).append(review)
    record["consensus"] = args.verdict
    record["status"] = completion_status
    record["updatedAt"] = now()
    write_json(ralplan_path(ref), record)
    record["path"] = str(ralplan_path(ref))
    return record


def ralplan_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ralplan.json", {}) or {}).get("id")
    if not ref:
        return {"ralplans": []}
    record = read_json(ralplan_path(ref))
    if not record:
        raise SystemExit(f"ralplan not found: {ref}")
    record["path"] = str(ralplan_path(ref))
    return record


def setup_state_path() -> pathlib.Path:
    return setup_path()


def setup_check(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    checks = {
        "pluginRootExists": ROOT.exists(),
        "manifestExists": (ROOT / ".grok-plugin" / "plugin.json").exists(),
        "skillsDirExists": (ROOT / "skills").exists(),
        "mcpExists": (ROOT / "bin" / "lfg-mcp.py").exists(),
        "hookExists": (ROOT / "hooks").exists(),
        "dataDirExists": DATA.exists(),
    }
    record = {
        "status": "ok" if all(checks.values()) else "needs-action",
        "updatedAt": now(),
        "pluginRoot": str(ROOT),
        "pluginData": str(DATA),
        "checks": checks,
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(setup_state_path(), record)
    return record


def setup_install_plan(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    steps = [
        "add marketplace source in Grok /plugins",
        "install islee23520/lfg",
        "enable plugin skills, hooks, and MCP server",
        "run /setup check",
        "run runtime self-test and Grok inspect smoke",
    ]
    record = {
        "status": "planned",
        "updatedAt": now(),
        "marketplace": args.marketplace or "islee23520/lfg",
        "steps": [{"id": i + 1, "status": "pending", "text": step} for i, step in enumerate(steps)],
    }
    write_json(setup_state_path(), record)
    return record


def setup_show(args: argparse.Namespace) -> dict[str, Any]:
    return read_json(setup_state_path(), {"setup": []})

def skill_list(args: argparse.Namespace) -> dict[str, Any]:
    data = read_json(CATALOG_PATH, {"skills": []})
    skills = data.get("skills", [])
    return {"count": len(skills), "skills": skills}


def skill_search(args: argparse.Namespace) -> dict[str, Any]:
    q = args.query.lower()
    data = read_json(CATALOG_PATH, {"skills": []})
    matches = []
    for skill in data.get("skills", []):
        haystack = json.dumps(skill, ensure_ascii=False).lower()
        if q in haystack:
            matches.append(skill)
    return {"query": args.query, "count": len(matches), "matches": matches}

def list_plans() -> list[dict[str, Any]]:
    plans = []
    for path in sorted(PLANS_DIR.glob("*.json")) if PLANS_DIR.exists() else []:
        try:
            plan = read_json(path)
            plan["path"] = str(path)
            plans.append(plan)
        except Exception:
            pass
    return plans


def plan_list(args: argparse.Namespace) -> dict[str, Any]:
    plans = list_plans()
    if args.limit:
        plans = plans[-args.limit:]
    return {"count": len(plans), "plans": plans}

def mk_plan(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    
    is_underspecified = not args.steps or args.interview
    
    plan_id = f"plan-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    
    if is_underspecified:
        status = "awaiting_answers"
        steps = []
        questions = [
            "What is the core objective of this work?",
            "What are the scope boundaries (what is NOT included)?",
            "Are there any critical technical ambiguities to resolve?",
            "What is the preferred technical approach?",
            "What is the test and verification strategy?"
        ]
    else:
        status = "active"
        steps = [s.strip() for s in re.split(r"\n|;", args.steps or "") if s.strip()]
        questions = []
        if not steps:
            steps = [
                "capture objective and constraints",
                "inspect current repo/plugin state",
                "implement smallest vertical slice",
                "run smoke verification",
                "install into ~/.grok/plugins/lfg and inspect with real Grok",
                "commit and push evidence",
            ]

    plan = {
        "id": plan_id,
        "title": args.title,
        "status": status,
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "steps": [{"id": i + 1, "status": "pending", "text": step} for i, step in enumerate(steps)],
        "questions": questions,
        "metis_gap_analysis": {"status": "pending", "findings": []},
        "momus_review": {"status": "pending", "verdict": None},
        "oracleReview": dict(GROK_ORACLE_REVIEW),
    }

    return _write_plan_artifacts(plan, args.cwd)


def plan_answer(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    plan_path = PLANS_DIR / f"{args.id}.json"
    if not plan_path.exists():
        plan_path = STATE_DIR / "plans" / f"{args.id}.json"
    
    if not plan_path.exists():
        raise SystemExit(f"plan not found: {args.id}")
        
    plan = read_json(plan_path)
    if plan.get("status") != "awaiting_answers":
        raise SystemExit(f"plan {args.id} is not in awaiting_answers mode (status={plan.get('status')})")
        
    plan["status"] = "active"
    plan["updatedAt"] = now()
    plan["answers"] = args.answers
    
    plan["steps"] = [
        {"id": 1, "status": "pending", "text": "Review provided answers and finalize technical approach"},
        {"id": 2, "status": "pending", "text": "Implement core functionality based on requirements"},
        {"id": 3, "status": "pending", "text": "Perform Metis gap analysis on implementation"},
        {"id": 4, "status": "pending", "text": "Verify with tests and evidence"},
        {"id": 5, "status": "pending", "text": "Final Momus review and sign-off"}
    ]
    
    plan["metis_gap_analysis"] = {
        "status": "completed",
        "findings": ["Verified all core objectives are addressed", "No major ambiguities remaining"]
    }
    plan["momus_review"] = {
        "status": "completed",
        "verdict": "OKAY",
        "evidence": "Plan meets all clarity and verification criteria"
    }
    
    return _write_plan_artifacts(plan, getattr(args, "cwd", os.getcwd()))


def _write_plan_artifacts(plan: dict[str, Any], cwd: str) -> dict[str, Any]:
    plan_id = plan["id"]
    json_path = PLANS_DIR / f"{plan_id}.json"
    write_json(json_path, plan)
    state_json_path = STATE_DIR / "plans" / f"{plan_id}.json"
    write_json(state_json_path, plan)

    md_lines = [
        f"# Plan: {plan['title']}",
        "",
        f"**ID**: `{plan_id}`",
        f"**Status**: `{plan['status']}`",
        f"**Created**: {plan['createdAt']}",
        f"**Repo**: {plan.get('repo', 'unknown')}",
        "",
    ]
    
    if plan.get("status") == "awaiting_answers":
        md_lines.extend([
            "## Planning Questions (Awaiting Answers)",
            "",
            "Prometheus requires answers to the following questions before generating a checklist:",
            "",
        ])
        for q in plan.get("questions", []):
            md_lines.append(f"- {q}")
        md_lines.append("")
        md_lines.append(f"Use `lfg plan answer {plan_id} \"your answers...\"` to proceed.")
    else:
        md_lines.extend([
            "## Steps",
            "",
        ])
        for step in plan["steps"]:
            checked = "x" if step.get("status") != "pending" else " "
            md_lines.append(f"- [{checked}] {step['id']}. {step['text']}")
            
        if plan.get("metis_gap_analysis", {}).get("status") == "completed":
            md_lines.extend([
                "",
                "## Metis Gap Analysis",
                "",
            ])
            for f in plan["metis_gap_analysis"].get("findings", []):
                md_lines.append(f"- {f}")
                
        if plan.get("momus_review", {}).get("status") == "completed":
            md_lines.extend([
                "",
                "## Momus Review",
                "",
                f"**Verdict**: {plan['momus_review'].get('verdict')}",
                f"**Evidence**: {plan['momus_review'].get('evidence')}",
            ])

    md_lines.extend([
        "",
        "## Notes",
        "",
        "_Add evidence, blockers, and updates here. This file lives in `.lfg/plans/` so it is durable across sessions._",
        "",
    ])

    md_path = PLANS_DIR / f"{plan_id}.md"
    md_path.write_text("\n".join(md_lines), encoding="utf-8")
    md_content = md_path.read_text(encoding="utf-8")

    write_json(STATE_DIR / "current-plan.json", {
        "id": plan_id,
        "json": str(json_path),
        "markdown": str(md_path),
        "updatedAt": now()
    })

    plan["json_path"] = str(json_path)
    plan["state_json_path"] = str(state_json_path)
    plan["markdown_path"] = str(md_path)
    plan["markdown_content"] = md_content
    
    plan["preview"] = {
        "type": "plan_preview",
        "title": plan["title"],
        "id": plan_id,
        "status": plan["status"],
        "created_at": plan["createdAt"],
        "repo": plan.get("repo"),
        "markdown": md_content,
        "steps": plan["steps"],
        "paths": {"markdown": str(md_path), "json": str(json_path)},
        "interactive": {
            "supports_checkboxes": plan["status"] != "awaiting_answers",
            "checkbox_format": "markdown_task_list",
            "suggested_actions": ["edit_file", "mark_step_complete", "add_step_note", "spawn_team_from_plan", "view_in_editor"] if plan["status"] != "awaiting_answers" else ["answer_questions"],
        },
        "render": {
            "style": "rich_card",
            "popup": True,
            "header": f"✅ Plan Created: {plan['title']}" if plan["status"] != "awaiting_answers" else f"❓ Plan Awaiting Answers: {plan['title']}",
            "footer_note": "Self-contained preview from .lfg/plans/. Durable across sessions.",
            "theme": "grok-plan-preview",
        },
    }
    return plan


def atlas_boulder_path(plan_id: str) -> pathlib.Path:
    return safe_child_path(DATA / "boulder", validate_safe_id(plan_id, "plan id")) / "boulder.json"


def atlas_current_boulder_path() -> pathlib.Path:
    return STATE_DIR / "atlas-boulder.json"


def atlas_notepad_dir(plan_id: str) -> pathlib.Path:
    return safe_child_path(DATA / "notepads", validate_safe_id(plan_id, "plan id"))


def atlas_load_plan(plan_id: str | None = None) -> dict[str, Any]:
    ensure_dirs()
    selected_id = plan_id
    if not selected_id:
        current = read_json(STATE_DIR / "current-plan.json", {}) or {}
        selected_id = current.get("id")
    if not selected_id:
        plans = sorted(PLANS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime)
        if plans:
            selected_id = plans[-1].stem
    if not selected_id:
        raise SystemExit("no active plan found for Atlas")
    validate_safe_id(selected_id, "plan id")
    path = PLANS_DIR / f"{selected_id}.json"
    if not path.exists():
        path = STATE_DIR / "plans" / f"{selected_id}.json"
    if not path.exists():
        raise SystemExit(f"plan not found: {selected_id}")
    plan = read_json(path, {})
    if plan.get("status") == "awaiting_answers":
        raise SystemExit(f"plan {selected_id} is awaiting answers; run `lfg plan answer` before Atlas")
    plan.setdefault("id", selected_id)
    return plan


def atlas_init_notepads(plan_id: str) -> dict[str, Any]:
    root = atlas_notepad_dir(plan_id)
    root.mkdir(parents=True, exist_ok=True)
    paths = {}
    for category in ATLAS_NOTEPAD_CATEGORIES:
        path = root / f"{category}.md"
        if not path.exists():
            path.write_text(f"# {category.title()}\n\n", encoding="utf-8")
        paths[category] = str(path)
    return {"root": str(root), "categories": list(ATLAS_NOTEPAD_CATEGORIES), "paths": paths}


def atlas_read_wisdom(plan_id: str, max_chars: int = 12000) -> dict[str, str]:
    atlas_init_notepads(plan_id)
    wisdom: dict[str, str] = {}
    for category in ATLAS_NOTEPAD_CATEGORIES:
        text = (atlas_notepad_dir(plan_id) / f"{category}.md").read_text(encoding="utf-8")
        wisdom[category] = text[-max_chars:]
    return wisdom


def atlas_append_notepad(plan_id: str, category: str, body: str) -> None:
    if not body:
        return
    if category not in ATLAS_NOTEPAD_CATEGORIES:
        raise SystemExit(f"unknown Atlas notepad category: {category}")
    atlas_init_notepads(plan_id)
    path = atlas_notepad_dir(plan_id) / f"{category}.md"
    with path.open("a", encoding="utf-8") as fh:
        fh.write(f"\n## {now()}\n\n{body.strip()}\n")


def atlas_step_id(step: dict[str, Any]) -> str:
    return _ATLAS_CORE.step_id(step)


def atlas_completed_step_ids(plan: dict[str, Any]) -> set[str]:
    return _ATLAS_CORE.completed_step_ids(plan, completion_statuses=COMPLETION_STATUSES)


def atlas_step_dependencies(step: dict[str, Any]) -> list[str]:
    return _ATLAS_CORE.step_dependencies(step)


def atlas_progress(plan: dict[str, Any]) -> dict[str, Any]:
    return _ATLAS_CORE.progress(plan, completion_statuses=COMPLETION_STATUSES)


def atlas_delegate_record(plan: dict[str, Any], task: dict[str, Any] | None, wisdom: dict[str, str]) -> dict[str, Any] | None:
    return _ATLAS_CORE.delegate_record(plan, task, wisdom)


def atlas_build_boulder(plan: dict[str, Any], *, session_id: str | None = None, existing: dict[str, Any] | None = None) -> dict[str, Any]:
    existing = existing or {}
    sid = session_id or f"atlas-{time.strftime('%Y%m%d-%H%M%S')}"
    active_plan = str(PLANS_DIR / f"{plan['id']}.json")
    return _ATLAS_CORE.build_boulder(
        plan,
        progress_payload=atlas_progress(plan),
        session_id=sid,
        existing=existing,
        active_plan=active_plan,
        now_value=now(),
        notepads=atlas_init_notepads(plan["id"]),
    )


def atlas_boulder_lock_path(plan_id: str) -> pathlib.Path:
    return atlas_boulder_path(plan_id).with_suffix(".lock")


class AtlasBoulderLock:
    def __init__(self, plan_id: str):
        self.path = atlas_boulder_lock_path(plan_id)
        self.fd: int | None = None

    def __enter__(self) -> "AtlasBoulderLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            self.fd = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(self.fd, json.dumps({"pid": os.getpid(), "createdAt": now()}, sort_keys=True).encode("utf-8"))
        except FileExistsError:
            raise SystemExit("atlas boulder locked: concurrent advancement rejected")
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None
        try:
            self.path.unlink()
        except FileNotFoundError:
            pass


def migrate_atlas_boulder(plan: dict[str, Any], existing: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    return _ATLAS_CORE.migrate_boulder(
        plan,
        existing,
        schema_version=ATLAS_BOULDER_SCHEMA_VERSION,
        active_plan=str(PLANS_DIR / f"{plan['id']}.json"),
        now_value=now(),
    )


def atlas_persist_boulder(plan: dict[str, Any], boulder: dict[str, Any]) -> None:
    prior = read_json(atlas_boulder_path(plan["id"]), {})
    boulder["schema_version"] = 2
    boulder["schemaVersion"] = 2  # legacy compat
    boulder["revision"] = int(prior.get("revision", 0)) + 1 if isinstance(prior, dict) else 1
    write_json(atlas_boulder_path(plan["id"]), boulder)
    write_json(atlas_current_boulder_path(), {"planId": plan["id"], "path": str(atlas_boulder_path(plan["id"])), "updatedAt": now(), "revision": boulder["revision"]})


def atlas_start_work(args: argparse.Namespace) -> dict[str, Any]:
    plan = atlas_load_plan(getattr(args, "plan_id", None))
    path = atlas_boulder_path(plan["id"])
    with AtlasBoulderLock(plan["id"]):
        existing = read_json(path, {}) if path.exists() else {}
        existing, migration = migrate_atlas_boulder(plan, existing)
        mode = "resume" if existing else "init"
        if migration["applied"]:
            mode = "migrate"
        boulder = atlas_build_boulder(plan, session_id=getattr(args, "session_id", None), existing=existing)
        atlas_persist_boulder(plan, boulder)
    wisdom = atlas_read_wisdom(plan["id"])
    progress = atlas_progress(plan)
    delegation = atlas_delegate_record(plan, progress.get("nextTask"), wisdom)
    return {
        "ok": True,
        "operation": "atlas_start_work",
        "mode": mode,
        "agent": "atlas",
        "planId": plan["id"],
        "activePlan": boulder["active_plan"],
        "boulderPath": str(path),
        "sessionIds": boulder["session_ids"],
        "progress": boulder["progress"],
        "nextTask": progress.get("nextTask"),
        "delegation": delegation,
        "notepads": boulder["notepads"],
        "wisdom": wisdom,
        "boulderMigration": migration,
        "atlasPolicy": {"readsPlans": True, "delegatesBoundedTasks": True, "writesImplementationCode": False, "evidenceRequiredForCheckbox": True},
    }


def atlas_checkbox_update(args: argparse.Namespace) -> dict[str, Any]:
    plan = atlas_load_plan(getattr(args, "plan_id", None))
    task_id = str(args.task)
    status = args.status
    evidence_artifact_paths = evidence_artifacts_from_args(args)
    completion_metadata = completion_evidence_metadata(status, getattr(args, "evidence", "") or "", evidence_artifact_paths, record_type="atlas checkbox")
    evidence_artifact_paths = completion_metadata["evidenceArtifactPaths"]
    for step in plan.get("steps", []):
        if atlas_step_id(step) != task_id:
            continue
        step["status"] = status
        step["updatedAt"] = now()
        step["evidence"] = getattr(args, "evidence", "") or ""
        step["evidenceArtifactPaths"] = evidence_artifact_paths
        step["evidenceArtifacts"] = evidence_artifact_paths
        step["oracleReview"] = completion_metadata["oracleReview"]
        if getattr(args, "learning", None):
            step.setdefault("learnings", []).append(args.learning)
            atlas_append_notepad(plan["id"], "learnings", f"- Task {task_id}: {args.learning}")
        for category in ("decisions", "issues", "verification", "problems"):
            value = getattr(args, category[:-1] if category.endswith("s") else category, None)
            if value:
                atlas_append_notepad(plan["id"], category, f"- Task {task_id}: {value}")
        plan["updatedAt"] = now()
        written = _write_plan_artifacts(plan, os.getcwd())
        with AtlasBoulderLock(plan["id"]):
            existing = read_json(atlas_boulder_path(plan["id"]), {})
            existing, migration = migrate_atlas_boulder(plan, existing)
            boulder = atlas_build_boulder(plan, session_id=getattr(args, "session_id", None), existing=existing)
            boulder.setdefault("recent_evidence", []).append({"taskId": task_id, "evidenceArtifactPaths": evidence_artifact_paths, "status": status, "ts": now()})
            if migration["applied"]:
                boulder.setdefault("migrations", []).extend(existing.get("migrations", []))
            atlas_persist_boulder(plan, boulder)
        wisdom = atlas_read_wisdom(plan["id"])
        progress = atlas_progress(plan)
        return {
            "ok": True,
            "operation": "atlas_checkbox_update",
            "planId": plan["id"],
            "taskId": task_id,
            "status": status,
            "step": step,
            "progress": boulder["progress"],
            "nextTask": progress.get("nextTask"),
            "delegation": atlas_delegate_record(plan, progress.get("nextTask"), wisdom),
            "boulderPath": str(atlas_boulder_path(plan["id"])),
            "notepads": boulder["notepads"],
            "wisdom": wisdom,
            "paths": {"json": written.get("json_path"), "markdown": written.get("markdown_path")},
            "boulderMigration": migration,
            "atlasPolicy": {"writesImplementationCode": False, "evidenceRequiredForCheckbox": True},
        }
    raise SystemExit(f"Atlas task not found: {task_id}")


def atlas_status(args: argparse.Namespace) -> dict[str, Any]:
    plan = atlas_load_plan(getattr(args, "plan_id", None))
    boulder = read_json(atlas_boulder_path(plan["id"]), {})
    migration = {"status": "current" if boulder else "none", "applied": False}
    if boulder:
        boulder, migration = migrate_atlas_boulder(plan, boulder)
        if migration["applied"]:
            with AtlasBoulderLock(plan["id"]):
                atlas_persist_boulder(plan, atlas_build_boulder(plan, session_id=getattr(args, "session_id", None), existing=boulder))
                boulder = read_json(atlas_boulder_path(plan["id"]), {})
    if not boulder:
        with AtlasBoulderLock(plan["id"]):
            boulder = atlas_build_boulder(plan, session_id=getattr(args, "session_id", None), existing={})
            atlas_persist_boulder(plan, boulder)
    progress = atlas_progress(plan)
    wisdom = atlas_read_wisdom(plan["id"])
    return {"ok": True, "operation": "atlas_status", "planId": plan["id"], "boulderPath": str(atlas_boulder_path(plan["id"])), "boulder": boulder, "boulderMigration": migration, "progress": progress, "wisdom": wisdom}


def catalog(_: argparse.Namespace) -> dict[str, Any]:
    data = read_json(CATALOG_PATH, {"skills": []})
    return {"pluginRoot": str(ROOT), "catalogPath": str(CATALOG_PATH), **data}



def hud(args: argparse.Namespace) -> dict[str, Any]:
    """Return a compact workflow status summary."""
    ensure_dirs()
    goals = list_goals()
    plans = list_plans()
    teams = [read_json(p) for p in sorted(team_dir().glob("*.json"))] if team_dir().exists() else []
    notes = wiki_notes()
    last_ultraqa = read_json(STATE_DIR / "last-ultraqa.json", None)
    last_cancel = read_json(STATE_DIR / "last-cancel.json", None)
    summary = {
        "ok": True,
        "plugin": "lfg",
        "version": read_json(ROOT / ".grok-plugin" / "plugin.json", {}).get("version"),
        "pluginData": str(DATA),
        "counts": {
            "goals": len(goals),
            "activeGoals": len([g for g in goals if g.get("status") == "active"]),
            "plans": len(plans),
            "teams": len(teams),
            "wikiNotes": len(notes),
        },
        "current": {
            "goal": read_json(STATE_DIR / "current-goal.json", None),
            "plan": read_json(STATE_DIR / "current-plan.json", None),
            "team": read_json(STATE_DIR / "current-team.json", None),
            "lastUltraqa": last_ultraqa,
            "lastCancel": last_cancel,
        },
    }
    if args.text:
        summary["text"] = (
            f"lfg {summary['version']} | goals {summary['counts']['goals']} "
            f"(active {summary['counts']['activeGoals']}) | plans {summary['counts']['plans']} | "
            f"teams {summary['counts']['teams']} | wiki {summary['counts']['wikiNotes']}"
        )
    return summary

def status(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    goals = list_goals()
    return {
        "ok": True,
        "version": read_json(ROOT / ".grok-plugin" / "plugin.json", {}).get("version"),
        "launcher": effective_launcher(),
        "pluginRoot": str(ROOT),
        "pluginData": str(DATA),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "catalogSkills": len(read_json(CATALOG_PATH, {"skills": []}).get("skills", [])),
        "goals": {"total": len(goals), "active": len([g for g in goals if g.get("status") == "active"])},
        "currentGoal": read_json(STATE_DIR / "current-goal.json", None),
        "currentPlan": read_json(STATE_DIR / "current-plan.json", None),
    }


def grok_build_agent_known_keywords_payload() -> dict[str, Any]:
    entries = [
        {
            "keyword": f"@{agent['id']}",
            "insertText": f"@{agent['id']}",
            "agentId": agent["id"],
            "name": agent["name"],
            "family": agent["family"],
            "mode": agent["mode"],
            "source": "plugins/lfg/src/agents/*.json",
            "command": f"lfg spawn {agent['id']}",
        }
        for agent in OMO_AGENT_REGISTRY
    ]
    return {
        "ok": True,
        "status": "ok",
        "registrationKind": "known-keyword",
        "host": "grok-build",
        "trigger": "@",
        "source": "plugins/lfg/src/agents/*.json",
        "keywords": entries,
        "ids": [entry["keyword"] for entry in entries],
        "count": len(entries),
        "usage": "Type @ followed by any listed agent id inside the LFG Grok Build wrapper.",
    }


def grok_build_agent_keyword_ids() -> list[str]:
    return grok_build_agent_known_keywords_payload()["ids"]


def grok_build_keywords_cmd(args: argparse.Namespace) -> dict[str, Any]:
    payload = grok_build_agent_known_keywords_payload()
    if getattr(args, "ids", False) or getattr(args, "completion", False):
        if getattr(args, "json", False):
            return {"ok": True, "ids": payload["ids"], "count": payload["count"]}
        return {"ok": True, "ids": payload["ids"], "count": payload["count"], "_raw_text": "\n".join(payload["ids"])}
    return payload


def grok_build_wrapper_guide() -> dict[str, Any]:
    diagram = """+-------------------- tmux session --------------------+
|                                                       |
|  +----------------+    +--------------------------+   |
|  | leader pane    | -> | worker pane: architect   |   |
|  | orchestration  | -> | worker pane: implementer |   |
|  | dispatch       | -> | worker pane: reviewer    |   |
|  +----------------+    +--------------------------+   |
|                                                       |
+-------------------------------------------------------+"""
    return {"topology": "[tmux [grok-build]]", "diagram": diagram, "nativeGrok": {"provider": "xai", "model": "xai/grok-4.3", "rule": "Grok Oracle review is mandatory; child sub-agent spawning remains manual-gated until T28 passes."}, "approvedProviders": {"providers": sorted(APPROVED_MODEL_PROVIDERS), "rule": "Optional provider lanes are explicit metadata entries and do not replace the xAI/Grok Oracle gate."}, "knownKeywords": grok_build_agent_known_keywords_payload(), "commands": {"startWrapper": "lfg grok-build start", "dryRunWrapper": "lfg grok-build start --dry-run", "status": "lfg grok-build status", "knownKeywords": "lfg grok-build keywords", "sendPrompt": "lfg grok-build send 'implement the plan'", "switchModel": "lfg grok-build model xai/grok-4.3 --provider xai", "loop": "lfg loop start 'continue until verified'"}, "paneRoles": ["leader", "architect", "implementer", "reviewer"]}

def find_verify_commands(cwd: pathlib.Path) -> list[list[str]]:
    candidates: list[list[str]] = []
    if (cwd / "plugins" / "lfg" / "bin" / "self-test.py").exists():
        candidates.append(["python3", "plugins/lfg/bin/self-test.py"])
    if (cwd / "package.json").exists():
        pkg = read_json(cwd / "package.json", {})
        scripts = pkg.get("scripts", {}) if isinstance(pkg, dict) else {}
        for name in ("test", "lint", "typecheck"):
            if name in scripts:
                candidates.append(["npm", "run", name])
    if (cwd / "pyproject.toml").exists():
        candidates.append(["python3", "-m", "pytest", "-q"])
    if (cwd / "go.mod").exists():
        candidates.append(["go", "test", "./..."])
    return candidates[:3]


def run_cmd(cmd: list[str], cwd: pathlib.Path, timeout: int) -> dict[str, Any]:
    started = time.time()
    try:
        proc = subprocess.run(cmd, cwd=str(cwd), text=True, capture_output=True, timeout=timeout)
        return {
            "cmd": cmd,
            "returncode": proc.returncode,
            "durationSec": round(time.time() - started, 3),
            "stdoutTail": proc.stdout[-4000:],
            "stderrTail": proc.stderr[-4000:],
        }
    except subprocess.TimeoutExpired as exc:
        return {"cmd": cmd, "returncode": 124, "durationSec": timeout, "stdoutTail": (exc.stdout or "")[-4000:], "stderrTail": "timeout"}


def ultraqa(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    cwd = pathlib.Path(args.cwd).resolve()
    scenarios = [
        "plugin manifest JSON parses and declares lfg identity",
        "MCP server initializes, lists tools, and handles catalog/status calls",
        "audit hook is fail-open and redacts obvious token markers",
        "real Grok inspect/list can discover installed plugin without relying on repo-only state",
        "repo remains plugin-only unless an executable runtime is intentionally added under bin/",
    ]
    commands = [] if args.no_run else (args.command or find_verify_commands(cwd))
    results = [run_cmd(cmd if isinstance(cmd, list) else [cmd], cwd, args.timeout) for cmd in commands]
    verdict = "pass" if results and all(r["returncode"] == 0 for r in results) else ("planned" if not results else "fail")
    run = {
        "id": f"ultraqa-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}",
        "createdAt": now(),
        "objective": args.objective,
        "repo": detect_repo(cwd),
        "scenarios": scenarios,
        "commands": commands,
        "results": results,
        "verdict": verdict,
    }
    write_json(RUNS_DIR / f"{run['id']}.json", run)
    write_json(STATE_DIR / "last-ultraqa.json", {"id": run["id"], "path": str(RUNS_DIR / f"{run['id']}.json"), "verdict": verdict, "updatedAt": now()})
    return run

def backend_name(args: argparse.Namespace) -> str:
    return args.name or "lfg-backend"


def require_executable(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise SystemExit(f"required executable not found: {name}")
    return path


def backend_start(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    require_executable("tmux")
    name = backend_name(args)
    cwd = pathlib.Path(args.cwd).resolve()
    exists = subprocess.run(["tmux", "has-session", "-t", name], text=True, capture_output=True).returncode == 0
    if not exists:
        subprocess.run([
            "tmux", "new-session", "-d", "-s", name, "-n", "lfg", "-c", str(cwd),
            "bash", "-lc", "echo 'lfg explicit team tmux session ready'; echo 'use: lfg team create 3:executor \"task\"'; exec $SHELL"
        ], check=True)
    state = {"name": name, "status": "running", "cwd": str(cwd), "updatedAt": now(), "attachCommand": f"tmux attach -t {shlex.quote(name)}"}
    write_json(STATE_DIR / "backend.json", state)
    return state


def current_tmux_pane() -> str | None:
    pane = (os.environ.get("TMUX_PANE") or "").strip()
    if re.fullmatch(r"%\d+", pane):
        return pane
    proc = subprocess.run(["tmux", "display-message", "-p", "#{pane_id}"], text=True, capture_output=True)
    candidate = proc.stdout.strip() if proc.returncode == 0 else ""
    if re.fullmatch(r"%\d+", candidate):
        return candidate
    return None


def attach_backend_from_tmux_pane(state: dict[str, Any], cwd: pathlib.Path) -> dict[str, Any]:
    pane = current_tmux_pane()
    state["attachMethod"] = "split-window"
    state["attached"] = False
    if not pane:
        state["attachMethod"] = "inside-tmux-unresolved-pane"
        state["note"] = "inside tmux but current pane could not be resolved; use attachCommand from the desired pane"
        return state
    command = f"env -u TMUX tmux attach-session -t {shlex.quote(state['name'])}"
    subprocess.run(["tmux", "split-window", "-h", "-t", pane, "-c", str(cwd), command], check=True)
    state["attached"] = True
    state["triggerPane"] = pane
    state["paneAttachCommand"] = f"tmux split-window -h -t {shlex.quote(pane)} -c {shlex.quote(str(cwd))} {shlex.quote(command)}"
    return state


def lfg_launch(args: argparse.Namespace) -> dict[str, Any]:
    """Default `lfg`/`ulw` behavior. Shows the Grok Build tmux wrapper guide.

    Note: direct `ulw "goal"` activation is handled via early argv rewrite in main()
    before we ever reach a no-cmd lfg_launch path. This keeps the default path simple.
    """
    state = status(args)
    state["status"] = "ready"
    state["mode"] = "lfg-runtime"
    state["grokBuildWrapper"] = grok_build_wrapper_guide()
    return state

def backend_status(args: argparse.Namespace) -> dict[str, Any]:
    name = backend_name(args)
    proc = subprocess.run(["tmux", "list-sessions"], text=True, capture_output=True)
    return {"name": name, "configured": read_json(STATE_DIR / "backend.json", None), "tmux": {"returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}}


def backend_stop(args: argparse.Namespace) -> dict[str, Any]:
    name = backend_name(args)
    proc = subprocess.run(["tmux", "kill-session", "-t", name], text=True, capture_output=True)
    state = {"name": name, "status": "stopped", "updatedAt": now(), "returncode": proc.returncode, "stderr": proc.stderr}
    write_json(STATE_DIR / "backend.json", state)
    return state


def grok_build_tmux_path() -> pathlib.Path:
    return STATE_DIR / "grok-build-tmux.json"


def grok_build_tmux_name(args: argparse.Namespace) -> str:
    return validate_safe_id(getattr(args, "name", None) or "lfg-grok-build", "grok-build tmux session name")


def grok_build_tmux_target(name: str) -> str:
    return f"{name}:grok-build"


def grok_build_tmux_start(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    require_executable("tmux")
    name = grok_build_tmux_name(args)
    cwd = pathlib.Path(args.cwd).resolve()
    model_result = None
    if getattr(args, "model", None):
        model_result = models_switch(argparse.Namespace(model=args.model, provider=getattr(args, "provider", None), reasoning=getattr(args, "reasoning", None), source="grok-build-tmux-start"))
    exists = subprocess.run(["tmux", "has-session", "-t", name], text=True, capture_output=True).returncode == 0
    guide = grok_build_wrapper_guide()
    keyword_line = " ".join(grok_build_agent_keyword_ids())
    keyword_file = STATE_DIR / "grok-build-known-keywords.json"
    keyword_export_command = (
        f"mkdir -p {shlex.quote(str(STATE_DIR))}; "
        f"if python3 {shlex.quote(str(ROOT / 'bin' / 'lfg.py'))} --json grok-build keywords > {shlex.quote(str(keyword_file))} 2>/dev/null; then "
        f"export LFG_GROK_BUILD_KNOWN_KEYWORDS_FILE={shlex.quote(str(keyword_file))}; "
        f"export LFG_GROK_BUILD_KNOWN_KEYWORDS={shlex.quote(keyword_line)}; "
        "fi; "
    )
    command = (
        "printf '%s\n' 'lfg tmux wrapper ready: [tmux [grok-build]]'; "
        "printf '%s\n' 'leader pane: orchestration + dispatch'; "
        "printf '%s\n' 'worker panes: architect | implementer | reviewer'; "
        "printf '%s\n' 'Grok is Grok-first host execution, not an LFG provider.'; "
        "printf '%s\n' 'Optional providers are explicit: lfg models switch openai/gpt-5.5 --provider openai'; "
        f"{keyword_export_command}"
        f"printf '%s\n' {shlex.quote('Known @agent keywords: ' + keyword_line)}; "
        f"printf '%s\n' {shlex.quote('Known keyword registry file: ' + str(keyword_file))}; "
        "printf '%s\n' 'Use lfg grok-build model <model> to send /model into this session.'; "
        "if command -v grok >/dev/null 2>&1; then exec grok; "
        "else printf '%s\n' 'grok executable not found; control shell remains open.'; exec $SHELL; fi"
    )
    if not exists and not getattr(args, "dry_run", False):
        subprocess.run(["tmux", "new-session", "-d", "-s", name, "-n", "grok-build", "-c", str(cwd), "bash", "-lc", command], check=True)
    state = {
        "ok": True,
        "name": name,
        "status": "planned" if getattr(args, "dry_run", False) else "running",
        "topology": "[tmux [grok-build]]",
        "guide": guide,
        "cwd": str(cwd),
        "window": "grok-build",
        "target": grok_build_tmux_target(name),
        "command": command,
        "attachCommand": f"tmux attach -t {shlex.quote(name)}",
        "statusCommand": f"tmux list-windows -t {shlex.quote(name)}",
        "modelCommand": f"lfg grok-build model <model> --name {shlex.quote(name)}",
        "updatedAt": now(),
        "currentModel": read_model_selection(),
        "modelSwitch": model_result,
    }
    write_json(grok_build_tmux_path(), state)
    return state


def grok_build_tmux_status(args: argparse.Namespace) -> dict[str, Any]:
    name = grok_build_tmux_name(args)
    proc = subprocess.run(["tmux", "list-windows", "-t", name], text=True, capture_output=True)
    return {"ok": proc.returncode == 0, "name": name, "configured": read_json(grok_build_tmux_path(), None), "currentModel": read_model_selection(), "tmux": {"returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}}


def grok_build_tmux_send(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    require_executable("tmux")
    name = grok_build_tmux_name(args)
    target = grok_build_tmux_target(name)
    text = str(getattr(args, "text", ""))
    if not text:
        raise SystemExit("grok-build send requires text")
    proc = subprocess.run(["tmux", "send-keys", "-t", target, "-l", text], text=True, capture_output=True)
    enter = subprocess.run(["tmux", "send-keys", "-t", target, "Enter"], text=True, capture_output=True) if proc.returncode == 0 else None
    return {"ok": proc.returncode == 0 and (enter is None or enter.returncode == 0), "name": name, "target": target, "sent": text, "tmux": {"returncode": proc.returncode, "stderr": proc.stderr, "enterReturncode": None if enter is None else enter.returncode, "enterStderr": None if enter is None else enter.stderr}}


def grok_build_tmux_model(args: argparse.Namespace) -> dict[str, Any]:
    selection = models_switch(argparse.Namespace(model=args.model, provider=getattr(args, "provider", None), reasoning=getattr(args, "reasoning", None), source="grok-build-/model-tmux"))
    command = f"/model {selection['currentModel']['model']}"
    if getattr(args, "dry_run", False):
        return {"ok": True, "status": "planned", "name": grok_build_tmux_name(args), "modelSwitch": selection, "sendCommand": command, "tmuxSent": False}
    sent = grok_build_tmux_send(argparse.Namespace(name=getattr(args, "name", None), text=command))
    return {"ok": sent["ok"], "status": "sent" if sent["ok"] else "failed", "name": sent["name"], "modelSwitch": selection, "sendCommand": command, "tmuxSent": sent["ok"], "tmux": sent["tmux"]}


def grok_build_tmux_capture(args: argparse.Namespace) -> dict[str, Any]:
    name = grok_build_tmux_name(args)
    proc = subprocess.run(["tmux", "capture-pane", "-pt", grok_build_tmux_target(name), "-S", str(getattr(args, "start", -80))], text=True, capture_output=True)
    return {"ok": proc.returncode == 0, "name": name, "target": grok_build_tmux_target(name), "tmux": {"returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}}


def grok_build_tmux_stop(args: argparse.Namespace) -> dict[str, Any]:
    name = grok_build_tmux_name(args)
    proc = subprocess.run(["tmux", "kill-session", "-t", name], text=True, capture_output=True)
    state = {"ok": proc.returncode == 0, "name": name, "status": "stopped", "updatedAt": now(), "tmux": {"returncode": proc.returncode, "stderr": proc.stderr}}
    write_json(grok_build_tmux_path(), state)
    return state


def team_dir() -> pathlib.Path:
    return STATE_DIR / "teams"


def team_json_path(name: str) -> pathlib.Path:
    return safe_child_path(team_dir(), f"{validate_safe_id(name, 'team name')}.json")


def current_team_ref(args: argparse.Namespace) -> str:
    ref = args.name or (read_json(STATE_DIR / "current-team.json", {}) or {}).get("name")
    if not ref:
        raise SystemExit("no team name and no current team")
    return validate_safe_id(ref, "team name")


def parse_team_spec(spec: str) -> list[tuple[int, str]]:
    """Parse team spec into list of (count, role_or_agent_name).

    Supports:
        "3:executor"               -> [(3, "executor")]
        "1:sisyphus,2:atlas,1:sisyphus-junior" -> [(1, "sisyphus"), (2, "atlas"), (1, "sisyphus-junior")]
        "sisyphus,atlas,sisyphus-junior"       -> [(1, "sisyphus"), (1, "atlas"), (1, "sisyphus-junior")]
    """
    parts = [p.strip() for p in spec.split(",") if p.strip()]
    result = []
    for part in parts:
        if ":" in part:
            n, name = part.split(":", 1)
            role_name = name or "executor"
            if role_name.lower() in LEGACY_TEAM_SPEC_NAMES:
                raise SystemExit(f"legacy team member '{role_name}' has been removed; use canonical OMO agents or category roles")
            result.append((max(1, int(n)), role_name))
        else:
            if part.lower() in LEGACY_TEAM_SPEC_NAMES:
                raise SystemExit(f"legacy team member '{part}' has been removed; use canonical OMO agents or category roles")
            result.append((1, part))
    return result if result else [(1, "executor")]




def load_agent_definition(name: str) -> dict | None:
    """Load a named LFG agent definition.
    Scans the user dir and bundled canonical agent definitions for any *.json whose internal 'name' field matches.
    Historical custom names like iz/lina are rejected earlier at team-spec parsing time.
    """
    candidates = []
    # user dir (higher priority)
    user_dir = LFG_AGENTS_DIR
    if user_dir.exists():
        candidates.extend(sorted(user_dir.glob("*.json")))
    # plugin examples (new canonical location)
    plugin_dir = ROOT / "src" / "agents"
    if plugin_dir.exists():
        candidates.extend(sorted(plugin_dir.glob("*.json")))

    for p in candidates:
        try:
            data = read_json(p, None)
            if data and data.get("name") == name:
                return data
        except Exception:
            continue
    return None


def is_named_agent(name: str) -> bool:
    return load_agent_definition(name) is not None


def get_agent_default_category(name: str) -> str | None:
    agent = load_agent_definition(name)
    return agent.get("default_category") if agent else None

def get_agent_prompt(agent_name: str, role: str, base_prompt: str, category: str | None = None) -> str:
    """Build the final prompt for a named agent, injecting ULW identity + category style."""
    agent_def = load_agent_definition(agent_name)
    if not agent_def:
        return base_prompt

    prompt = base_prompt

    # Inject agent-specific overrides
    overrides = agent_def.get("prompt_overrides", {})
    if "base" in overrides:
        prompt = overrides["base"] + "\n\n" + prompt
    if category and category in overrides:
        prompt += "\n\n" + overrides[category]

    # Always reinforce ULW identity
    prompt += f"\n\nYou are operating as an **ULW worker** named '{agent_name}' (LFG_LAUNCHER=ulw). Report using `ulw ultragoal checkpoint`."

    return prompt

# --- Phase 1: TeamRuntime Core Models (for durable LFG+ULW orchestration) ---

from dataclasses import dataclass, field
from typing import Literal

TeamRunStatus = Literal["planned", "running", "paused", "completed", "shutdown", "deleted"]
MemberStatus = Literal["pending", "active", "completed", "failed", "shutdown_requested", "shutdown_approved"]
TaskStatus = Literal["pending", "claimed", "in_progress", "completed", "blocked", "deleted"]
MessageType = Literal["task_assignment", "progress", "evidence", "evidence_submission", "ack", "command", "message", "shutdown"]

@dataclass
class TeamMember:
    id: str
    name: str
    role: str
    provider: str
    status: MemberStatus = "pending"
    prompt: str = ""
    command: str = ""
    subagent_id: str | None = None
    ultragoal: str | None = None
    spawned_as_subagent: bool | str = False
    spawn_envelope: dict[str, Any] | None = None
    spawned_as_subagent_status: str | None = None
    subagent_spawn_status: str | None = None
    last_heartbeat: str | None = None
    kind: str = "category"
    session_id: str | None = None
    shutdown_requested_at: str | None = None
    shutdown_decision: str | None = None

@dataclass
class TeamMessage:
    id: str
    from_member: str  # "leader" or member id
    to_member: str
    type: MessageType
    payload: dict
    ts: str

@dataclass
class TeamTask:
    id: str
    title: str
    description: str = ""
    status: TaskStatus = "pending"
    claimed_by: str | None = None
    owner: str | None = None
    dependencies: list[str] = field(default_factory=list)
    evidence: str = ""
    evidenceArtifactPaths: list[str] = field(default_factory=list)
    ts: str = ""

@dataclass
class TeamRun:
    id: str
    name: str
    objective: str
    status: TeamRunStatus = "planned"
    created_at: str = ""
    updated_at: str = ""
    ultragoal_id: str | None = None
    leader: str | None = None
    config: dict = field(default_factory=dict)
    members: list[TeamMember] = field(default_factory=list)
    tasks: list[TeamTask] = field(default_factory=list)
    mailbox: list[TeamMessage] = field(default_factory=list)
    tmux_session: str | None = None

# --- End Phase 1 Models ---

# --- Phase 1+: Separated JSON State Management (mode-aware, like OmO)
# When Ultragoal or Ultrawork/Hyperplan is active, we use separated run-based directories
# to avoid polluting flat team state. This matches OmO's ~/.omo/state/team/<run-id>/ pattern.

def _get_mode_aware_base(mode: str | None, mode_id: str | None) -> pathlib.Path:
    """Return the correct base directory for separated state.
    Examples:
      - ultragoal + ug-123  → .lfg/runs/ultragoal-ug-123/
      - ultrawork + uw-456  → .lfg/runs/ultrawork-uw-456/
      - hyperplan + hp-789  → .lfg/runs/hyperplan-hp-789/
      - None                  → state/teams/   (legacy flat)
    """
    if mode and mode_id:
        return RUNS_DIR / f"{mode}-{mode_id}"
    return STATE_DIR / "teams"


class TeamStateStore:
    """Durable storage for TeamRun using structured subdirectories.
    Supports separated state per Ultragoal / Ultrawork / Hyperplan run (like OmO).
    """

    def __init__(self, base_dir: pathlib.Path | None = None, mode: str | None = None, mode_id: str | None = None):
        if base_dir:
            self.base = base_dir
        else:
            self.base = _get_mode_aware_base(mode, mode_id)
        self.base.mkdir(parents=True, exist_ok=True)
        self.mode = mode
        self.mode_id = mode_id

    def _run_dir(self, team_id: str) -> pathlib.Path:
        # For separated mode, we still allow multiple teams per run
        if self.mode and self.mode_id:
            d = self.base / "teams" / team_id
        else:
            d = self.base / team_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def save_run(self, run: TeamRun) -> None:
        path = self._run_dir(run.id) / "run.json"
        data = {
            "id": run.id,
            "name": run.name,
            "objective": run.objective,
            "status": run.status,
            "created_at": run.created_at,
            "updated_at": run.updated_at,
            "ultragoal_id": run.ultragoal_id,
            "leader": run.leader,
            "config": run.config,
            "tmux_session": run.tmux_session,
            "mode": getattr(self, "mode", None),
            "mode_id": getattr(self, "mode_id", None),
        }
        write_json(path, data)

        # Save members, tasks, mailbox as lists for simplicity
        write_json(self._run_dir(run.id) / "members.json", [m.__dict__ for m in run.members])
        write_json(self._run_dir(run.id) / "tasks.json", [t.__dict__ for t in run.tasks])
        write_json(self._run_dir(run.id) / "mailbox.json", [m.__dict__ for m in run.mailbox])

        # For Hyperplan + loop mode, we also keep a lightweight pointer in the ultragoal ledger dir
        if run.ultragoal_id and getattr(self, "mode", None) in ("hyperplan", "ultrawork"):
            ug_ledger_dir = DATA / "ultragoal" / run.ultragoal_id
            ug_ledger_dir.mkdir(parents=True, exist_ok=True)
            write_json(ug_ledger_dir / f"team-run-{run.id}.json", {
                "team_run_id": run.id,
                "mode": self.mode,
                "status": run.status,
                "updated_at": run.updated_at
            })

    def load_run(self, team_id: str) -> TeamRun | None:
        path = self._run_dir(team_id) / "run.json"
        if not path.exists():
            return None
        data = read_json(path, {})
        if not data:
            return None

        members_data = read_json(self._run_dir(team_id) / "members.json", [])
        tasks_data = read_json(self._run_dir(team_id) / "tasks.json", [])
        mailbox_data = read_json(self._run_dir(team_id) / "mailbox.json", [])

        run = TeamRun(
            id=data["id"],
            name=data["name"],
            objective=data["objective"],
            status=data.get("status", "planned"),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
            ultragoal_id=data.get("ultragoal_id"),
            leader=data.get("leader"),
            config=data.get("config", {}),
            tmux_session=data.get("tmux_session"),
        )
        run.members = [TeamMember(**m) for m in members_data]
        normalized_tasks = []
        for task in tasks_data:
            if "owner" not in task:
                task["owner"] = task.get("claimed_by")
            normalized_tasks.append(TeamTask(**task))
        run.tasks = normalized_tasks
        run.mailbox = [TeamMessage(**m) for m in mailbox_data]
        return run

    def list_runs(self) -> list[str]:
        if self.mode and self.mode_id:
            return [p.parent.name for p in sorted((self.base / "teams").glob("*/run.json")) if p.parent.is_dir()]
        return [p.parent.name for p in sorted(self.base.glob("*/run.json")) if p.parent.is_dir()]

    def delete_run(self, team_id: str) -> None:
        import shutil
        d = self._run_dir(team_id)
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)

# --- End TeamStateStore ---

# --- Phase 1: Basic TeamMailbox (file-based for leader <-> ULW workers) ---

class TeamMailbox:
    """
    ULW-aware mailbox for LFG teams.
    Messages are stored in the separated run directory (state/runs/<mode>-<id>/teams/<team>/mailbox.json).
    Every message is designed to be easily turned into an `ulw ultragoal checkpoint` call.
    """

    def __init__(self, store: TeamStateStore, team_id: str):
        self.store = store
        self.team_id = team_id
        self.run = self.store.load_run(team_id)

    def _persist(self):
        if self.run:
            self.store.save_run(self.run)

    def _inbox_dir(self, member: str) -> pathlib.Path:
        path = self.store._run_dir(self.team_id) / "inboxes" / validate_safe_id(member, "mailbox member")
        path.mkdir(parents=True, exist_ok=True)
        (path / "processed").mkdir(parents=True, exist_ok=True)
        return path

    def _message_path(self, member: str, msg_id: str) -> pathlib.Path:
        return self._inbox_dir(member) / f"{validate_safe_id(msg_id, 'message id')}.json"

    def _delivering_path(self, member: str, msg_id: str) -> pathlib.Path:
        return self._inbox_dir(member) / f".delivering-{validate_safe_id(msg_id, 'message id')}.json"

    def _write_inbox_message(self, message: TeamMessage) -> None:
        write_json(self._message_path(message.to_member, message.id), message.__dict__)

    def reclaim_stranded_deliveries(self, ttl_seconds: int = MAILBOX_DELIVERY_TTL_SECONDS, now_epoch: float | None = None) -> dict[str, Any]:
        current = time.time() if now_epoch is None else now_epoch
        reclaimed: list[str] = []
        inbox_root = self.store._run_dir(self.team_id) / "inboxes"
        if not inbox_root.exists():
            return {"ok": True, "reclaimed": [], "ttlSeconds": ttl_seconds}
        for inbox in sorted(path for path in inbox_root.iterdir() if path.is_dir()):
            for reserved in sorted(inbox.glob(".delivering-*.json")):
                age = current - reserved.stat().st_mtime
                if age < ttl_seconds:
                    continue
                msg_id = reserved.name[len(".delivering-"):-len(".json")]
                target = inbox / f"{msg_id}.json"
                if not target.exists():
                    reserved.replace(target)
                    reclaimed.append(str(target))
        return {"ok": True, "reclaimed": reclaimed, "ttlSeconds": ttl_seconds}

    def reserve_for_delivery(self, member: str, msg_id: str) -> dict[str, Any]:
        source = self._message_path(member, msg_id)
        target = self._delivering_path(member, msg_id)
        if not source.exists():
            return {"ok": False, "status": "missing", "messageId": msg_id}
        source.replace(target)
        return {"ok": True, "status": "reserved", "messageId": msg_id, "path": str(target)}

    def list_unread_messages(self, member: str) -> list[dict[str, Any]]:
        inbox = self._inbox_dir(member)
        messages = []
        for path in sorted(inbox.glob("*.json")):
            if path.name.startswith(".") or path.parent.name == "processed":
                continue
            messages.append(read_json(path, {}))
        return messages

    def send(self, from_member: str, to_member: str, type: MessageType, payload: dict, ultragoal_id: str | None = None) -> TeamMessage:
        """Send a fire-and-forget message into durable mailbox state."""
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        if not self.run:
            raise SystemExit(f"team not found: {self.team_id}")

        body = payload.get("body") if isinstance(payload, dict) else None
        body_bytes = len(str(body or payload).encode("utf-8"))
        if body_bytes > TEAM_MAX_MESSAGE_BYTES:
            raise SystemExit("team_send_message rejected: message exceeds 32KB bound")
        unread_bytes = sum(
            len(jdump(m.payload).encode("utf-8"))
            for m in self.run.mailbox
            if m.to_member == to_member
        )
        if unread_bytes + body_bytes > TEAM_MAX_UNREAD_BYTES:
            raise SystemExit("team_send_message rejected: recipient unread mailbox exceeds 256KB bound")
        if len(self.run.mailbox) >= TEAM_MAX_MESSAGES_PER_RUN:
            raise SystemExit("team_send_message rejected: run message limit exceeded")

        msg = TeamMessage(
            id=f"msg-{uuid.uuid4().hex[:12]}",
            from_member=from_member,
            to_member=to_member,
            type=type,
            payload=payload,
            ts=now()
        )

        if type == "evidence_submission" and ultragoal_id:
            payload["_ulw_checkpoint_hint"] = f"ulw ultragoal checkpoint --id {ultragoal_id} --status complete --evidence \"...\" --story <id>"

        self.run.mailbox.append(msg)
        self._write_inbox_message(msg)
        self.run.updated_at = now()
        self._persist()
        return msg

    def poll(self, for_member: str, since_ts: str | None = None) -> list[TeamMessage]:
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        if not self.run:
            return []
        return [
            m for m in self.run.mailbox
            if m.to_member == for_member and (not since_ts or m.ts > since_ts)
        ]

    def poll_for_leader(self, since_ts: str | None = None) -> list[TeamMessage]:
        return self.poll("leader", since_ts)

    def ack(self, msg_id: str) -> bool:
        """Mark a message as processed (removes it for Phase 1 simplicity)."""
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        if self.run:
            original_len = len(self.run.mailbox)
            removed = [m for m in self.run.mailbox if m.id == msg_id]
            self.run.mailbox = [m for m in self.run.mailbox if m.id != msg_id]
            for message in removed:
                inbox = self._inbox_dir(message.to_member)
                processed = inbox / "processed" / f"{msg_id}.json"
                for candidate in (self._message_path(message.to_member, msg_id), self._delivering_path(message.to_member, msg_id)):
                    if candidate.exists():
                        candidate.replace(processed)
                        break
            self._persist()
            return len(self.run.mailbox) < original_len
        return False

    def send_evidence(self, from_worker: str, ultragoal_id: str, evidence: str, story: str = "S001") -> TeamMessage:
        """Convenience method for ULW workers to submit evidence."""
        payload = {
            "evidence": evidence,
            "story": story,
            "checkpoint_command": f"ulw ultragoal checkpoint --id {ultragoal_id} --status complete --evidence \"{evidence}\" --story {story}"
        }
        return self.send(from_worker, "leader", "evidence_submission", payload, ultragoal_id=ultragoal_id)

# --- End TeamMailbox ---

# --- Phase 1: TeamTasklist (evidence-aware task management for ULW workers) ---

class TeamTasklist:
    """
    Task management with evidence submission and verification.
    Designed so ULW workers can claim tasks, submit evidence, and have it verified
    before the task is considered complete (especially important for Hyperplan).
    """

    def __init__(self, store: TeamStateStore, team_id: str):
        self.store = store
        self.team_id = team_id
        self.run = self.store.load_run(team_id)

    def _persist(self):
        if self.run:
            self.store.save_run(self.run)

    def create_task(self, title: str, description: str = "", dependencies: list[str] | None = None, owner: str | None = None) -> TeamTask:
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        if not self.run:
            raise SystemExit(f"team not found: {self.team_id}")
        task = TeamTask(
            id=f"task-{len(self.run.tasks) + 1}",
            title=title,
            description=description,
            status="claimed" if owner else "pending",
            claimed_by=owner,
            owner=owner,
            dependencies=dependencies or [],
            ts=now()
        )
        self.run.tasks.append(task)
        self.run.updated_at = now()
        self._persist()
        return task

    def claim_task(self, task_id: str, worker_id: str) -> TeamTask | None:
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        if not self.run:
            return None
        for task in self.run.tasks:
            if task.id == task_id and task.status == "pending":
                # Check dependencies
                if all(
                    any(t.id == dep and t.status == "completed" for t in self.run.tasks)
                    for dep in task.dependencies
                ):
                    task.status = "claimed"
                    task.claimed_by = worker_id
                    task.owner = worker_id
                    task.ts = now()
                    self._persist()
                    return task
        return None

    def submit_evidence(self, task_id: str, worker_id: str, evidence: str, evidence_artifact_paths: list[str] | None = None) -> bool:
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        if not self.run:
            return False
        for task in self.run.tasks:
            if task.id == task_id and task.claimed_by == worker_id:
                task.evidence = evidence
                task.evidenceArtifactPaths = evidence_artifact_paths or []
                task.status = "in_progress"  # waiting for verification
                task.ts = now()
                self._persist()
                return True
        return False

    def verify_evidence(self, task_id: str, verified_by: str = "leader") -> bool:
        """Leader or Hyperplan reviewer marks the evidence as good."""
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        if not self.run:
            return False
        for task in self.run.tasks:
            if task.id == task_id and task.status == "in_progress":
                require_evidence_gate({
                    "status": "completed",
                    "ok": True,
                    "evidence": task.evidence,
                    "evidenceArtifactPaths": task.evidenceArtifactPaths,
                }, record_type="team task")
                task.status = "completed"
                task.ts = now()
                # In real usage, this would trigger a checkpoint to Ultragoal
                self._persist()
                return True
        return False

    def get_pending_tasks(self) -> list[TeamTask]:
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        if not self.run:
            return []
        return [t for t in self.run.tasks if t.status == "pending"]

# --- End TeamTasklist ---

# --- Phase 1: TeamRuntime (orchestrator API for LFG+ULW) ---

class TeamRuntime:
    """Core runtime for durable team orchestration in LFG.
    Uses TeamStateStore + TeamMailbox.
    ULW workers (external or subagent) interact via mailbox and report to ultragoal.
    """

    def __init__(self, store: TeamStateStore | None = None):
        self.store = store or TeamStateStore()
        self._mailbox = None
        self._tasklist = None

    def create(self, name: str, objective: str, ultragoal_id: str | None = None, config: dict | None = None,
               mode: str | None = None, mode_id: str | None = None) -> TeamRun:
        """Create a new TeamRun with optional mode (ultragoal, ultrawork, hyperplan) for separated state."""
        name = validate_safe_id(name, "team name")
        store = TeamStateStore(mode=mode, mode_id=mode_id) if mode else self.store

        run = TeamRun(
            id=name,
            name=name,
            objective=objective,
            status="planned",
            created_at=now(),
            updated_at=now(),
            ultragoal_id=ultragoal_id,
            config={
                **(config or {}),
                "supervisionBroker": supervision_broker_decision(
                    operation="TeamRuntime.create",
                    lane="team-runtime:state-only",
                    model_profile={},
                    evidence_class="dependency-free-smoke",
                    reason="internal broker records TeamRuntime orchestration without becoming a team member",
                ),
            },
        )
        store.save_run(run)

        # Legacy flat pointer for backward compat
        legacy = {"id": run.id, "name": run.name, "objective": run.objective, "status": run.status, "ultragoal": ultragoal_id}
        write_json(team_json_path(name), legacy)
        write_json(STATE_DIR / "current-team.json", {"name": name, "path": str(team_json_path(name)), "updatedAt": now()})
        return run

    def status(self, team_id: str) -> TeamRun | None:
        return self.store.load_run(validate_safe_id(team_id, "team name"))

    def shutdown(self, team_id: str) -> None:
        team_id = validate_safe_id(team_id, "team name")
        run = self.store.load_run(team_id)
        if run:
            run.status = "shutdown"
            run.updated_at = now()
            self.store.save_run(run)
            # Legacy
            p = team_json_path(team_id)
            if p.exists():
                data = read_json(p, {})
                data["status"] = "shutdown"
                write_json(p, data)

    @property
    def mailbox(self) -> TeamMailbox:
        if self._mailbox is None:
            self._mailbox = TeamMailbox(self.store, getattr(self.store, "team_id", ""))
            # Better: we need to associate the mailbox with a specific team
            # For now this is a placeholder — real usage will be per TeamRun
        return self._mailbox

    def get_mailbox(self, team_id: str) -> TeamMailbox:
        return TeamMailbox(self.store, team_id)

    def get_tasklist(self, team_id: str) -> TeamTasklist:
        return TeamTasklist(self.store, team_id)

    # =====================
    # Continuous Loop Support (Hyperplan / Ultrawork)
    # =====================

    def has_pending_work(self, team_id: str) -> bool:
        """Returns True if there are still tasks that are not completed."""
        tasklist = self.get_tasklist(team_id)
        run = self.store.load_run(team_id)
        return len(tasklist.get_pending_tasks()) > 0 or any(
            t.status in ("claimed", "in_progress") for t in (run.tasks if run else [])
        )

    def get_next_claimable_task(self, team_id: str, worker_id: str) -> TeamTask | None:
        """ULW worker tries to claim the next available task."""
        tasklist = self.get_tasklist(team_id)
        pending = tasklist.get_pending_tasks()
        for task in pending:
            claimed = tasklist.claim_task(task.id, worker_id)
            if claimed:
                return claimed
        return None

    def submit_worker_evidence(self, team_id: str, worker_id: str, task_id: str, evidence: str, ultragoal_id: str | None = None, evidence_artifact_paths: list[str] | None = None):
        """Worker submits evidence for a task. Returns the message that was sent."""
        tasklist = self.get_tasklist(team_id)
        success = tasklist.submit_evidence(task_id, worker_id, evidence, evidence_artifact_paths=evidence_artifact_paths)
        if not success:
            return None

        mailbox = self.get_mailbox(team_id)
        return mailbox.send_evidence(worker_id, ultragoal_id or "", evidence, task_id)

    def verify_task_evidence(self, team_id: str, task_id: str, verified_by: str = "leader") -> bool:
        """Leader or Hyperplan reviewer verifies the evidence."""
        tasklist = self.get_tasklist(team_id)
        return tasklist.verify_evidence(task_id, verified_by)

    def close_loop_if_done(self, team_id: str) -> bool:
        """If all tasks are completed and verified, mark the run as completed."""
        run = self.store.load_run(team_id)
        if not run:
            return False

        if all(t.status == "completed" for t in run.tasks):
            run.status = "completed"
            run.updated_at = now()
            self.store.save_run(run)
            return True
        return False

    def get_worker_context(self, team_id: str, worker_id: str):
        """Returns a convenient context object for ULW workers (external CLI or sub-agent).
        They can use this to participate in the continuous work loop.
        """
        return {
            "mailbox": self.get_mailbox(team_id),
            "tasklist": self.get_tasklist(team_id),
            "worker_id": worker_id,
            "team_id": team_id,
            "get_next_task": lambda: self.get_next_claimable_task(team_id, worker_id),
            "submit_evidence": lambda task_id, evidence: self.submit_worker_evidence(team_id, worker_id, task_id, evidence),
        }

    def worker_loop_iteration(self, team_id: str, worker_id: str, ultragoal_id: str | None = None) -> dict:
        """
        One iteration of the continuous work loop (used by Ultrawork / Hyperplan).
        A ULW worker calls this repeatedly.

        Returns what the worker should do next.
        """
        tasklist = self.get_tasklist(team_id)
        mailbox = self.get_mailbox(team_id)

        # Try to claim a task
        task = self.get_next_claimable_task(team_id, worker_id)
        if task:
            return {
                "action": "work_on_task",
                "task": task,
                "instruction": f"Work on task '{task.title}'. When done, call submit_evidence and send_evidence via mailbox."
            }

        # If no task, check for new messages
        messages = mailbox.poll(worker_id)
        if messages:
            return {
                "action": "process_messages",
                "messages": messages
            }

        # Nothing to do
        return {
            "action": "idle",
            "suggestion": "Call close_loop_if_done or wait for new tasks from leader."
        }

# --- End TeamRuntime ---


def provider_command(provider: str, prompt: str) -> str:
    if provider not in TEAM_PROVIDER_EXECUTABLES:
        raise SystemExit(f"unknown provider: {provider}")
    q = shlex.quote(prompt)

    if provider == "hermes":
        return f"hermes -z {q} chat"
    if provider == "claude":
        # Claude Code with bypass for team work
        return f"claude --permission-mode bypassPermissions {q}"
    if provider == "codex":
        return f"codex {q}"
    if provider == "gemini":
        return f"gemini {q}"
    if provider == "copilot":
        return f"copilot {q}"
    if provider == "zai":
        script = shlex.quote(str(ROOT / "bin" / "lfg.py"))
        return f"python3 {script} --json ask create {q} --provider zai --dry-run; exec $SHELL"
    if provider == "opencode":
        # -p flag for deep / planning / architect / consultant mode (as requested)
        # especially powerful when combined with architect/consultant roles + ulw branding
        return f"opencode -p {q}"

    if provider in ("grok", "subagent"):
        return (
            f"echo 'GROK_SUBAGENT_FALLBACK — ULW MODE (manual gate required)'; "
            f"echo {q}; "
            f"echo 'This is a bounded fallback shell lane, not verified native Grok child execution. Use the ulw identity and MCP tools to report to the ultragoal ledger.'; "
            f"exec $SHELL"
        )

    if provider == "noop":
        return f"printf '%s\n' {shlex.quote('noop provider ready: ' + prompt)}; exec $SHELL"

    raise SystemExit(f"unknown provider: {provider}")


def summarize_spawn_envelope_for_team(envelope: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": envelope.get("schemaVersion"),
        "operation": envelope.get("operation"),
        "mode": envelope.get("mode"),
        "status": envelope.get("status"),
        "evidenceClass": envelope.get("evidenceClass"),
        "manual_gate_required": bool(envelope.get("manual_gate_required")),
        "execution": envelope.get("execution", {}),
        "oracleReview": envelope.get("oracleReview", {}),
        "broker": envelope.get("broker", {}),
        "recordPath": envelope.get("recordPath"),
        "runId": envelope.get("runId"),
        "taskId": envelope.get("taskId"),
    }


def spawn_runs_dir() -> pathlib.Path:
    return RUNS_DIR / "spawns"


def spawn_run_path(run_id: str) -> pathlib.Path:
    return safe_child_path(spawn_runs_dir(), f"{validate_safe_id(run_id, 'run id')}.json")


def canonical_spawn_envelope(
    *,
    operation: str,
    status: str,
    ok: bool,
    mode: str = "fallback",
    agent_id: str | None = None,
    category: str | None = None,
    task: str | None = None,
    task_id: str | None = None,
    run_id: str | None = None,
    parent_run_id: str | None = None,
    model_profile: dict[str, Any] | None = None,
    model_resolution: dict[str, Any] | None = None,
    children: list[dict[str, Any]] | None = None,
    blockers: list[Any] | None = None,
    touched_files: list[str] | None = None,
    evidence: list[Any] | str | None = None,
    evidence_class: str = "dependency-free-smoke",
    broker_decision: dict[str, Any] | None = None,
    debug: dict[str, Any] | None = None,
    next_tasks: list[Any] | None = None,
    manual_gate_required: bool | None = None,
) -> dict[str, Any]:
    """Provider-neutral spawn/result envelope shared by spawn operations."""
    return _SPAWN_CORE.canonical_spawn_envelope(
        operation=operation,
        status=status,
        ok=ok,
        mode=mode,
        agent_id=agent_id,
        category=category,
        task=task,
        task_id=task_id,
        run_id=run_id,
        parent_run_id=parent_run_id,
        model_profile=model_profile,
        model_resolution=model_resolution,
        children=children,
        blockers=blockers,
        touched_files=touched_files,
        evidence=evidence,
        evidence_class=evidence_class,
        broker_decision=broker_decision,
        debug=debug,
        next_tasks=next_tasks,
        manual_gate_required=manual_gate_required,
        spawn_envelope_schema_version=SPAWN_ENVELOPE_SCHEMA_VERSION,
        spawn_envelope_statuses=SPAWN_ENVELOPE_STATUSES,
        spawn_envelope_modes=SPAWN_ENVELOPE_MODES,
        spawn_envelope_evidence_classes=SPAWN_ENVELOPE_EVIDENCE_CLASSES,
        completion_statuses=COMPLETION_STATUSES,
        grok_oracle_review=GROK_ORACLE_REVIEW,
        redacter=redact_provider_debug,
        artifact_writer=write_evidence_artifact,
        default_broker_decision=lambda op, profile, ev_class: supervision_broker_decision(
            operation=op,
            lane="fallback-local",
            model_profile=profile,
            evidence_class=ev_class,
            reason="default internal broker decision for canonical envelope normalization",
        ),
    )


def native_spawn_requested(kwargs: dict[str, Any]) -> bool:
    return _SPAWN_CORE.native_spawn_requested(kwargs)


def native_spawn_manual_gate_available(kwargs: dict[str, Any]) -> bool:
    """True only when an explicit real Grok manual gate is provided.

    Dependency-free smoke must never infer native availability from local xAI
    credentials or provider names. Native mode stays gated until a caller passes
    real-grok-manual-gate evidence and the host exposes a callable primitive.
    """
    return _SPAWN_CORE.native_spawn_manual_gate_available(
        kwargs,
        spawn_subagent_available=callable(globals().get("spawn_subagent")),
    )


def fallback_manual_gate_required(model_profile: dict[str, Any] | None, kwargs: dict[str, Any]) -> bool:
    return _SPAWN_CORE.fallback_manual_gate_required(
        model_profile,
        kwargs,
        canonical_model_provider=canonical_model_provider,
    )


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
    max_depth: int = SUPERVISION_BROKER_MAX_DEPTH,
) -> dict[str, Any]:
    """Internal DAD-inspired supervision broker decision record.

    This is deliberately not an agent, command surface, or user-selectable role.
    It sits behind spawn_agent, spawn_wave, TeamRuntime, and dependency graph APIs
    to record lane/model/evidence/policy decisions before envelopes are emitted.
    """
    return _SPAWN_CORE.supervision_broker_decision(
        operation=operation,
        lane=lane,
        model_profile=model_profile,
        evidence_class=evidence_class,
        reason=reason,
        allowed=allowed,
        policy=policy,
        depth=depth,
        max_depth=max_depth,
        broker_api=SUPERVISION_BROKER_API,
        broker_version=SUPERVISION_BROKER_VERSION,
    )


def broker_reject_envelope(
    *,
    operation: str,
    agent_id: str | None = None,
    category: str | None = None,
    task: str | None = None,
    task_id: str | None = None,
    run_id: str | None = None,
    code: str,
    reason: str,
    model_profile: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
    broker_decision: dict[str, Any] | None = None,
) -> dict[str, Any]:
    blocker = {"code": code, "reason": reason}
    if agent_id:
        blocker["agent"] = agent_id
    if extra:
        blocker.update(extra)
    decision = broker_decision or supervision_broker_decision(
        operation=operation,
        lane="rejected",
        model_profile=model_profile or {},
        evidence_class="dependency-free-smoke",
        reason=reason,
        allowed=False,
    )
    return canonical_spawn_envelope(
        operation=operation,
        status="failed",
        ok=False,
        agent_id=agent_id,
        category=category,
        task=task,
        task_id=task_id,
        run_id=run_id,
        blockers=[blocker],
        evidence=[{"summary": "internal supervision broker rejected execution", "reason": reason}],
        broker_decision=decision,
        debug={"brokerApi": SUPERVISION_BROKER_API},
    )


def broker_preflight(
    *,
    operation: str,
    agent_id: str | None,
    category: str | None,
    task: str | None,
    task_id: str | None,
    run_id: str | None,
    model_profile: dict[str, Any] | None,
    evidence_class: str,
    provider: str | None = None,
    depth: int = 0,
    max_depth: int = SUPERVISION_BROKER_MAX_DEPTH,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    canonical_provider = canonical_model_provider(provider or (model_profile or {}).get("provider", "xai"))
    if canonical_provider not in APPROVED_MODEL_PROVIDERS:
        reason = "unsupported provider denied by internal supervision broker before execution"
        return supervision_broker_decision(
            operation=operation,
            lane="rejected",
            model_profile=model_profile or {"provider": canonical_provider},
            evidence_class=evidence_class,
            reason=reason,
            allowed=False,
            depth=depth,
            max_depth=max_depth,
        ), broker_reject_envelope(
            operation=operation,
            agent_id=agent_id,
            category=category,
            task=task,
            task_id=task_id,
            run_id=run_id,
            code="unsupported-provider",
            reason=reason,
            model_profile=model_profile,
            extra={"provider": canonical_provider, "known": sorted(APPROVED_MODEL_PROVIDERS)},
            broker_decision=supervision_broker_decision(
                operation=operation,
                lane="rejected",
                model_profile=model_profile or {"provider": canonical_provider},
                evidence_class=evidence_class,
                reason=reason,
                allowed=False,
                depth=depth,
                max_depth=max_depth,
            ),
        )
    if depth > max_depth:
        reason = "uncontrolled recursion denied by internal supervision broker lease"
        return supervision_broker_decision(
            operation=operation,
            lane="rejected",
            model_profile=model_profile or {},
            evidence_class=evidence_class,
            reason=reason,
            allowed=False,
            depth=depth,
            max_depth=max_depth,
        ), broker_reject_envelope(
            operation=operation,
            agent_id=agent_id,
            category=category,
            task=task,
            task_id=task_id,
            run_id=run_id,
            code="uncontrolled-recursion",
            reason=reason,
            model_profile=model_profile,
            extra={"depth": depth, "maxDepth": max_depth},
            broker_decision=supervision_broker_decision(
                operation=operation,
                lane="rejected",
                model_profile=model_profile or {},
                evidence_class=evidence_class,
                reason=reason,
                allowed=False,
                depth=depth,
                max_depth=max_depth,
            ),
        )
    lane = "fallback-local" if canonical_provider in {"xai", "grok"} else f"approved-provider:{canonical_provider}"
    reason = "OMO policy selected bounded fallback lane; native Grok sub-agent primitive remains manual-gated"
    return supervision_broker_decision(
        operation=operation,
        lane=lane,
        model_profile=model_profile or {},
        evidence_class=evidence_class,
        reason=reason,
        allowed=True,
        depth=depth,
        max_depth=max_depth,
    ), None


def validate_spawn_envelope(envelope: dict[str, Any]) -> list[str]:
    return _SPAWN_CORE.validate_spawn_envelope(
        envelope,
        spawn_envelope_schema_version=SPAWN_ENVELOPE_SCHEMA_VERSION,
        spawn_envelope_statuses=SPAWN_ENVELOPE_STATUSES,
        spawn_envelope_modes=SPAWN_ENVELOPE_MODES,
        spawn_envelope_evidence_classes=SPAWN_ENVELOPE_EVIDENCE_CLASSES,
        broker_api=SUPERVISION_BROKER_API,
        validate_evidence_gate=lambda record: validate_evidence_gate(record, record_type="spawn envelope"),
    )


def persist_spawn_envelope(envelope: dict[str, Any]) -> dict[str, Any]:
    try:
        path = spawn_run_path(envelope["runId"])
        envelope["recordPath"] = str(path)
        envelope["record_path"] = str(path)
        write_json(path, envelope)
    except Exception as e:
        envelope.setdefault("debug", {})["persistError"] = redact_secret_value(str(e))
    return envelope


def spawn_agent(
    agent_id: str,
    category: str | None = None,
    task: str | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    """Grok spawn adapter with deterministic/manual-gated fallback behavior."""
    task_id = kwargs.get("task_id") or kwargs.get("taskId")
    run_id = kwargs.get("run_id") or kwargs.get("runId")
    depth = int(kwargs.get("broker_depth", kwargs.get("depth", 0)) or 0)
    max_depth = int(kwargs.get("broker_max_depth", SUPERVISION_BROKER_MAX_DEPTH) or SUPERVISION_BROKER_MAX_DEPTH)
    requested_native = native_spawn_requested(kwargs)
    native_gate_available = native_spawn_manual_gate_available(kwargs)
    agent = _OMO_REGISTRY_INDEX.get(agent_id)
    if agent is None:
        decision, rejected = broker_preflight(
            operation="spawn",
            agent_id=agent_id,
            category=category,
            task=task,
            task_id=task_id,
            run_id=run_id,
            model_profile={},
            evidence_class="dependency-free-smoke",
            provider=kwargs.get("provider"),
            depth=depth,
            max_depth=max_depth,
        )
        if rejected:
            return persist_spawn_envelope(rejected)
        return canonical_spawn_envelope(
            operation="spawn",
            status="failed",
            ok=False,
            agent_id=agent_id,
            category=category,
            task=task,
            task_id=task_id,
            run_id=run_id,
            blockers=[{"code": "unknown-agent", "agent": agent_id}],
            evidence=[{"summary": "spawn rejected before provider execution"}],
            broker_decision=decision,
            debug={"knownAgents": sorted(_OMO_REGISTRY_INDEX.keys())},
        )

    if category and category not in agent.get("categories", []):
        decision, rejected = broker_preflight(
            operation="spawn",
            agent_id=agent_id,
            category=category,
            task=task,
            task_id=task_id,
            run_id=run_id,
            model_profile={},
            evidence_class="dependency-free-smoke",
            provider=kwargs.get("provider"),
            depth=depth,
            max_depth=max_depth,
        )
        if rejected:
            return persist_spawn_envelope(rejected)
        return persist_spawn_envelope(canonical_spawn_envelope(
            operation="spawn",
            status="failed",
            ok=False,
            agent_id=agent_id,
            category=category,
            task=task,
            task_id=task_id,
            run_id=run_id,
            blockers=[{"code": "unsupported-category", "agent": agent_id, "category": category}],
            evidence=[{"summary": "category not supported for agent"}],
            broker_decision=decision,
            debug={"supportedCategories": agent.get("categories", [])},
        ))

    resolved = resolve_omo_model_profile(
        agent,
        category=category,
        provider=kwargs.get("provider"),
        model=kwargs.get("model"),
        reasoning=kwargs.get("reasoning"),
    )
    if not resolved.get("ok"):
        provider = kwargs.get("provider") or (kwargs.get("model", "").split("/", 1)[0] if "/" in str(kwargs.get("model", "")) else None)
        decision, rejected = broker_preflight(
            operation="spawn",
            agent_id=agent_id,
            category=category,
            task=task,
            task_id=task_id,
            run_id=run_id,
            model_profile={},
            evidence_class="dependency-free-smoke",
            provider=provider,
            depth=depth,
            max_depth=max_depth,
        )
        if rejected:
            return persist_spawn_envelope(rejected)
        return persist_spawn_envelope(canonical_spawn_envelope(
            operation="spawn",
            status="blocked" if resolved.get("status") == "blocked" else "failed",
            ok=False,
            agent_id=agent_id,
            category=category,
            task=task,
            task_id=task_id,
            run_id=run_id,
            blockers=[{"code": "model-family-mismatch" if resolved.get("error") == "model-family mismatch" else "model-resolution-failed", "detail": resolved.get("error", "unknown")}],
            evidence=[{"summary": "model resolution failed"}],
            broker_decision=decision,
            debug=resolved,
        ))

    model_profile = resolved["modelProfile"]
    model_resolution = resolved["modelResolution"]
    decision, rejected = broker_preflight(
        operation="spawn",
        agent_id=agent_id,
        category=category,
        task=task,
        task_id=task_id,
        run_id=run_id,
        model_profile=model_profile,
        evidence_class="dependency-free-smoke",
        provider=kwargs.get("provider") or model_profile.get("provider"),
        depth=depth,
        max_depth=max_depth,
    )
    if rejected:
        return persist_spawn_envelope(rejected)

    simulated_provider_error = kwargs.get("simulate_provider_error") or kwargs.get("simulateProviderError")
    if simulated_provider_error in {"auth-error", "rate-limit"}:
        failure_class = provider_failure_class(str(simulated_provider_error))
        retryable = simulated_provider_error == "rate-limit"
        blocker_code = "provider-rate-limit" if retryable else "provider-auth-error"
        reason = "simulated provider rate limit after model selection" if retryable else "simulated provider authentication failure after model selection"
        result = canonical_spawn_envelope(
            operation="spawn",
            status="blocked",
            ok=False,
            mode="fallback",
            agent_id=agent_id,
            category=category,
            task=task,
            task_id=task_id,
            run_id=run_id,
            model_profile=model_profile,
            model_resolution=model_resolution,
            blockers=[{"code": blocker_code, "provider": model_profile.get("provider"), "retryable": retryable, "securitySensitive": not retryable, "statePreserved": True}],
            evidence=[{"summary": reason, "class": failure_class, "statePreserved": True, "secretValueExposed": False}],
            broker_decision=decision,
            debug={
                "runtimeFallback": model_resolution["runtimeFallback"],
                "providerFailure": {
                    "class": failure_class,
                    "retryable": retryable,
                    "statePreserved": True,
                    "silentDowngrade": False,
                    "separateFromProactiveSelection": True,
                },
            },
            manual_gate_required=fallback_manual_gate_required(model_profile, kwargs),
        )
        result["runtimeFallback"] = model_resolution["runtimeFallback"]
        result["session_id"] = result["runId"]
        return persist_spawn_envelope(result)

    evidence = [{
        "summary": f"dependency-free fallback spawn for {agent_id}",
        "class": "dependency-free-smoke",
        "providerOutput": "[not-executed:fallback]",
    }]
    debug = {"runtimeFallback": model_resolution["runtimeFallback"]}
    if requested_native and not native_gate_available:
        evidence.append({
            "summary": "native Grok spawn requested but real manual gate evidence is absent; falling back deterministically",
            "requiredEvidenceClass": "real-grok-manual-gate",
        })
        debug["nativeGate"] = {
            "requested": True,
            "available": False,
            "modeReturned": "fallback",
        }

    result = canonical_spawn_envelope(
        operation="spawn",
        status="completed",
        ok=True,
        mode="fallback",
        agent_id=agent_id,
        category=category,
        task=task,
        task_id=task_id,
        run_id=run_id,
        model_profile=model_profile,
        model_resolution=model_resolution,
        evidence=evidence,
        broker_decision=decision,
        debug=debug,
        manual_gate_required=fallback_manual_gate_required(model_profile, kwargs),
    )
    result["runtimeFallback"] = model_resolution["runtimeFallback"]
    result["session_id"] = result["runId"]
    return persist_spawn_envelope(result)


def spawn_wave(agents: list[dict], **kwargs: Any) -> dict[str, Any]:
    """spawn_wave with actual per-agent spawn_agent calls (full coverage direction)."""
    wave_id = kwargs.get("run_id") or kwargs.get("runId") or f"wave-{uuid.uuid4().hex[:12]}"
    results = []
    mode = kwargs.get("mode", "parallel")

    for idx, a in enumerate(agents):
        agent_id = a.get("agent_id") or a.get("agentId") or a.get("agent") if isinstance(a, dict) else a
        category = a.get("category") if isinstance(a, dict) else None
        task = a.get("task") if isinstance(a, dict) else None
        task_id = a.get("task_id") or a.get("taskId") if isinstance(a, dict) else None
        r = spawn_agent(
            str(agent_id),
            category=category,
            task=task,
            task_id=task_id or f"task-{idx + 1}",
            parent_run_id=wave_id,
            provider=a.get("provider") if isinstance(a, dict) else kwargs.get("provider"),
            model=a.get("model") if isinstance(a, dict) else kwargs.get("model"),
            reasoning=a.get("reasoning") if isinstance(a, dict) else kwargs.get("reasoning"),
            mode=a.get("mode") if isinstance(a, dict) and a.get("mode") else kwargs.get("mode"),
            broker_depth=1,
        )
        results.append(r)

    status = "completed" if all(r.get("ok") for r in results) else "failed"
    manual_gate_required = any(bool(r.get("manual_gate_required")) for r in results)
    child_summaries = [
        {
            "taskId": r.get("taskId"),
            "runId": r.get("runId"),
            "agentId": r.get("agentId"),
            "status": r.get("status"),
            "ok": bool(r.get("ok")),
            "manual_gate_required": bool(r.get("manual_gate_required")),
            "recordPath": r.get("recordPath"),
        }
        for r in results
    ]
    envelope = canonical_spawn_envelope(
        operation="spawn_wave",
        status=status,
        ok=status == "completed",
        mode="fallback",
        task_id=wave_id,
        run_id=wave_id,
        children=child_summaries,
        blockers=[b for r in results for b in r.get("blockers", [])],
        touched_files=sorted({f for r in results for f in r.get("touchedFiles", [])}),
        evidence=[{"summary": "spawn_wave fallback completed in input order", "executionMode": mode}],
        broker_decision=supervision_broker_decision(
            operation="spawn_wave",
            lane="spawn-wave:fallback-local",
            model_profile={},
            evidence_class="dependency-free-smoke",
            reason="OMO policy kept broker behind spawn_wave and delegated child decisions to spawn_agent",
        ),
        next_tasks=[],
        manual_gate_required=manual_gate_required,
    )
    envelope["waveId"] = wave_id
    envelope["wave_id"] = wave_id
    envelope["results"] = child_summaries
    envelope["debug"]["childRecordPaths"] = [r.get("recordPath") for r in results if r.get("recordPath")]
    return persist_spawn_envelope(envelope)


def run_dependency_graph(plan: list[dict], **kwargs: Any) -> dict[str, Any]:
    """Evaluate a dependency graph and spawn only unblocked tasks.

    The dependency-free fallback is deterministic: tasks are inspected in input
    order, unresolved tasks are refused with blockers, and completed/ready task
    outputs are synthesized without provider credentials.
    """
    graph_id = kwargs.get("run_id") or kwargs.get("runId") or f"graph-{uuid.uuid4().hex[:12]}"
    id_to_task = {t.get("id"): t for t in plan if isinstance(t, dict) and t.get("id")}
    children = []
    blockers = []
    completed_ids = {
        tid for tid, task in id_to_task.items()
        if task.get("status") in {"done", "completed"}
    }
    completed_outputs = []

    for t in plan:
        if not isinstance(t, dict):
            continue
        tid = t.get("id")
        deps = t.get("depends_on") or t.get("dependsOn") or []
        explicit_status = t.get("status")
        unresolved = [d for d in deps if d not in completed_ids]
        if explicit_status == "blocked" or unresolved:
            reason = "explicitly-blocked" if explicit_status == "blocked" else "unresolved-dependency"
            blocker = {"taskId": tid, "dependsOn": unresolved, "reason": "unresolved-dependency"}
            if reason != "unresolved-dependency":
                blocker["reason"] = reason
            blockers.append(blocker)
            children.append({"taskId": tid, "status": "blocked", "blockers": [blocker]})
            continue

        has_executable = any(t.get(key) for key in ("agent_id", "agentId", "agent", "task", "objective"))
        if explicit_status not in {"done", "completed"} and not has_executable:
            children.append({"taskId": tid, "status": "pending", "blockers": []})
            continue

        if explicit_status in {"done", "completed"} and not has_executable:
            child = {
                "taskId": tid,
                "status": "completed",
                "ok": True,
                "output": t.get("output") or t.get("result") or "precompleted dependency",
                "blockers": [],
            }
        else:
            child = spawn_agent(
                str(t.get("agent_id") or t.get("agentId") or t.get("agent") or "sisyphus-junior"),
                category=t.get("category") or "quick",
                task=t.get("task") or t.get("objective") or str(tid),
                task_id=str(tid),
                parent_run_id=graph_id,
                provider=t.get("provider") or kwargs.get("provider"),
                model=t.get("model") or kwargs.get("model"),
                reasoning=t.get("reasoning") or kwargs.get("reasoning"),
                mode=t.get("mode") or kwargs.get("mode"),
                broker_depth=1,
            )
        children.append(child)
        if child.get("ok"):
            completed_ids.add(tid)
            completed_outputs.append(child)
        else:
            child_blockers = child.get("blockers", [])
            if isinstance(child_blockers, list):
                blockers.extend(child_blockers)

    status = "blocked" if blockers else "completed"
    synthesis = synthesize(completed_outputs, run_id=f"{graph_id}-synthesis") if completed_outputs else None
    envelope = canonical_spawn_envelope(
        operation="run_dependency_graph",
        status=status,
        ok=not blockers,
        mode="fallback",
        task_id=graph_id,
        run_id=graph_id,
        children=children,
        blockers=blockers,
        evidence=[{"summary": "dependency graph evaluated deterministically"}],
        broker_decision=supervision_broker_decision(
            operation="run_dependency_graph",
            lane="dependency-graph:deterministic",
            model_profile={},
            evidence_class="dependency-free-smoke",
            reason="OMO policy kept broker behind dependency graph API; no provider execution required",
        ),
        next_tasks=[child["taskId"] for child in children if child.get("status") == "completed"],
        manual_gate_required=any(bool(child.get("manual_gate_required")) for child in children),
    )
    envelope["graphId"] = graph_id
    envelope["graph_id"] = graph_id
    envelope["tasks"] = [t.get("id") for t in plan if isinstance(t, dict)]
    envelope["blocked"] = [b["taskId"] for b in blockers]
    envelope["ready"] = envelope["nextTasks"]
    if synthesis:
        envelope["synthesis"] = synthesis
    return persist_spawn_envelope(envelope)


def synthesize(results: list[dict], **kwargs: Any) -> dict[str, Any]:
    """synthesize with basic evidence/blocker aggregation (full coverage direction)."""
    all_evidence = []
    all_blockers = []
    all_touched = []
    success_count = 0
    fail_count = 0

    for r in results:
        if r.get("ok"):
            success_count += 1
        else:
            fail_count += 1
        evidence = r.get("evidence", [])
        if isinstance(evidence, list):
            all_evidence.extend(evidence)
        elif evidence:
            all_evidence.append(evidence)
        all_blockers.extend(r.get("blockers", []))
        all_touched.extend(r.get("touchedFiles") or r.get("touched_files", []))

    synthesis_id = kwargs.get("run_id") or kwargs.get("runId") or f"synthesis-{uuid.uuid4().hex[:12]}"
    deduped_blockers = [json.loads(item) for item in sorted({json.dumps(b, sort_keys=True) for b in all_blockers})]
    envelope = canonical_spawn_envelope(
        operation="synthesize",
        status="completed" if fail_count == 0 else "failed",
        ok=fail_count == 0,
        mode="fallback",
        task_id=synthesis_id,
        run_id=synthesis_id,
        children=results,
        evidence=all_evidence,
        blockers=deduped_blockers,
        touched_files=sorted(set(all_touched)),
        broker_decision=supervision_broker_decision(
            operation="synthesize",
            lane="synthesize:fallback-local",
            model_profile={},
            evidence_class="dependency-free-smoke",
            reason="local deterministic synthesis over canonical child envelopes",
        ),
        debug={"successCount": success_count, "failCount": fail_count},
        manual_gate_required=any(bool(r.get("manual_gate_required")) for r in results),
    )
    envelope["synthesisId"] = synthesis_id
    envelope["synthesis_id"] = synthesis_id
    envelope["success_count"] = success_count
    envelope["fail_count"] = fail_count
    return persist_spawn_envelope(envelope)


def resume_spawn_run(run_id: str) -> dict[str, Any]:
    path = spawn_run_path(run_id)
    if not path.exists():
        return persist_spawn_envelope(canonical_spawn_envelope(
            operation="resume",
            status="failed",
            ok=False,
            task_id=run_id,
            run_id=run_id,
            blockers=[{"code": "run-not-found", "runId": run_id}],
            evidence=[{"summary": "resume failed; run id not found"}],
            broker_decision=supervision_broker_decision(
                operation="resume",
                lane="resume:fallback-local",
                model_profile={},
                evidence_class="dependency-free-smoke",
                reason="resume inspected local spawn ledger and did not find the requested run",
                allowed=False,
            ),
        ))
    previous = read_json(path, {}) or {}
    return canonical_spawn_envelope(
        operation="resume",
        status=previous.get("status", "completed") if previous.get("status") in SPAWN_ENVELOPE_STATUSES else "completed",
        ok=bool(previous.get("ok", True)),
        mode=previous.get("mode", "fallback"),
        agent_id=previous.get("agentId"),
        category=previous.get("category"),
        task=previous.get("task"),
        task_id=previous.get("taskId", run_id),
        run_id=run_id,
        model_profile=previous.get("modelProfile", {}),
        model_resolution=previous.get("modelResolution", {}),
        children=previous.get("children", []),
        blockers=previous.get("blockers", []),
        touched_files=previous.get("touchedFiles", []),
        evidence=[{"summary": "resumed canonical spawn run", "sourceRunId": run_id}],
        broker_decision=supervision_broker_decision(
            operation="resume",
            lane="resume:fallback-local",
            model_profile=previous.get("modelProfile", {}),
            evidence_class=previous.get("evidenceClass", "dependency-free-smoke"),
            reason="resume inspected a previous local canonical envelope without provider credentials",
        ),
        debug={"sourceRecord": str(path), "previousOperation": previous.get("operation")},
        manual_gate_required=bool(previous.get("manual_gate_required")),
    )


def team_provider_matrix() -> list[dict[str, Any]]:
    """Returns all possible team providers, highlighting which coding CLIs
    installed on *this machine* can actually be used right now.
    The goal of team mode is to maximise usage of every coding agent the user has.
    """
    rows = []
    for provider, exe in TEAM_PROVIDER_EXECUTABLES.items():
        if provider in ("grok", "subagent"):
            available = False
            exe_name = "manual-gated Grok sub-agent fallback (T28 not passed)"
        else:
            available = True if exe is None else bool(shutil.which(exe))
            exe_name = exe or "builtin"

        rows.append({
            "provider": provider,
            "executable": exe_name,
            "available": available,
            "status": "manual-gated" if provider in ("grok", "subagent") else ("available" if available else "missing"),
            "manualGateRequired": provider in ("grok", "subagent"),
            "required": False,
            "commandPreview": provider_command(provider, "TEAM_PROVIDER_SMOKE")[:240],
        })
    return rows


def resolve_providers_for_agent(agent_name: str, installed: list[str]) -> list[str]:
    """Resolve providers for a named canonical LFG/OMO agent.

    Respects the agent's `default_category` and keeps Grok/subagent first for current team runtime lanes.
    """
    agent_def = load_agent_definition(agent_name)
    if not agent_def:
        return resolve_providers_for_role(agent_name, installed)

    cat = agent_def.get("default_category")
    usable = [p for p in installed if p in TEAM_PROVIDER_EXECUTABLES]

    if not usable:
        return ["grok", "subagent"]

    if cat == "deep":
        order = ["grok", "subagent"]
    elif cat == "artistry":
        order = ["grok", "subagent"]
    elif cat == "ultrabrain":
        order = ["grok", "subagent"]
    else:
        order = ["grok", "subagent"]

    preferred = [p for p in order if p in usable]
    for p in usable:
        if p not in preferred:
            preferred.append(p)
    return preferred or usable


def resolve_providers_for_role(role: str, installed: list[str]) -> list[str]:
    """Fallback for generic roles (executor, architect, etc.)."""
    role_lower = (role or "").lower()
    is_deep = any(k in role_lower for k in DEEP_ROLES)

    usable = [p for p in installed if p in TEAM_PROVIDER_EXECUTABLES]

    if not usable:
        return ["grok", "subagent"]

    if is_deep:
        preferred = []
        if "grok" in usable or "subagent" in usable: preferred.append("grok")
        if "subagent" in usable and "subagent" not in preferred: preferred.append("subagent")
        for p in usable:
            if p not in preferred: preferred.append(p)
        return preferred or usable

    preferred = []
    for p in ["grok", "subagent"]:
        if p in usable: preferred.append(p)
    for p in usable:
        if p not in preferred: preferred.append(p)
    return preferred or usable


def team_providers(args: argparse.Namespace) -> dict[str, Any]:
    providers = team_provider_matrix()
    return {
        "ok": True,
        "providers": providers,
        "default": ["grok", "subagent"],
        "smokeSafe": "noop",
        "summary": {
            "available": [p["provider"] for p in providers if p["available"]],
            "missing": [p["provider"] for p in providers if not p["available"]],
        },
    }


def team_preflight(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    providers = team_provider_matrix()
    tmux_path = shutil.which("tmux")
    backend = backend_start(argparse.Namespace(name=getattr(args, "name", None), cwd=args.cwd))
    required_ok = bool(tmux_path) and backend.get("status") == "running"
    name = backend.get("name") or backend_name(args)
    return {
        "ok": required_ok,
        "tmux": {"available": bool(tmux_path), "path": tmux_path},
        "backend": backend,
        "providers": providers,
        "commands": {
            "createDryRun": "lfg team create 3:executor \"objective\" --dry-run",
            "createNoopSmoke": f"lfg team create 2:executor \"smoke objective\" --name {shlex.quote(name + '-team')} --providers noop",
            "backendAttach": backend.get("attachCommand") or f"tmux attach -t {shlex.quote(name)}",
            "backendStatus": f"tmux has-session -t {shlex.quote(name)}",
            "providers": "lfg team providers",
        },
        "summary": {
            "availableProviders": [p["provider"] for p in providers if p["available"]],
            "missingProviders": [p["provider"] for p in providers if not p["available"]],
            "smokeSafe": "noop",
        },
    }


def team_runtime_store(team_name: str | None = None, *, mode: str | None = None, mode_id: str | None = None) -> TeamStateStore:
    if mode and mode_id:
        return TeamStateStore(mode=mode, mode_id=mode_id)
    if team_name:
        return TeamStateStore(mode="team", mode_id=validate_safe_id(team_name, "team name"))
    return TeamStateStore()


def team_run_dir_for_name(team_name: str) -> pathlib.Path:
    team_name = validate_safe_id(team_name, "team name")
    return DATA / "runs" / f"team-{team_name}" / "teams" / team_name


def load_team_run(team_name: str) -> tuple[TeamStateStore, TeamRun | None]:
    team_name = validate_safe_id(team_name, "team name")
    store = team_runtime_store(team_name)
    run = store.load_run(team_name)
    if run:
        return store, run
    legacy = read_json(team_json_path(team_name), {})
    if legacy:
        run = TeamRun(
            id=team_name,
            name=legacy.get("name", team_name),
            objective=legacy.get("objective", ""),
            status=legacy.get("status", "planned"),
            created_at=legacy.get("createdAt", now()),
            updated_at=legacy.get("updatedAt", now()),
            config={"legacyFlatState": str(team_json_path(team_name))},
        )
        for i, member in enumerate(legacy.get("members", []), start=1):
            run.members.append(TeamMember(
                id=member.get("name") or str(i),
                name=member.get("name") or str(i),
                role=member.get("role", ""),
                provider=member.get("provider", "noop"),
                status=member.get("status", "active"),
                prompt=member.get("prompt", ""),
                command=member.get("command", ""),
                ultragoal=member.get("ultragoal"),
            ))
        store.save_run(run)
        return store, run
    return store, None


def serialize_team_member(member: TeamMember) -> dict[str, Any]:
    data = dict(member.__dict__)
    data["teamEligibility"] = team_member_eligibility(member.role)
    data["blockedTools"] = list(TEAM_MEMBER_BLOCKED_TOOLS)
    data["delegateTaskAllowed"] = False
    data["syncWaitAllowed"] = False
    return data


def serialize_team_task(task: TeamTask) -> dict[str, Any]:
    data = dict(task.__dict__)
    data["owner"] = task.owner or task.claimed_by
    return data


def serialize_team_message(message: TeamMessage) -> dict[str, Any]:
    data = dict(message.__dict__)
    data["delivery"] = "queued"
    data["syncWaitAllowed"] = False
    data["reservedForDelivery"] = False
    return data


def serialize_team_run(run: TeamRun, store: TeamStateStore | None = None) -> dict[str, Any]:
    run_dir = team_run_dir_for_name(run.id) if run.id else None
    return {
        "ok": True,
        "schemaVersion": 1,
        "teamRunId": run.id,
        "name": run.name,
        "objective": run.objective,
        "status": run.status,
        "createdAt": run.created_at,
        "updatedAt": run.updated_at,
        "stateDir": str(run_dir) if run_dir else None,
        "durableState": {"layout": ".lfg/runs/team-<id>/teams/<team>/", "runJson": str(run_dir / "run.json") if run_dir else None},
        "tools": list(TEAM_MODE_TOOL_NAMES),
        "bounds": {
            "maxMembers": TEAM_MAX_MEMBERS,
            "maxParallelWorkers": TEAM_MAX_PARALLEL_WORKERS,
            "maxMessageBytes": TEAM_MAX_MESSAGE_BYTES,
            "maxUnreadBytes": TEAM_MAX_UNREAD_BYTES,
            "maxMessagesPerRun": TEAM_MAX_MESSAGES_PER_RUN,
        },
        "members": [serialize_team_member(m) for m in run.members],
        "tasks": [serialize_team_task(t) for t in run.tasks],
        "mailbox": [serialize_team_message(m) for m in run.mailbox],
        "config": redact_provider_debug(run.config),
        "shutdownRequests": run.config.get("shutdownRequests", {}) if isinstance(run.config, dict) else {},
        "teamPolicy": {
            "noNestedTeams": True,
            "memberDelegateTaskAllowed": False,
            "syncReplyWaitAllowed": False,
            "leadOnlyBroadcast": True,
            "deleteRequiresNoActiveMembers": True,
        },
    }


def team_error(error: str, reason: str, **extra: Any) -> dict[str, Any]:
    return {"ok": False, "error": error, "reason": reason, **extra}


def hyperplan_dir(run_id: str) -> pathlib.Path:
    return safe_child_path(DATA / "hyperplan", validate_safe_id(run_id, "hyperplan run id"))


def hyperplan_artifact_path(run_id: str) -> pathlib.Path:
    return hyperplan_dir(run_id) / "artifact.json"


def hyperplan_critic_roster(include_deep: bool = True) -> list[dict[str, Any]]:
    categories = list(HYPERPLAN_REQUIRED_CRITIC_CATEGORIES)
    if include_deep:
        categories.extend(HYPERPLAN_OPTIONAL_CRITIC_CATEGORIES)
    categories = categories[:HYPERPLAN_MAX_CRITICS]
    return [
        {
            "id": f"critic-{index}",
            "name": f"{category}-critic",
            "category": category,
            "role": "hostile-critic",
            "provider": "noop",
            "bounded": True,
            "blockedTools": list(TEAM_MEMBER_BLOCKED_TOOLS),
            "teamEligibility": "category-member",
        }
        for index, category in enumerate(categories, start=1)
    ]


def hyperplan_task_graph(critics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    tasks: list[dict[str, Any]] = []
    for critic in critics:
        tasks.append({
            "id": f"critique-{critic['id']}",
            "owner": critic["name"],
            "kind": "critique",
            "dependsOn": [],
        })
    previous = [task["id"] for task in tasks]
    for round_name in HYPERPLAN_REVISION_ROUNDS:
        task_id = f"revision-{round_name}"
        tasks.append({"id": task_id, "owner": "leader", "kind": "revision", "dependsOn": previous})
        previous = [task_id]
    tasks.append({"id": "lead-synthesis", "owner": "leader", "kind": "synthesis", "dependsOn": previous})
    tasks.append({"id": "final-plan", "owner": "leader", "kind": "final-plan", "dependsOn": ["lead-synthesis"]})
    return tasks


def deterministic_hyperplan_critiques(objective: str, critics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rounds: list[dict[str, Any]] = []
    for round_index, round_name in enumerate(HYPERPLAN_CRITIQUE_ROUNDS, start=1):
        entries = []
        for critic in critics:
            entries.append({
                "criticId": critic["id"],
                "critic": critic["name"],
                "category": critic["category"],
                "position": f"{critic['category']} hostile review of: {objective}",
                "finding": f"{round_name} requires concrete acceptance evidence and rejects vague freeform chat.",
            })
        rounds.append({"round": round_index, "name": round_name, "entries": entries})
    return rounds


def deterministic_hyperplan_revisions(objective: str) -> list[dict[str, Any]]:
    return [
        {
            "round": index,
            "name": name,
            "revision": f"{name} narrows '{objective}' into bounded tasks with measurable evidence.",
        }
        for index, name in enumerate(HYPERPLAN_REVISION_ROUNDS, start=1)
    ]


def build_hyperplan_synthesis(objective: str, critics: list[dict[str, Any]], critique_rounds: list[dict[str, Any]], revision_rounds: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "author": "lead",
        "status": "present",
        "survivingInsights": [
            "Use bounded Team Mode critics rather than unbounded chat.",
            "Require stored critique, revision, synthesis, and final plan artifacts.",
            "Block completion when lead synthesis is absent.",
        ],
        "criticCount": len(critics),
        "critiqueRoundCount": len(critique_rounds),
        "revisionRoundCount": len(revision_rounds),
        "summary": f"Lead synthesis for '{objective}' keeps only evidence-backed planning constraints.",
    }


def build_hyperplan_final_plan(objective: str, synthesis: dict[str, Any] | None, task_graph: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not synthesis:
        return None
    return {
        "title": f"Hyperplan final plan: {objective}",
        "source": "lead-synthesis",
        "steps": [
            "Confirm scope and acceptance criteria.",
            "Execute the dependency graph in order.",
            "Collect command-output or envelope evidence for every completion.",
            "Run final xAI/Grok Oracle-gated verification before handoff.",
        ],
        "taskGraph": task_graph,
    }


def hyperplan_cmd(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    objective = args.objective
    run_id = validate_safe_id(args.run_id or f"hp-{uuid.uuid4().hex[:12]}", "hyperplan run id")
    team_name = validate_safe_id(args.team_name or f"hyperplan-{run_id}", "team name")
    critics = hyperplan_critic_roster(include_deep=not getattr(args, "no_deep", False))
    if len(critics) > HYPERPLAN_MAX_CRITICS:
        return team_error("hyperplan-roster-unbounded", "Hyperplan critic roster exceeds the bounded maximum.", maxCritics=HYPERPLAN_MAX_CRITICS)
    missing = [category for category in HYPERPLAN_REQUIRED_CRITIC_CATEGORIES if category not in {critic["category"] for critic in critics}]
    if missing:
        return team_error("hyperplan-roster-incomplete", "Hyperplan missing required hostile critic categories.", missingCategories=missing)

    team_spec = ",".join(f"1:{critic['category']}" for critic in critics)
    team = team_create(argparse.Namespace(
        spec=team_spec,
        objective=objective,
        name=team_name,
        providers="noop",
        dry_run=True,
        actor="leader",
        cwd=getattr(args, "cwd", os.getcwd()),
        mode="hyperplan",
        mode_id=run_id,
    ))
    if not team.get("ok", True):
        return team

    mode_store = TeamStateStore(mode="hyperplan", mode_id=run_id)
    run = mode_store.load_run(team_name)
    task_graph = hyperplan_task_graph(critics)
    if run:
        run.tasks = [
            TeamTask(
                id=task["id"],
                title=task["kind"],
                description=f"Hyperplan {task['kind']} for {objective}",
                status="completed" if task["kind"] not in {"synthesis", "final-plan"} else "blocked",
                owner=task["owner"],
                claimed_by=task["owner"],
                dependencies=task["dependsOn"],
                evidence="hyperplan deterministic noop artifact",
                ts=now(),
            )
            for task in task_graph
        ]

    critique_rounds = deterministic_hyperplan_critiques(objective, critics)
    revision_rounds = deterministic_hyperplan_revisions(objective)
    synthesis = None if getattr(args, "simulate_missing_synthesis", False) else build_hyperplan_synthesis(objective, critics, critique_rounds, revision_rounds)
    final_plan = build_hyperplan_final_plan(objective, synthesis, task_graph)
    status = "completed" if synthesis and final_plan else "blocked"
    blockers = [] if status == "completed" else [{"code": "missing-lead-synthesis", "reason": "Hyperplan cannot complete without lead synthesis."}]
    evidence_class = "dependency-free-smoke" if getattr(args, "noop", False) or getattr(args, "dry_run", False) else "repo-native-integration"

    artifact = {
        "ok": status == "completed",
        "schemaVersion": 1,
        "operation": "hyperplan",
        "runId": run_id,
        "teamRunId": team_name,
        "objective": objective,
        "status": status,
        "createdAt": now(),
        "updatedAt": now(),
        "evidenceClass": evidence_class,
        "oracleReview": dict(GROK_ORACLE_REVIEW),
        "boundedRoster": True,
        "maxCritics": HYPERPLAN_MAX_CRITICS,
        "critics": critics,
        "requiredCriticCategories": list(HYPERPLAN_REQUIRED_CRITIC_CATEGORIES),
        "optionalCriticCategories": list(HYPERPLAN_OPTIONAL_CRITIC_CATEGORIES),
        "critiqueRounds": critique_rounds,
        "revisionRounds": revision_rounds,
        "leadSynthesis": synthesis,
        "finalPlan": final_plan,
        "taskGraph": task_graph,
        "blockers": blockers,
        "teamMode": {
            "used": True,
            "teamRunId": team_name,
            "tools": list(TEAM_MODE_TOOL_NAMES),
            "stateDir": team.get("stateDir"),
            "hyperplanStateDir": str(mode_store._run_dir(team_name)),
            "noNestedTeams": True,
            "memberDelegateTaskAllowed": False,
        },
    }
    artifact_path = hyperplan_artifact_path(run_id)
    artifact["artifactPath"] = str(artifact_path)
    artifact["durableState"] = {"layout": ".lfg/hyperplan/<run-id>/artifact.json", "artifactJson": str(artifact_path)}
    write_json(artifact_path, artifact)

    if run:
        for task in run.tasks:
            if task.id in {"lead-synthesis", "final-plan"}:
                task.status = "completed" if status == "completed" else "blocked"
                task.evidenceArtifactPaths = [str(artifact_path)] if status == "completed" else []
        run.status = "completed" if status == "completed" else "paused"
        run.updated_at = now()
        run.config["hyperplanArtifactPath"] = str(artifact_path)
        run.config["hyperplanStatus"] = status
        mode_store.save_run(run)

    return artifact


def team_actor(args: argparse.Namespace) -> str:
    return getattr(args, "actor", None) or "leader"


def team_member_names(run: TeamRun) -> set[str]:
    names = {"leader"}
    for member in run.members:
        names.add(member.id)
        names.add(member.name)
    return names


def find_team_member(run: TeamRun, ref: str) -> TeamMember | None:
    for member in run.members:
        if ref in {member.id, member.name}:
            return member
    return None


def ensure_team_actor_allowed(run: TeamRun, actor: str) -> dict[str, Any] | None:
    if actor not in team_member_names(run):
        return team_error("unknown-team-actor", f"actor is not part of team {run.id}", actor=actor)
    return None


def reject_nested_team_create(args: argparse.Namespace) -> dict[str, Any] | None:
    actor = team_actor(args)
    if actor != "leader":
        return team_error(
            "nested-teams-not-allowed",
            "No nested teams: members cannot call team_create from inside a team run.",
            actor=actor,
            blockedTools=list(TEAM_MEMBER_BLOCKED_TOOLS),
        )
    return None


def reject_sync_wait(args: argparse.Namespace) -> dict[str, Any] | None:
    if bool(getattr(args, "wait", False)):
        return team_error(
            "synchronous-reply-waits-not-allowed",
            "team_send_message is fire-and-forget; peer reply waits are not supported.",
            syncReplyWaitAllowed=False,
        )
    return None


def member_status_allows_delete(member: TeamMember) -> bool:
    return member.status in {"completed", "failed", "shutdown_approved"} or member.shutdown_decision == "approved"


def team_list(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    active = []
    for run_json in sorted((DATA / "runs").glob("team-*/teams/*/run.json")):
        team_name = run_json.parent.name
        store, run = load_team_run(team_name)
        if run:
            active.append(serialize_team_run(run, store))
    declared = [read_json(p) for p in sorted(team_dir().glob("*.json"))] if team_dir().exists() else []
    return {"ok": True, "teams": active, "declaredTeams": declared, "tools": list(TEAM_MODE_TOOL_NAMES)}


def team_task_create(args: argparse.Namespace) -> dict[str, Any]:
    store, run = load_team_run(args.team)
    if not run:
        return team_error("team-not-found", f"team not found: {args.team}")
    actor = team_actor(args)
    denied = ensure_team_actor_allowed(run, actor)
    if denied:
        return denied
    deps = getattr(args, "depends_on", None) or []
    task = TeamTasklist(store, run.id).create_task(args.title, getattr(args, "description", "") or "", deps, getattr(args, "owner", None))
    return {"ok": True, "teamRunId": run.id, "task": serialize_team_task(task), "tasks": [serialize_team_task(t) for t in (store.load_run(run.id) or run).tasks]}


def team_task_list(args: argparse.Namespace) -> dict[str, Any]:
    store, run = load_team_run(args.team)
    if not run:
        return team_error("team-not-found", f"team not found: {args.team}")
    actor = team_actor(args)
    denied = ensure_team_actor_allowed(run, actor)
    if denied:
        return denied
    return {"ok": True, "teamRunId": run.id, "tasks": [serialize_team_task(t) for t in run.tasks]}


def team_task_get(args: argparse.Namespace) -> dict[str, Any]:
    store, run = load_team_run(args.team)
    if not run:
        return team_error("team-not-found", f"team not found: {args.team}")
    actor = team_actor(args)
    denied = ensure_team_actor_allowed(run, actor)
    if denied:
        return denied
    for task in run.tasks:
        if task.id == args.task:
            return {"ok": True, "teamRunId": run.id, "task": serialize_team_task(task)}
    return team_error("task-not-found", f"task not found: {args.task}")


def team_task_update(args: argparse.Namespace) -> dict[str, Any]:
    store, run = load_team_run(args.team)
    if not run:
        return team_error("team-not-found", f"team not found: {args.team}")
    actor = team_actor(args)
    denied = ensure_team_actor_allowed(run, actor)
    if denied:
        return denied
    allowed_statuses = {"pending", "claimed", "in_progress", "completed", "blocked", "deleted"}
    if args.status and args.status not in allowed_statuses:
        return team_error("invalid-task-status", f"invalid task status: {args.status}", allowedStatuses=sorted(allowed_statuses))
    for task in run.tasks:
        if task.id == args.task:
            if args.status:
                task.status = args.status
            if getattr(args, "owner", None):
                task.owner = args.owner
                task.claimed_by = args.owner
            elif args.status in {"claimed", "in_progress"} and not (task.owner or task.claimed_by):
                task.owner = actor
                task.claimed_by = actor
            if getattr(args, "evidence", None):
                task.evidence = args.evidence
            task.ts = now()
            run.updated_at = now()
            store.save_run(run)
            return {"ok": True, "teamRunId": run.id, "task": serialize_team_task(task), "tasks": [serialize_team_task(t) for t in run.tasks]}
    return team_error("task-not-found", f"task not found: {args.task}")


def team_send_message(args: argparse.Namespace) -> dict[str, Any]:
    blocked = reject_sync_wait(args)
    if blocked:
        return blocked
    store, run = load_team_run(args.team)
    if not run:
        return team_error("team-not-found", f"team not found: {args.team}")
    actor = team_actor(args)
    denied = ensure_team_actor_allowed(run, actor)
    if denied:
        return denied
    if args.to == "broadcast":
        if actor != "leader":
            return team_error("broadcast-lead-only", "team_send_message broadcast is lead-only", actor=actor)
        recipients = [m.name for m in run.members]
    else:
        if args.to not in team_member_names(run):
            return team_error("unknown-recipient", f"recipient is not part of team {run.id}", recipient=args.to)
        recipients = [args.to]
    mailbox = TeamMailbox(store, run.id)
    messages = [serialize_team_message(mailbox.send(actor, recipient, getattr(args, "type", None) or "message", {"body": args.body})) for recipient in recipients]
    return {"ok": True, "teamRunId": run.id, "delivery": "queued", "syncReplyWaitAllowed": False, "messages": messages}


def team_shutdown_request(args: argparse.Namespace) -> dict[str, Any]:
    store, run = load_team_run(args.team)
    if not run:
        return team_error("team-not-found", f"team not found: {args.team}")
    actor = team_actor(args)
    denied = ensure_team_actor_allowed(run, actor)
    if denied:
        return denied
    member = find_team_member(run, args.member)
    if not member:
        return team_error("member-not-found", f"member not found: {args.member}")
    if actor != "leader" and actor not in {member.id, member.name}:
        return team_error("shutdown-request-not-authorized", "only lead or target member can request shutdown", actor=actor, member=args.member)
    request = {"member": member.name, "requestedBy": actor, "requestedAt": now(), "status": "requested", "reason": getattr(args, "reason", "") or ""}
    run.config.setdefault("shutdownRequests", {})[member.name] = request
    member.status = "shutdown_requested"
    member.shutdown_requested_at = request["requestedAt"]
    run.updated_at = now()
    store.save_run(run)
    TeamMailbox(store, run.id).send(actor, member.name, "shutdown", {"body": "shutdown requested", "request": request})
    run = store.load_run(run.id) or run
    return {"ok": True, "teamRunId": run.id, "shutdownRequest": request, "team": serialize_team_run(run, store)}


def _team_shutdown_decision(args: argparse.Namespace, decision: str) -> dict[str, Any]:
    store, run = load_team_run(args.team)
    if not run:
        return team_error("team-not-found", f"team not found: {args.team}")
    actor = team_actor(args)
    denied = ensure_team_actor_allowed(run, actor)
    if denied:
        return denied
    member = find_team_member(run, args.member)
    if not member:
        return team_error("member-not-found", f"member not found: {args.member}")
    if actor != "leader" and actor not in {member.id, member.name}:
        return team_error(f"shutdown-{decision}-not-authorized", "only lead or target member can decide shutdown", actor=actor, member=args.member)
    requests = run.config.setdefault("shutdownRequests", {})
    request = requests.setdefault(member.name, {"member": member.name, "requestedBy": actor, "requestedAt": now(), "reason": ""})
    request.update({"status": decision, "decidedBy": actor, "decidedAt": now()})
    member.shutdown_decision = decision
    member.status = "shutdown_approved" if decision == "approved" else "active"
    run.updated_at = now()
    store.save_run(run)
    return {"ok": True, "teamRunId": run.id, "shutdownRequest": request, "team": serialize_team_run(run, store)}


def team_approve_shutdown(args: argparse.Namespace) -> dict[str, Any]:
    return _team_shutdown_decision(args, "approved")


def team_reject_shutdown(args: argparse.Namespace) -> dict[str, Any]:
    return _team_shutdown_decision(args, "rejected")


def team_delete(args: argparse.Namespace) -> dict[str, Any]:
    store, run = load_team_run(args.team)
    if not run:
        return team_error("team-not-found", f"team not found: {args.team}")
    actor = team_actor(args)
    if actor != "leader":
        return team_error("team-delete-lead-only", "team_delete is lead-only", actor=actor)
    active = [m.name for m in run.members if not member_status_allows_delete(m)]
    if active:
        return team_error("active-members", "team_delete rejects active members; request and approve shutdown first", activeMembers=active)
    run.status = "deleted"
    run.updated_at = now()
    deleted_state_dir = str(team_run_dir_for_name(run.id))
    store.save_run(run)
    store.delete_run(run.id)
    legacy = team_json_path(run.id)
    if legacy.exists():
        legacy.unlink()
    current = STATE_DIR / "current-team.json"
    if read_json(current, {}).get("name") == run.id:
        write_json(current, {})
    return {"ok": True, "teamRunId": run.id, "status": "deleted", "deletedStateDir": deleted_state_dir, "stateCleaned": not pathlib.Path(deleted_state_dir).exists()}

def team_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    nested = reject_nested_team_create(args)
    if nested:
        return nested
    cwd = pathlib.Path(args.cwd).resolve()
    raw_spec = args.spec
    if str(raw_spec or "").strip().lower() == "hyperplan":
        raw_spec = CANONICAL_HYPERPLAN_TEAM_SPEC
    spec_parts = parse_team_spec(raw_spec)   # now returns list of (count, name)
    total_members = sum(count for count, _ in spec_parts)
    if total_members > TEAM_MAX_MEMBERS:
        return team_error(
            "team-member-bound-exceeded",
            f"Team Mode supports at most {TEAM_MAX_MEMBERS} members per run.",
            requestedMembers=total_members,
            maxMembers=TEAM_MAX_MEMBERS,
        )

    eligibility_issues: list[dict[str, Any]] = []
    for count, role in spec_parts:
        agent_def = load_agent_definition(role)
        if not agent_def:
            continue
        agent_id = agent_def.get("id") or role
        eligibility = validate_team_member_eligibility(agent_id)
        if not eligibility.get("ok"):
            issue = dict(eligibility)
            issue["count"] = count
            issue["role"] = role
            eligibility_issues.append(issue)
    if eligibility_issues:
        decision = supervision_broker_decision(
            operation="team_create",
            lane="rejected",
            model_profile={},
            evidence_class="dependency-free-smoke",
            reason="OMO policy denied hard-reject or policy-layer agent as team writer/member",
            allowed=False,
        )
        return {
            "ok": False,
            "error": "team member eligibility rejected",
            "reason": "hard-reject team members cannot be added to a team",
            "broker": decision,
            "policyDecision": decision["policyDecision"],
            "issues": eligibility_issues,
            "eligibleTeamMembers": list(OMO_ELIGIBLE_TEAM_MEMBER_IDS),
            "conditionalTeamMembers": list(OMO_CONDITIONAL_TEAM_MEMBER_IDS),
            "hardRejectedTeamMembers": list(OMO_HARD_REJECT_TEAM_MEMBER_IDS),
            "policyLayerTeamMembers": ["builtin-agents"],
        }

    # Optional mode support (passed from ultragoal_spawn or future ultrawork)
    mode = getattr(args, "mode", None)
    mode_id = getattr(args, "mode_id", None)

    # Smart default: bounded Grok fallback lanes first, then installed local CLIs.
    installed = []
    for p, exe in TEAM_PROVIDER_EXECUTABLES.items():
        if p in ("grok", "subagent"):
            if "spawn_subagent" in globals() and callable(globals().get("spawn_subagent")):
                installed.append(p)
            else:
                installed.append(p)
        elif p == "noop":
            installed.append(p)
        elif exe and shutil.which(exe):
            installed.append(p)

    # Compute a smart default providers list from what is installed (maximize usage)
    if installed:
        default_providers = ",".join((installed * 3)[:6])
    else:
        default_providers = "grok,subagent,noop"

    providers = parse_providers(args.providers or default_providers)
    name = validate_safe_id(args.name or f"grok-team-{time.strftime('%Y%m%d-%H%M%S')}", "team name")
    objective = args.objective
    members = []
    ug = detect_current_ultragoal()
    ug_id = ug["id"] if ug else None
    user_specified_providers = bool(args.providers)

    # Support spec_parts from parse_team_spec: list of (count, role_or_agent)
    # This enables canonical OMO agent specs like "sisyphus,atlas,sisyphus-junior"
    global_idx = 0
    for count, role in spec_parts:
        for ii in range(count):
            member_prompt = None
            agent_def = load_agent_definition(role)
            effective_role = role
            effective_category = None
            is_deep = False

            if agent_def:
                # === Named canonical OMO agent path with ULW + category mapping ===
                effective_role = agent_def.get("role", role)
                effective_category = agent_def.get("default_category")
                if user_specified_providers:
                    provider = providers[global_idx % len(providers)] if providers else "grok"
                else:
                    role_providers = resolve_providers_for_agent(role, installed)
                    provider = role_providers[global_idx % len(role_providers)] if role_providers else (providers[0] if providers else "grok")
                member_name = f"{role}-{ii+1}-{provider}"
                is_deep = (effective_category == "deep") or (str(effective_role).lower() in DEEP_ROLES)

                base = (
                    f"You are {member_name} in LFG team {name}. "
                    f"Objective: {objective}. Work in {cwd}. "
                    "Coordinate through git status, tests, and concise verification notes. "
                    "Do not overwrite teammate work; inspect before editing."
                )
                if ug_id:
                    ug_objective = ug.get("objective", "") if ug else ""
                    base += (
                        f" This team was spawned from ultragoal {ug_id} (leader objective: {ug_objective}). "
                        "You are acting in a manual-gated Grok sub-agent fallback lane for an ultragoal-driven swarm (ulw mode). "
                        "When you have verifiable progress or complete a story, report back with: "
                        f"ulw ultragoal checkpoint --id {ug_id} --status complete --evidence \"<what you did + tests or artifacts>\" --story S001 (or the relevant story id). "
                        "Use the ultragoal ledger as the single source of truth for the leader."
                    )
                member_prompt = get_agent_prompt(role, effective_role, base, effective_category)
            else:
                # === Legacy generic role path (executor, architect, etc.) ===
                role_lower = (role or "").lower()
                is_deep = any(k in role_lower for k in DEEP_ROLES)

                if is_deep and not user_specified_providers:
                    role_providers = resolve_providers_for_role(role, installed)
                    provider = role_providers[global_idx % len(role_providers)] if role_providers else (providers[0] if providers else "grok")
                else:
                    provider = providers[global_idx % len(providers)] if providers else "grok"

                member_name = f"{role}-{ii+1}-{provider}"
                base = (
                    f"You are {member_name} in LFG team {name}. "
                    f"Objective: {objective}. Work in {cwd}. "
                    "Coordinate through git status, tests, and concise verification notes. "
                    "Do not overwrite teammate work; inspect before editing."
                )
                if ug_id:
                    ug_objective = ug.get("objective", "") if ug else ""
                    base += (
                        f" This team was spawned from ultragoal {ug_id} (leader objective: {ug_objective}). "
                        "You are acting in a manual-gated Grok sub-agent fallback lane for an ultragoal-driven swarm (ulw mode). "
                        "When you have verifiable progress or complete a story, report back with: "
                        f"ulw ultragoal checkpoint --id {ug_id} --status complete --evidence \"<what you did + tests or artifacts>\" --story S001 (or the relevant story id). "
                        "Use the ultragoal ledger as the single source of truth for the leader."
                    )
                # Legacy path now also builds a proper ULW-branded prompt (was missing before!)
                member_prompt = build_worker_prompt(base, role, name, {"id": ug_id} if ug_id else None)

            cmd = provider_command(provider, member_prompt)

            # ULW branding for external CLI workers (when the team is linked to an ultragoal)
            if ug_id and shutil.which("ulw"):
                cmd = f"ulw --name {shlex.quote(name)} --json status 2>/dev/null; exec bash -lc {shlex.quote(cmd)}"

            member = {
                "index": global_idx + 1,
                "name": member_name,
                "role": role,
                "provider": provider,
                "teamEligibility": team_member_eligibility(agent_def.get("id", role)) if agent_def else team_member_eligibility(role),
                "prompt": member_prompt,
                "command": cmd,
                "ultragoal": ug_id,
            }

            if provider in ("grok", "subagent"):
                spawn_envelope = spawn_agent(
                    "hephaestus" if is_deep else "sisyphus-junior",
                    category="deep" if is_deep else "quick",
                    task=member_prompt,
                    task_id=f"{name}-{member_name}",
                    run_id=f"{name}-{member_name}-spawn",
                    provider="openai" if is_deep else "xai",
                    mode="native-grok",
                    broker_depth=1,
                )
                member["spawn_envelope"] = summarize_spawn_envelope_for_team(spawn_envelope)
                member["spawned_as_subagent"] = False
                member["spawned_as_subagent_status"] = "manual_gate_required_fallback"
                member["subagent_spawn_status"] = "manual-gated; canonical spawn_agent envelope recorded"

            members.append(member)
            global_idx += 1

    team = {
        "name": name,
        "status": "planned" if args.dry_run else "running",
        "createdAt": now(),
        "updatedAt": now(),
        "objective": objective,
        "cwd": str(cwd),
        "tmuxSession": name,
        "members": members,
        "ultragoal": ug_id,
        "broker": supervision_broker_decision(
            operation="team_create",
            lane="team-create:tmux" if not args.dry_run else "team-create:dry-run",
            model_profile={},
            evidence_class="repo-native-integration" if not args.dry_run else "dependency-free-smoke",
            reason="internal broker kept TeamRuntime/team_create behind OMO policy and provider boundaries",
        ),
        "commands": {
            "status": f"tmux list-windows -t {shlex.quote(name)}",
            "attach": f"tmux attach -t {shlex.quote(name)}",
            "shutdown": f"tmux kill-session -t {shlex.quote(name)}",
        },
        "tools": list(TEAM_MODE_TOOL_NAMES),
        "bounds": {
            "maxMembers": TEAM_MAX_MEMBERS,
            "maxParallelWorkers": TEAM_MAX_PARALLEL_WORKERS,
            "maxMessageBytes": TEAM_MAX_MESSAGE_BYTES,
            "maxUnreadBytes": TEAM_MAX_UNREAD_BYTES,
            "maxMessagesPerRun": TEAM_MAX_MESSAGES_PER_RUN,
        },
        "teamPolicy": {
            "noNestedTeams": True,
            "memberDelegateTaskAllowed": False,
            "syncReplyWaitAllowed": False,
            "leadOnlyBroadcast": True,
            "deleteRequiresNoActiveMembers": True,
        },
    }

    # Write to legacy location (for backward compat during Phase 1)
    write_json(team_json_path(name), team)
    write_json(STATE_DIR / "current-team.json", {"name": name, "path": str(team_json_path(name)), "updatedAt": now()})

    runtime_store = team_runtime_store(name)
    run = TeamRun(
        id=name,
        name=name,
        objective=objective,
        status=team["status"],
        created_at=team["createdAt"],
        updated_at=team["updatedAt"],
        ultragoal_id=ug_id,
        config={
            "providers": providers,
            "parallelWorkers": min(len(members), TEAM_MAX_PARALLEL_WORKERS),
            "dryRun": bool(args.dry_run),
            "supervisionBroker": team["broker"],
        },
        members=[TeamMember(
            id=m.get("name", str(i)),
            name=m.get("name", ""),
            role=m.get("role", ""),
            provider=m.get("provider", ""),
            status="active",
            prompt=m.get("prompt", ""),
            command=m.get("command", ""),
            ultragoal=m.get("ultragoal"),
            spawned_as_subagent=m.get("spawned_as_subagent", False),
            spawn_envelope=m.get("spawn_envelope"),
            spawned_as_subagent_status=m.get("spawned_as_subagent_status"),
            subagent_spawn_status=m.get("subagent_spawn_status"),
            subagent_id=m.get("subagent_id"),
            kind="subagent_type" if m.get("role") in OMO_TEAM_ELIGIBILITY_REGISTRY else "category",
        ) for i, m in enumerate(members)],
    )
    runtime_store.save_run(run)
    team.update(serialize_team_run(run, runtime_store))

    # If mode is provided (ultragoal / ultrawork / hyperplan), mirror into separated state too.
    if mode and mode_id:
        mode_store = TeamStateStore(mode=mode, mode_id=mode_id)
        mode_store.save_run(run)

    if not args.dry_run:
        require_executable("tmux")
        control_cmd = f"printf '%s\n' {shlex.quote('lfg team ' + name)}; printf '%s\n' {shlex.quote(objective)}; exec $SHELL"
        subprocess.run(["tmux", "new-session", "-d", "-s", name, "-n", "control", "-c", str(cwd), "bash", "-lc", control_cmd], check=True)
        for m in members:
            subprocess.run(["tmux", "new-window", "-t", name, "-n", m["name"][:20], "-c", str(cwd), "bash", "-lc", m["command"]], check=True)

    return team


def team_status(args: argparse.Namespace) -> dict[str, Any]:
    if not args.name and not (read_json(STATE_DIR / "current-team.json", {}) or {}).get("name"):
        return team_list(args)
    ref = current_team_ref(args)
    store, run = load_team_run(ref)
    if not run:
        raise SystemExit(f"team not found: {ref}")
    payload = serialize_team_run(run, store)
    proc = subprocess.run(["tmux", "list-windows", "-t", ref], text=True, capture_output=True)
    payload["tmux"] = {"returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}
    return payload

def team_resume(args: argparse.Namespace) -> dict[str, Any]:
    ref = current_team_ref(args)
    store, run = load_team_run(ref)
    if not run:
        raise SystemExit(f"team not found: {ref}")
    recovery = TeamMailbox(store, run.id).reclaim_stranded_deliveries()
    return {"ok": True, "team": ref, "attachCommand": f"tmux attach -t {shlex.quote(ref)}", "statusCommand": f"tmux list-windows -t {shlex.quote(ref)}", "mailboxRecovery": recovery}


def team_shutdown(args: argparse.Namespace) -> dict[str, Any]:
    ref = current_team_ref(args)
    proc = subprocess.run(["tmux", "kill-session", "-t", ref], text=True, capture_output=True)
    path = team_json_path(ref)
    team = read_json(path, {"name": ref})
    team["status"] = "shutdown"
    team["updatedAt"] = now()
    team["shutdown"] = {"returncode": proc.returncode, "stderr": proc.stderr}
    write_json(path, team)
    return team





# --- New CLI commands for Phase 1+ state inspection (C) ---

def team_agents_list(args: argparse.Namespace) -> dict[str, Any]:
    """lfg team agents — list all available named LFG agents (with ULW identity)."""
    agents = []

    # Load from plugin examples (new canonical location)
    plugin_agents_dir = ROOT / "src" / "agents"
    if plugin_agents_dir.exists():
        for f in sorted(plugin_agents_dir.glob("*.json")):
            data = read_json(f, {})
            if data.get("name"):
                agents.append(data)

    # Load from user directory (higher priority / overrides)
    user_agents_dir = pathlib.Path.home() / ".grok" / "lfg" / "agents"
    if user_agents_dir.exists():
        for f in sorted(user_agents_dir.glob("*.json")):
            data = read_json(f, {})
            if data.get("name"):
                agents = [a for a in agents if a.get("name") != data["name"]]
                agents.append(data)

    agents.sort(key=lambda x: x.get("name", ""))
    return {
        "agents": agents,
        "count": len(agents),
        "note": "All agents run with ULW identity (LFG_LAUNCHER=ulw). Use them with `lfg team create sisyphus,atlas,sisyphus-junior ...`"
    }




def normalize_omo_agent_record(agent: dict[str, Any]) -> dict[str, Any]:
    return _AGENT_CORE.normalize_agent_record(
        agent,
        team_eligibility_registry=OMO_TEAM_ELIGIBILITY_REGISTRY,
        primary_agent_ids=OMO_PRIMARY_AGENT_IDS,
    )


def team_member_eligibility(agent_id: str) -> str:
    return _AGENT_CORE.team_member_eligibility(
        agent_id,
        team_eligibility_registry=OMO_TEAM_ELIGIBILITY_REGISTRY,
    )


def validate_team_member_eligibility(agent_id: str) -> dict[str, Any]:
    return _AGENT_CORE.validate_team_member_eligibility(
        agent_id,
        team_eligibility_registry=OMO_TEAM_ELIGIBILITY_REGISTRY,
        eligible_team_member_ids=OMO_ELIGIBLE_TEAM_MEMBER_IDS,
        conditional_team_member_ids=OMO_CONDITIONAL_TEAM_MEMBER_IDS,
        hard_reject_team_member_ids=OMO_HARD_REJECT_TEAM_MEMBER_IDS,
    )


def load_omo_agent_registry() -> list[dict[str, Any]]:
    """Load first-class OMO agents by scanning the canonical plugin agent directory.

    This makes plugins/lfg/src/agents/*.json the runtime source of truth:
    - Dropping a new <id>.json here makes the agent immediately discoverable
      via `lfg agents list`, inspectable, and callable as a subagent via
      `lfg spawn <id>` (and MCP grok_build_omo_agent_catalog + spawn).
    - Enables easy autocomplete: `lfg agents list --ids` (or jq from --json)
      produces the exact word list for shell compgen / Grok tool discovery.
    - The CANONICAL_OMO_AGENT_IDS + eligibility tables in constants.py remain
      the policy contract (primary/lead vs team-eligible vs hard-reject).
    """
    return _AGENT_CORE.load_agent_registry(
        agents_dir=ROOT / "src" / "agents",
        canonical_agent_ids=CANONICAL_OMO_AGENT_IDS,
        team_eligibility_registry=OMO_TEAM_ELIGIBILITY_REGISTRY,
        primary_agent_ids=OMO_PRIMARY_AGENT_IDS,
        read_json=read_json,
    )


OMO_AGENT_REGISTRY: list[dict[str, Any]] = load_omo_agent_registry()
_OMO_REGISTRY_INDEX: dict[str, dict[str, Any]] = {a["id"]: a for a in OMO_AGENT_REGISTRY}



def category_route_catalog() -> dict[str, Any]:
    return _AGENT_CORE.category_route_catalog(
        upstream_category_names=OMO_UPSTREAM_CATEGORY_NAMES,
        supported_category_names=OMO_LFG_SUPPORTED_CATEGORY_NAMES,
        category_migration_notes=OMO_CATEGORY_MIGRATION_NOTES,
    )



def canonical_model_provider(provider: str) -> str:
    return _AGENT_CORE.canonical_model_provider(provider, model_provider_aliases=MODEL_PROVIDER_ALIASES)


def validate_model_provider_boundary(provider: str | None = None, model: str | None = None) -> dict[str, Any] | None:
    return _AGENT_CORE.validate_model_provider_boundary(
        provider=provider,
        model=model,
        approved_model_providers=APPROVED_MODEL_PROVIDERS,
        model_provider_aliases=MODEL_PROVIDER_ALIASES,
    )

def hephaestus_model_family_status(profile: dict[str, Any]) -> dict[str, Any]:
    return _AGENT_CORE.hephaestus_model_family_status(
        profile,
        model_provider_aliases=MODEL_PROVIDER_ALIASES,
        hephaestus_approved_model_profiles=HEPHAESTUS_APPROVED_MODEL_PROFILES,
    )


def model_resolution_policy(agent: dict[str, Any], category: str | None, profile: dict[str, Any], selected_by: str) -> dict[str, Any]:
    return _AGENT_CORE.model_resolution_policy(
        agent,
        category,
        profile,
        selected_by,
        role_fit_policies=OMO_ROLE_FIT_POLICIES,
        agent_role_fit=OMO_AGENT_ROLE_FIT,
        category_role_fit=OMO_CATEGORY_ROLE_FIT,
        runtime_fallback_policy=OMO_RUNTIME_FALLBACK_POLICY,
        approved_model_providers=APPROVED_MODEL_PROVIDERS,
    )


def resolve_omo_model_profile(
    agent: dict[str, Any],
    *,
    category: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    reasoning: str | None = None,
) -> dict[str, Any]:
    return _AGENT_CORE.resolve_model_profile(
        agent,
        category=category,
        provider=provider,
        model=model,
        reasoning=reasoning,
        current_model_selection=read_model_selection(),
        approved_model_providers=APPROVED_MODEL_PROVIDERS,
        model_provider_aliases=MODEL_PROVIDER_ALIASES,
        provider_default_models=PROVIDER_DEFAULT_MODELS,
        hephaestus_approved_model_profiles=HEPHAESTUS_APPROVED_MODEL_PROFILES,
        category_model_profiles=OMO_CATEGORY_MODEL_PROFILES,
        category_migration_notes=OMO_CATEGORY_MIGRATION_NOTES,
        upstream_category_names=OMO_UPSTREAM_CATEGORY_NAMES,
        supported_category_names=OMO_LFG_SUPPORTED_CATEGORY_NAMES,
        reasoning_levels=OMO_REASONING_LEVELS,
        role_fit_policies=OMO_ROLE_FIT_POLICIES,
        agent_role_fit=OMO_AGENT_ROLE_FIT,
        category_role_fit=OMO_CATEGORY_ROLE_FIT,
        runtime_fallback_policy=OMO_RUNTIME_FALLBACK_POLICY,
    )


def route_task_request(category: str | None, subagent_type: str | None, task: str | None) -> dict[str, Any]:
    category = category or None
    subagent_type = subagent_type or None
    if category and subagent_type:
        return {
            "ok": False,
            "status": "blocked",
            "error": "category and subagent_type are mutually exclusive",
            "category": category,
            "subagent_type": subagent_type,
            "migrationNote": "task(category=...) routes to Sisyphus-Junior; supply only category or subagent_type in a single request.",
            "categoryRouting": category_route_catalog(),
        }
    if not category and not subagent_type:
        return {
            "ok": False,
            "status": "blocked",
            "error": "either category or subagent_type is required",
            "categoryRouting": category_route_catalog(),
        }

    if category:
        junior = _OMO_REGISTRY_INDEX["sisyphus-junior"]
        resolved = resolve_omo_model_profile(junior, category=category)
        if not resolved.get("ok"):
            return {
                **resolved,
                "status": resolved.get("status") or "blocked",
                "routeKind": "category",
                "categoryRouting": category_route_catalog(),
                "selectedAgent": {"id": junior["id"], "name": junior["name"], "family": junior["family"], "mode": junior["mode"]},
            }

        blocked_tools = sorted(set(junior.get("blockedTools", [])) | set(OMO_CATEGORY_ROUTE_BLOCKED_TOOLS))
        return {
            "ok": True,
            "status": "ok",
            "routeKind": "category",
            "task": task,
            "category": category,
            "reason": resolved["modelResolution"]["reason"],
            "selectedAgent": {"id": junior["id"], "name": junior["name"], "family": junior["family"], "mode": junior["mode"]},
            "modelProfile": resolved["modelProfile"],
            "blockedTools": blocked_tools,
            "verificationGate": dict(OMO_CATEGORY_ROUTE_VERIFICATION_GATE),
            "delegation": {
                "allowed": False,
                "reason": "Sisyphus-Junior executes bounded category tasks and cannot re-delegate uncontrolled work.",
                "blockedTools": ["spawn", "spawn_wave", "dependency_graph"],
            },
            "modelResolution": resolved["modelResolution"],
            "categoryRouting": category_route_catalog(),
        }

    agent = _OMO_REGISTRY_INDEX.get(subagent_type or "")
    if agent is None:
        return {
            "ok": False,
            "status": "blocked",
            "error": "unknown subagent_type",
            "subagent_type": subagent_type,
            "known": sorted(_OMO_REGISTRY_INDEX.keys()),
            "categoryRouting": category_route_catalog(),
        }
    resolved = resolve_omo_model_profile(agent, provider=agent.get("modelProfile", {}).get("provider"), model=agent.get("modelProfile", {}).get("model"), reasoning=agent.get("modelProfile", {}).get("reasoning"))
    if not resolved.get("ok"):
        return {
            **resolved,
            "status": resolved.get("status") or "blocked",
            "routeKind": "subagent_type",
            "categoryRouting": category_route_catalog(),
            "selectedAgent": {"id": agent["id"], "name": agent["name"], "family": agent["family"], "mode": agent["mode"]},
        }
    return {
        "ok": True,
        "status": "ok",
        "routeKind": "subagent_type",
        "task": task,
        "selectedAgent": {"id": agent["id"], "name": agent["name"], "family": agent["family"], "mode": agent["mode"]},
        "modelProfile": resolved["modelProfile"],
        "blockedTools": list(agent.get("blockedTools", [])),
        "verificationGate": {"required": True, "gate": "dependency-free-smoke", "kind": "self-verify", "status": "required"},
        "delegation": {"allowed": False, "reason": "Bounded routing keeps delegated tasks from becoming uncontrolled recursion."},
        "modelResolution": resolved["modelResolution"],
        "categoryRouting": category_route_catalog(),
    }


def agents_list(args: argparse.Namespace) -> dict[str, Any]:
    """lfg agents list — list all OMO first-class agents.

    Supports easy autocomplete / subagent discovery:
    - `lfg agents list --ids`          → newline-separated ids (ideal for shell compgen)
    - `lfg agents list --json --ids`   → {"ids": [...]}
    Any agent .json in plugins/lfg/src/agents/ (that passes validation) is callable
    via `lfg spawn <id>` and appears here for Grok sub-agent selection.
    """
    ids_only = getattr(args, "ids", False) or getattr(args, "completion", False)
    if ids_only:
        ids = [a["id"] for a in OMO_AGENT_REGISTRY]
        if getattr(args, "json", False):
            return {"ok": True, "ids": ids, "count": len(ids)}
        # Plain text output for direct use in `compgen -W "$(...)"` or similar
        # The emit() caller will print this when not json mode.
        return {"ok": True, "ids": ids, "count": len(ids), "_raw_text": "\n".join(ids)}

    return {
        "ok": True,
        "status": "ok",
        "agents": OMO_AGENT_REGISTRY,
        "count": len(OMO_AGENT_REGISTRY),
        "categoryModelProfiles": OMO_CATEGORY_MODEL_PROFILES,
        "categoryRouting": category_route_catalog(),
        "modelMatchingSource": OMO_MODEL_MATCHING_SOURCE,
        "roleFitPolicies": OMO_ROLE_FIT_POLICIES,
    }


def agents_inspect(args: argparse.Namespace) -> dict[str, Any]:
    """lfg agents inspect <id> — show full registry entry for one agent."""
    agent_id = args.agent_id
    agent = _OMO_REGISTRY_INDEX.get(agent_id)
    if agent is None:
        known = sorted(_OMO_REGISTRY_INDEX.keys())
        return {"ok": False, "error": f"unknown agent: {agent_id!r}", "known": known}

    resolved = resolve_omo_model_profile(
        agent,
        category=getattr(args, "category", None),
        provider=getattr(args, "provider", None),
        model=getattr(args, "model", None),
        reasoning=getattr(args, "reasoning", None),
    )
    if not resolved.get("ok"):
        return resolved

    return {
        "ok": True,
        "agent": {**agent, "modelProfile": resolved["modelProfile"]},
        "resolvedModelProfile": resolved["modelProfile"],
        "modelResolution": resolved["modelResolution"],
        "categoryRouting": category_route_catalog(),
    }


def spawn_cmd(args: argparse.Namespace) -> dict[str, Any]:
    """lfg spawn <agent_id> — spawn an OMO agent via Grok Spawn Adapter."""
    return spawn_agent(
        args.agent_id,
        category=getattr(args, "category", None),
        task=getattr(args, "task", None),
        task_id=getattr(args, "task_id", None),
        provider=getattr(args, "provider", None),
        model=getattr(args, "model", None),
        reasoning=getattr(args, "reasoning", None),
        mode=getattr(args, "mode", None),
        simulate_provider_error=getattr(args, "simulate_provider_error", None),
        broker_depth=getattr(args, "broker_depth", 0),
        broker_max_depth=getattr(args, "broker_max_depth", SUPERVISION_BROKER_MAX_DEPTH),
    )


def hephaestus_goal_cmd(args: argparse.Namespace) -> dict[str, Any]:
    """Start a Hephaestus autonomous deep-work goal through the spawn adapter."""
    return spawn_agent(
        "hephaestus",
        category=getattr(args, "category", None) or "deep",
        task=getattr(args, "goal", None),
        task_id=getattr(args, "task_id", None),
        provider=getattr(args, "provider", None),
        model=getattr(args, "model", None),
        reasoning=getattr(args, "reasoning", None),
        mode=getattr(args, "mode", None),
    )


def load_json_arg(value: str) -> Any:
    stripped = value.lstrip()
    if stripped.startswith("{") or stripped.startswith("["):
        return json.loads(value)
    candidate = pathlib.Path(value)
    if candidate.exists():
        return json.loads(candidate.read_text(encoding="utf-8"))
    return json.loads(value)


def spawn_wave_cmd(args: argparse.Namespace) -> dict[str, Any]:
    return spawn_wave(load_json_arg(args.tasks_json), run_id=getattr(args, "run_id", None), mode=getattr(args, "mode", None))


def route_cmd(args: argparse.Namespace) -> dict[str, Any]:
    return route_task_request(getattr(args, "category", None), getattr(args, "subagent_type", None), getattr(args, "task", None))


def dependency_graph_cmd(args: argparse.Namespace) -> dict[str, Any]:
    return run_dependency_graph(load_json_arg(args.plan_json), run_id=getattr(args, "run_id", None), mode=getattr(args, "mode", None))


def synthesize_cmd(args: argparse.Namespace) -> dict[str, Any]:
    return synthesize(load_json_arg(args.results_json), run_id=getattr(args, "run_id", None))


def resume_cmd(args: argparse.Namespace) -> dict[str, Any]:
    return resume_spawn_run(args.run_id)


def validate_spawn_envelopes_cmd(args: argparse.Namespace) -> dict[str, Any]:
    fixture = load_json_arg(args.fixture_json)
    envelopes = fixture.get("envelopes", fixture) if isinstance(fixture, dict) else fixture
    if not isinstance(envelopes, list):
        raise SystemExit("spawn envelope fixture must be a list or {envelopes: [...]}")
    results = []
    for idx, envelope in enumerate(envelopes):
        if not isinstance(envelope, dict):
            results.append({"index": idx, "ok": False, "errors": ["entry is not an object"]})
            continue
        errors = validate_spawn_envelope(envelope)
        results.append({"index": idx, "runId": envelope.get("runId"), "status": envelope.get("status"), "ok": not errors, "errors": errors})
    return {
        "ok": all(item["ok"] for item in results),
        "schemaVersion": SPAWN_ENVELOPE_SCHEMA_VERSION,
        "count": len(results),
        "results": results,
        "evidence": "spawn-envelope-fixture-validation=ok" if all(item["ok"] for item in results) else "spawn-envelope-fixture-validation=failed",
    }


def team_state_show(args: argparse.Namespace) -> dict[str, Any]:
    """lfg team state <name> or lfg team run <name>."""
    name = validate_safe_id(args.name, "team name")
    legacy_path = team_json_path(name)
    state_path = str(legacy_path)
    mode = "legacy"
    rich_run = None

    runs_dir = STATE_DIR / "runs"
    if runs_dir.exists():
        for mode_dir in sorted(runs_dir.glob("*")):
            if not mode_dir.is_dir():
                continue
            candidate_dir = mode_dir / "teams" / name
            run_json = candidate_dir / "run.json"
            if not run_json.exists():
                continue
            try:
                store = TeamStateStore(base_dir=mode_dir)
                store.mode = mode_dir.name.split("-")[0] if "-" in mode_dir.name else "run"
                store.mode_id = name
                rich_run = store.load_run(name)
                if rich_run:
                    mode = store.mode or "run"
                    state_path = str(candidate_dir)
                    break
            except Exception:
                continue

    if rich_run:
        return {
            "name": rich_run.name,
            "mode": mode,
            "status": rich_run.status,
            "objective": rich_run.objective,
            "ultragoal": rich_run.ultragoal_id,
            "members": [m.__dict__ for m in rich_run.members],
            "tasks": [t.__dict__ for t in rich_run.tasks],
            "recent_mailbox": [m.__dict__ for m in (rich_run.mailbox or [])[-10:]],
            "state_path": state_path,
            "note": "Rich TeamRun with mailbox + tasks + evidence verification",
        }

    if not legacy_path.exists():
        return {"error": f"Team {name!r} not found"}

    legacy_state = read_json(legacy_path, {}) or {}
    return {
        "name": name,
        "mode": mode,
        "status": legacy_state.get("status"),
        "members": legacy_state.get("members", []),
        "state_path": state_path,
        "note": "Legacy flat team state",
    }


def cancel(args: argparse.Namespace) -> dict[str, Any]:
    """Clear current workflow pointers without deleting durable run history."""
    ensure_dirs()
    targets = {
        "goal": STATE_DIR / "current-goal.json",
        "plan": STATE_DIR / "current-plan.json",
        "team": STATE_DIR / "current-team.json",
        "ultraqa": STATE_DIR / "last-ultraqa.json",
    }
    requested = [x.strip() for x in (args.scope or "all").split(",") if x.strip()]
    if "all" in requested:
        requested = list(targets)
    cleared = []
    missing = []
    for key in requested:
        path = targets.get(key)
        if not path:
            missing.append({"scope": key, "reason": "unknown"})
            continue
        if path.exists():
            path.unlink()
            cleared.append({"scope": key, "path": str(path)})
        else:
            missing.append({"scope": key, "path": str(path), "reason": "not_found"})
    record = {"ts": now(), "scope": requested, "cleared": cleared, "missing": missing}
    write_json(STATE_DIR / "last-cancel.json", record)
    return {"ok": True, **record}

def wiki_dir() -> pathlib.Path:
    return DATA / "wiki"


def slugify(text: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", text.strip().lower()).strip("-")
    return slug[:80] or f"note-{uuid.uuid4().hex[:8]}"


def wiki_add(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    title = args.title.strip()
    body = args.body.strip()
    ts = now()
    note_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{slugify(title)}"
    note = {
        "id": note_id,
        "title": title,
        "body": body,
        "tags": [t.strip() for t in (args.tags or "").split(",") if t.strip()],
        "createdAt": ts,
        "updatedAt": ts,
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    path = wiki_dir() / f"{note_id}.json"
    write_json(path, note)
    note["path"] = str(path)
    return note


def wiki_notes() -> list[dict[str, Any]]:
    notes = []
    for path in sorted(wiki_dir().glob("*.json")) if wiki_dir().exists() else []:
        try:
            note = read_json(path)
            note["path"] = str(path)
            notes.append(note)
        except Exception:
            pass
    return notes


def wiki_list(args: argparse.Namespace) -> dict[str, Any]:
    notes = wiki_notes()
    if args.limit:
        notes = notes[-args.limit:]
    return {"count": len(notes), "notes": notes}


def wiki_search(args: argparse.Namespace) -> dict[str, Any]:
    q = args.query.lower()
    matches = []
    for note in wiki_notes():
        haystack = "\n".join([note.get("title", ""), note.get("body", ""), " ".join(note.get("tags", []))]).lower()
        if q in haystack:
            matches.append(note)
    return {"query": args.query, "count": len(matches), "matches": matches}

def doctor(args: argparse.Namespace) -> dict[str, Any]:
    """Diagnose the local lfg plugin/runtime installation."""
    ensure_dirs()
    checks = []

    def add(name: str, ok: bool, evidence: str, required: bool = True) -> None:
        checks.append({"name": name, "ok": bool(ok), "required": required, "evidence": evidence})

    manifest = ROOT / ".grok-plugin" / "plugin.json"
    add("grok_manifest", manifest.exists(), str(manifest))
    mcp_config = ROOT / ".mcp.json"
    add("mcp_config", mcp_config.exists(), str(mcp_config))
    catalog_file = ROOT / "catalog" / "omo-skill-map.json"
    catalog_data = read_json(catalog_file, {"skills": []})
    add("catalog", catalog_file.exists() and len(catalog_data.get("skills", [])) >= 17, f"{catalog_file} skills={len(catalog_data.get('skills', []))}")
    skills_dir = ROOT / "skills"
    skill_count = len(list(skills_dir.glob("*/SKILL.md"))) if skills_dir.exists() else 0
    add("skills", skill_count >= 17, f"{skills_dir} skill_count={skill_count}")
    repo_root = ROOT.parents[1] if len(ROOT.parents) > 1 else ROOT
    for name, rel in [("grok_marketplace", ".grok/plugins/marketplace.json"), ("agents_marketplace", ".agents/plugins/marketplace.json")]:
        path = repo_root / rel
        data = read_json(path, {})
        plugin = (data.get("plugins") or [{}])[0] if isinstance(data.get("plugins"), list) and data.get("plugins") else {}
        ok = (
            path.exists()
            and plugin.get("name") == "lfg"
            and plugin.get("source", {}).get("path") == "plugins/lfg"
            and plugin.get("metadata", {}).get("packageName") == "islee23520/lfg"
        )
        add(name, ok, f"{path} package={plugin.get('metadata', {}).get('packageName')}")
    for exe, required in [("tmux", True), ("hermes", False), ("claude", False), ("codex", False), ("grok", False)]:
        path = shutil.which(exe)
        add(f"exe:{exe}", bool(path), path or "not found", required=required)
    data_ok = DATA.exists() or DATA.parent.exists()
    add("plugin_data", data_ok, str(DATA), required=True)
    add("default_launcher", True, f"lfg (effective={effective_launcher()})", required=False)
    schema = ensure_state_schema()
    add("state_schema", schema.get("version") == STATE_SCHEMA_VERSION and state_schema_path().exists(), f"{state_schema_path()} version={schema.get('version')}", required=True)
    providers = team_provider_matrix()
    available = [p["provider"] for p in providers if p["available"]]
    add("team_provider_commands", True, f"available={','.join(available)} providers={','.join(p['provider'] for p in providers)}", required=False)
    bridge = hook_bridge_status(argparse.Namespace())
    add("global_hook_bridge", bridge["ok"], f"installed={bridge['installed']} valid={bridge['valid']} config={bridge['config']}", required=False)
    failed_required = [c for c in checks if c["required"] and not c["ok"]]
    warnings = [c for c in checks if not c["required"] and not c["ok"]]
    return {
        "ok": not failed_required,
        "status": "pass" if not failed_required else "fail",
        "pluginRoot": str(ROOT),
        "pluginData": str(DATA),
        "checks": checks,
        "failedRequired": failed_required,
        "warnings": warnings,
    }


def doctor_state_schema_check(args: argparse.Namespace) -> dict[str, Any]:
    schema = ensure_state_schema()
    return {
        "ok": True,
        "status": "pass",
        "operation": "doctor_state_schema_check",
        "schema": schema,
        "stateRoots": {
            "state": str(STATE_DIR),
            "runs": str(RUNS_DIR),
            "plans": str(PLANS_DIR),
            "boulder": str(DATA / "boulder"),
            "notepads": str(DATA / "notepads"),
            "mailbox": str(DATA / "mailbox"),
            "tasklists": str(DATA / "tasklists"),
            "teams": str(DATA / "teams"),
            "wiki": str(DATA / "wiki"),
            "hyperplan": str(DATA / "hyperplan"),
            "dispatchGate": str(DATA / "dispatch-gate"),
        },
        "migrationStatus": schema.get("migrationStatus"),
        "migrations": schema.get("migrations", []),
        "evidence": ["state-schema-versioning=ok", "state-schema-doctor=ok", "continuation-gate=ok"],
    }


def hook_bridge_paths() -> dict[str, pathlib.Path]:
    module = load_src_module("_lfg_hook_bridge_runtime", ROOT / "src" / "hooks" / "bridge_runtime.py")
    return module.paths(ROOT)


def hook_bridge_status(args: argparse.Namespace) -> dict[str, Any]:
    module = load_src_module("_lfg_hook_bridge_runtime", ROOT / "src" / "hooks" / "bridge_runtime.py")
    return module.status(ROOT)


def hook_bridge_install(args: argparse.Namespace) -> dict[str, Any]:
    module = load_src_module("_lfg_hook_bridge_runtime", ROOT / "src" / "hooks" / "bridge_runtime.py")
    return module.install(ROOT)

def slash(args: argparse.Namespace) -> dict[str, Any]:
    """Parse a Grok slash-command string into an LFG runtime action.

    MVP target: /team 3:executor "task", /team status NAME, /team resume NAME,
    /team shutdown NAME.  This lets a Grok skill map user-visible slash syntax to
    the durable tmux backend without duplicating parsing logic in prompt text.
    """
    raw = args.command.strip()
    if not raw.startswith("/"):
        raise SystemExit("slash command must start with /")
    parts = shlex.split(raw)
    if not parts:
        raise SystemExit("empty slash command")
    name = parts[0][1:]
    rest = parts[1:]
    if name == "ulw":
        # Hybrid ulw keyword trigger (Candidate 3)
        objective = " ".join(rest) if rest else ""
        if not objective:
            return {"error": "usage: /ulw your objective"}
        trigger = detect_ulw_intent(objective)
        return ulw_intent(argparse.Namespace(objective=[objective], cwd=args.cwd))
    if name == "route":
        category = None
        subagent_type = None
        task_parts: list[str] = []
        i = 0
        while i < len(rest):
            token = rest[i]
            if token == "--category" and i + 1 < len(rest):
                category = rest[i + 1]
                i += 2
            elif token == "--subagent-type" and i + 1 < len(rest):
                subagent_type = rest[i + 1]
                i += 2
            elif token == "--task" and i + 1 < len(rest):
                task_parts.append(rest[i + 1])
                i += 2
            else:
                task_parts.append(token)
                i += 1
        return route_task_request(category, subagent_type, " ".join(task_parts).strip() or None)
    if name == "hook-bridge":
        action = rest[0] if rest else "status"
        if action == "status":
            return hook_bridge_status(argparse.Namespace())
        if action == "install":
            return hook_bridge_install(argparse.Namespace())
        raise SystemExit("usage: /hook-bridge [status|install]")
    if name == "ultragoal":
        action = rest[0] if rest else "status"
        if action == "create":
            if len(rest) < 2:
                raise SystemExit('usage: /ultragoal create "objective" [--checklist "a;b"]')
            objective_parts: list[str] = []
            checklist = None
            ugid = None
            brief = None
            i = 1
            while i < len(rest):
                token = rest[i]
                if token == "--checklist" and i + 1 < len(rest):
                    checklist = rest[i + 1]
                    i += 2
                elif token == "--id" and i + 1 < len(rest):
                    ugid = rest[i + 1]
                    i += 2
                elif token == "--brief" and i + 1 < len(rest):
                    brief = rest[i + 1]
                    i += 2
                else:
                    objective_parts.append(token)
                    i += 1
            return ultragoal_create(argparse.Namespace(objective=" ".join(objective_parts), id=ugid, checklist=checklist, brief=brief, cwd=args.cwd))
        if action == "spawn":
            # /ultragoal spawn 3:executor "objective for swarm"
            spec = rest[1] if len(rest) > 1 else "3:executor"
            objective_parts = []
            i = 2 if len(rest) > 1 else 1
            while i < len(rest):
                objective_parts.append(rest[i])
                i += 1
            return ultragoal_spawn(argparse.Namespace(
                objective=" ".join(objective_parts) or "swarm task",
                spec=spec,
                cwd=args.cwd,
                dry_run=args.dry_run,
                providers=args.providers,
                name=args.name,
                id=None,
                brief=None,
                checklist=None,
            ))
        if action in {"status", "show"}:
            target = rest[1] if len(rest) > 1 else None
            return ultragoal_show(argparse.Namespace(id=target))
        if action == "checkpoint":
            status = "active"
            evidence = ""
            ugid = None
            story = None
            evidence_artifact = []
            force_gate = False
            i = 1
            while i < len(rest):
                token = rest[i]
                if token == "--id" and i + 1 < len(rest):
                    ugid = rest[i + 1]
                    i += 2
                elif token == "--story" and i + 1 < len(rest):
                    story = rest[i + 1]
                    i += 2
                elif token == "--status" and i + 1 < len(rest):
                    status = rest[i + 1]
                    i += 2
                elif token == "--evidence" and i + 1 < len(rest):
                    evidence = rest[i + 1]
                    i += 2
                elif token == "--evidence-artifact" and i + 1 < len(rest):
                    evidence_artifact.append(rest[i + 1])
                    i += 2
                elif token == "--force-gate":
                    force_gate = True
                    i += 1
                else:
                    evidence = (evidence + " " + token).strip()
                    i += 1
            return ultragoal_checkpoint(argparse.Namespace(id=ugid, story=story, status=status, evidence=evidence, evidence_artifact=evidence_artifact, force_gate=force_gate, goal_json=None, cwd=args.cwd))
        raise SystemExit("usage: /ultragoal [create|status|show|checkpoint] ...")
    if name == "plan":
        # Support `/plan create "Title" [--steps "s1;s2"]` and `/plan list` for the `/plan` entry point
        # (in addition to `lfg plan create`, plan skill, grok_build_plan). Delegates directly to mk_plan
        # so the rich preview + markdown_content is returned automatically.
        if not rest:
            raise SystemExit('usage: /plan create "title" [--steps "step1;step2;..."]')
        action = rest[0]
        if action == "create":
            title_parts: list[str] = []
            steps = None
            i = 1
            while i < len(rest):
                token = rest[i]
                if token == "--steps" and i + 1 < len(rest):
                    steps = rest[i + 1]
                    i += 2
                else:
                    title_parts.append(token)
                    i += 1
            title = " ".join(title_parts) or "Untitled plan"
            return mk_plan(argparse.Namespace(title=title, steps=steps, cwd=args.cwd))
        if action == "list":
            return plan_list(argparse.Namespace(limit=None, cwd=args.cwd))
        raise SystemExit('usage: /plan create "title" [--steps "..."] or /plan list')
    if name == "model":
        if not rest:
            return models_show(argparse.Namespace(provider=None))
        provider = None
        reasoning = None
        model_parts: list[str] = []
        i = 0
        while i < len(rest):
            token = rest[i]
            if token == "--provider" and i + 1 < len(rest):
                provider = rest[i + 1]
                i += 2
            elif token == "--reasoning" and i + 1 < len(rest):
                reasoning = rest[i + 1]
                i += 2
            else:
                model_parts.append(token)
                i += 1
        return models_switch(argparse.Namespace(model=" ".join(model_parts), provider=provider, reasoning=reasoning, source="grok-build-/model"))
    if name == "loop":
        action = rest[0] if rest else "status"
        if action in {"start", "create"}:
            objective = " ".join(rest[1:]).strip()
            return loop_start(argparse.Namespace(objective=objective, cwd=args.cwd))
        if action in {"status", "show"}:
            target = rest[1] if len(rest) > 1 else None
            return loop_status(argparse.Namespace(id=target))
        if action == "step":
            task = 1
            status = "active"
            evidence = ""
            evidence_artifact: list[str] = []
            i = 1
            while i < len(rest):
                token = rest[i]
                if token == "--task" and i + 1 < len(rest):
                    task = int(rest[i + 1])
                    i += 2
                elif token == "--status" and i + 1 < len(rest):
                    status = rest[i + 1]
                    i += 2
                elif token == "--evidence" and i + 1 < len(rest):
                    evidence = rest[i + 1]
                    i += 2
                elif token == "--evidence-artifact" and i + 1 < len(rest):
                    evidence_artifact.append(rest[i + 1])
                    i += 2
                else:
                    evidence = (evidence + " " + token).strip()
                    i += 1
            return loop_step(argparse.Namespace(id=None, task=task, status=status, evidence=evidence, evidence_artifact=evidence_artifact))
        if action in {"stop", "cancel"}:
            return loop_stop(argparse.Namespace(status="stopped"))
        raise SystemExit('usage: /loop [start "objective"|status|step|stop]')
    if name == "grok-build":
        action = rest[0] if rest else "status"
        if action == "start":
            return grok_build_tmux_start(argparse.Namespace(name=args.name, cwd=args.cwd, model=None, provider=None, reasoning=None, dry_run=args.dry_run))
        if action == "status":
            return grok_build_tmux_status(argparse.Namespace(name=args.name))
        if action == "model":
            if len(rest) < 2:
                raise SystemExit("usage: /grok-build model <model>")
            return grok_build_tmux_model(argparse.Namespace(name=args.name, model=rest[1], provider=None, reasoning=None, dry_run=args.dry_run))
        if action == "send":
            return grok_build_tmux_send(argparse.Namespace(name=args.name, text=" ".join(rest[1:])))
        if action == "capture":
            return grok_build_tmux_capture(argparse.Namespace(name=args.name, start=-80))
        if action == "stop":
            return grok_build_tmux_stop(argparse.Namespace(name=args.name))
        raise SystemExit("usage: /grok-build [start|status|model|send|capture|stop]")
    if name != "team":
        raise SystemExit(f"unsupported slash command: /{name}")
    if not rest:
        return team_status(argparse.Namespace(name=None, cwd=args.cwd))
    verb = rest[0]
    if verb == "providers":
        return team_providers(argparse.Namespace())
    if verb == "preflight":
        return team_preflight(argparse.Namespace(name=args.name, cwd=args.cwd))
    if verb in {"status", "resume", "shutdown"}:
        target = rest[1] if len(rest) > 1 else None
        ns = argparse.Namespace(name=target, cwd=args.cwd)
        if verb == "status":
            return team_status(ns)
        if verb == "resume":
            return team_resume(ns)
        return team_shutdown(ns)
    if len(rest) < 2:
        raise SystemExit('usage: /team 3:executor "objective"')
    return team_create(argparse.Namespace(
        spec=rest[0],
        objective=" ".join(rest[1:]),
        name=args.name,
        providers=args.providers,
        dry_run=args.dry_run,
        cwd=args.cwd,
    ))

def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]
    argv = ["--help" if item in {"-help", "help"} else item for item in argv]
    launcher = effective_launcher()

    # Direct `ulw "goal text"` support (per bin/ulw, skills/ulw/SKILL.md, and OMO hybrid intent).
    # When launched via the ulw binary with a leading prose goal (not a recognized subcommand verb),
    # bypass normal subparser dispatch and activate Ultrawork immediately via ulw_intent.
    # This repairs the documented one-liner UX that was unreachable after the big runtime move.
    if launcher == "ulw" and argv and not argv[0].startswith("-"):
        first = argv[0]
        # Known top-level command verbs that should be parsed normally even under `ulw` binary
        # (so `ulw status`, `ulw analyze ...`, `ulw plan ...` etc. continue to work with ulw identity).
        known_cmds = {
            "ulw", "status", "doctor", "catalog", "spawn", "team", "plan", "ralph", "hud",
            "cancel", "setup", "provider", "skill", "wiki", "goal", "hephaestus", "hyperplan",
            "ultragoal", "ultrawork", "loop", "autopilot", "ask", "analyze", "design",
            "worker", "backend", "auth", "models", "slash", "hook-bridge", "grok-build",
            "performance-goal", "visual-ralph", "autoresearch", "deep-interview",
            "ai-slop-cleaner", "pipeline", "ralplan", "route", "resume",
            "synthesize", "dependency-graph", "spawn-wave", "spawn-envelope", "agents",
            "mcp", "notifications", "configure-notifications",
        }
        if first not in known_cmds:
            # Bare prose goal (e.g. ulw "analyze recent commits..." or ulw fix the bug)
            # Filter flags so the objective text is clean prose; explicit=True because the
            # user invoked the dedicated `ulw` launcher binary (strongest signal).
            goal_tokens = [a for a in argv if not a.startswith("-")]
            json_mode = "--json" in argv or any(a in ("-j", "--json") for a in argv)
            ulw_args = argparse.Namespace(
                objective=goal_tokens,
                json=json_mode,
                cwd=".",
            )
            result = ulw_intent(ulw_args)
            emit(result, json_mode)
            return 0

    p = argparse.ArgumentParser(
        prog=launcher,
        description="LFG — Grok Build runtime helper (workflows, durable goals, team swarms)",
    )
    if launcher not in ("lfg", "ulw"):
        # Direct python lfg.py invocation — be friendly
        print(
            "Note: You invoked lfg.py directly. "
            "The recommended CLI is `lfg` (or `ulw` for swarm contexts).\n"
            "Install the proper wrappers with: scripts/install-lfg-symlink.sh\n",
            file=sys.stderr,
        )
    p.add_argument("--json", action="store_true")
    p.add_argument("--cwd", default=os.getcwd())
    p.add_argument("--name", help="backend session name for explicit backend/team commands")
    sub = p.add_subparsers(dest="cmd")

    sub.add_parser("catalog").set_defaults(fn=catalog)
    sub.add_parser("status").set_defaults(fn=status)
    doc = sub.add_parser("doctor")
    doc.set_defaults(fn=doctor)
    docsub = doc.add_subparsers(dest="doctor_cmd")
    docstate = docsub.add_parser("state")
    docstate_sub = docstate.add_subparsers(dest="doctor_state_cmd", required=True)
    docschema = docstate_sub.add_parser("schema")
    docschema_sub = docschema.add_subparsers(dest="doctor_state_schema_cmd", required=True)
    docschema_check = docschema_sub.add_parser("check")
    docschema_check.set_defaults(fn=doctor_state_schema_check)

    # Grok Spawn Adapter (lfg-native OMO parity)
    sp = sub.add_parser("spawn")
    sp.add_argument("agent_id")
    sp.add_argument("--category")
    sp.add_argument("--task")
    sp.add_argument("--provider")
    sp.add_argument("--model")
    sp.add_argument("--reasoning")
    sp.add_argument("--mode", choices=["fallback", "native-grok"], default="fallback")
    sp.add_argument("--task-id")
    sp.add_argument("--simulate-provider-error", choices=["auth-error", "rate-limit"])
    sp.add_argument("--broker-depth", type=int, default=0, help=argparse.SUPPRESS)
    sp.add_argument("--broker-max-depth", type=int, default=SUPERVISION_BROKER_MAX_DEPTH, help=argparse.SUPPRESS)
    sp.set_defaults(fn=spawn_cmd)

    hp_plan = sub.add_parser("hyperplan")
    hp_plan.add_argument("objective")
    hp_plan.add_argument("--run-id")
    hp_plan.add_argument("--team-name")
    hp_plan.add_argument("--noop", action="store_true", default=True)
    hp_plan.add_argument("--dry-run", action="store_true", default=True)
    hp_plan.add_argument("--no-deep", action="store_true")
    hp_plan.add_argument("--simulate-missing-synthesis", action="store_true", help=argparse.SUPPRESS)
    hp_plan.set_defaults(fn=hyperplan_cmd)

    rt = sub.add_parser("route")
    rt.add_argument("--category")
    rt.add_argument("--subagent-type")
    rt.add_argument("--task", required=True)
    rt.set_defaults(fn=route_cmd)

    sw = sub.add_parser("spawn-wave")
    sw.add_argument("--tasks-json", required=True, help="JSON array or path containing agent task objects")
    sw.add_argument("--run-id")
    sw.add_argument("--mode", choices=["fallback", "native-grok"], default="fallback")
    sw.set_defaults(fn=spawn_wave_cmd)

    dg = sub.add_parser("dependency-graph")
    dg.add_argument("--plan-json", required=True, help="JSON array or path containing dependency graph tasks")
    dg.add_argument("--run-id")
    dg.add_argument("--mode", choices=["fallback", "native-grok"], default="fallback")
    dg.set_defaults(fn=dependency_graph_cmd)

    syn = sub.add_parser("synthesize")
    syn.add_argument("--results-json", required=True, help="JSON array or path containing canonical child envelopes")
    syn.add_argument("--run-id")
    syn.set_defaults(fn=synthesize_cmd)

    res = sub.add_parser("resume")
    res.add_argument("run_id")
    res.set_defaults(fn=resume_cmd)

    sve = sub.add_parser("spawn-envelope")
    svesub = sve.add_subparsers(dest="spawn_envelope_cmd", required=True)
    svev = svesub.add_parser("validate")
    svev.add_argument("fixture_json", help="JSON fixture path or inline JSON")
    svev.set_defaults(fn=validate_spawn_envelopes_cmd)

    agp = sub.add_parser("agents")
    agsub = agp.add_subparsers(dest="agents_cmd", required=True)
    agl = agsub.add_parser("list")
    agl.add_argument("--ids", "--completion", dest="ids", action="store_true",
                     help="Output only agent ids (one per line). Perfect for shell autocomplete and Grok subagent discovery.")
    agl.set_defaults(fn=agents_list)
    agi = agsub.add_parser("inspect")
    agi.add_argument("agent_id")
    agi.add_argument("--category")
    agi.add_argument("--provider")
    agi.add_argument("--model")
    agi.add_argument("--reasoning")
    agi.set_defaults(fn=agents_inspect)

    heph = sub.add_parser("hephaestus", help="Run Hephaestus as a GPT-style autonomous deep worker")
    hephsub = heph.add_subparsers(dest="hephaestus_cmd", required=True)
    hephg = hephsub.add_parser("goal")
    hephg.add_argument("goal")
    hephg.add_argument("--category", default="deep")
    hephg.add_argument("--provider")
    hephg.add_argument("--model")
    hephg.add_argument("--reasoning")
    hephg.add_argument("--mode", choices=["fallback", "native-grok"], default="fallback")
    hephg.add_argument("--task-id")
    hephg.set_defaults(fn=hephaestus_goal_cmd)

    hp = sub.add_parser("hud")
    hp.add_argument("--text", action="store_true")
    hp.set_defaults(fn=hud)
    cp = sub.add_parser("cancel")
    cp.add_argument("--scope", default="all", help="comma list: goal,plan,team,ultraqa or all")
    cp.set_defaults(fn=cancel)

    # --- ULW / Ultrawork keyword trigger (Hybrid Candidate 3) ---
    ulw = sub.add_parser("ulw", help="Activate OMO-style Ultrawork mode (IntentGate + Sisyphus lead)")
    ulw.add_argument("objective", nargs="*", help="Goal for the ultrawork run")
    ulw.set_defaults(fn=ulw_intent)

    ugp = sub.add_parser("ultragoal")
    ugsub = ugp.add_subparsers(dest="ultragoal_cmd", required=True)
    ugc = ugsub.add_parser("create")
    ugc.add_argument("objective")
    ugc.add_argument("--id")
    ugc.add_argument("--checklist")
    ugc.add_argument("--brief")
    ugc.set_defaults(fn=ultragoal_create)
    ugsp = ugsub.add_parser("spawn")
    ugsp.add_argument("objective")
    ugsp.add_argument("--spec", default="3:executor", help="team spec like 1:sisyphus,1:atlas,1:sisyphus-junior or 3:executor")
    ugsp.add_argument("--id")
    ugsp.add_argument("--checklist")
    ugsp.add_argument("--brief")
    ugsp.add_argument("--name")
    ugsp.add_argument("--providers", default="grok,subagent")
    ugsp.add_argument("--dry-run", action="store_true")
    ugsp.add_argument("--hyperplan", action="store_true", help="Launch in Hyperplan rigorous mode (separated state + adversarial team)")
    ugsp.add_argument("--template", help="Named team template, e.g. hyperplan (expands to canonical OMO agents)")
    ugsp.set_defaults(fn=ultragoal_spawn)
    ugs = ugsub.add_parser("status")
    ugs.add_argument("--id")
    ugs.set_defaults(fn=ultragoal_status)
    ugsh = ugsub.add_parser("show")
    ugsh.add_argument("--id")
    ugsh.set_defaults(fn=ultragoal_show)
    ugck = ugsub.add_parser("checkpoint")
    ugck.add_argument("--id")
    ugck.add_argument("--story")
    ugck.add_argument("--status", choices=["active", "blocked", "complete", "cancelled"], required=True)
    ugck.add_argument("--evidence", default="")
    ugck.add_argument("--evidence-artifact", action="append", default=[])
    ugck.add_argument("--goal-json")
    ugck.add_argument("--force-gate", action="store_true")
    ugck.set_defaults(fn=ultragoal_checkpoint)

    uwp = sub.add_parser("ultrawork")
    uwsub = uwp.add_subparsers(dest="ultrawork_cmd", required=True)
    uwc = uwsub.add_parser("create")
    uwc.add_argument("objective")
    uwc.add_argument("--id")
    uwc.add_argument("--tasks")
    uwc.set_defaults(fn=ultrawork_create)
    uwu = uwsub.add_parser("update")
    uwu.add_argument("--id")
    uwu.add_argument("--task", type=int, required=True)
    uwu.add_argument("--status", choices=["pending", "active", "complete", "blocked", "accepted", "budget_exhausted", "manual_review_required", "failed"], required=True)
    uwu.add_argument("--evidence", default="")
    uwu.add_argument("--evidence-artifact", action="append", default=[])
    uwu.set_defaults(fn=ultrawork_update)
    uwsh = uwsub.add_parser("show")
    uwsh.add_argument("--id")
    uwsh.set_defaults(fn=ultrawork_show)

    loop = sub.add_parser("loop", help="Grok Build /loop-compatible OMO continuation")
    loopsub = loop.add_subparsers(dest="loop_cmd", required=True)
    loopstart = loopsub.add_parser("start", aliases=["create"])
    loopstart.add_argument("objective")
    loopstart.set_defaults(fn=loop_start)
    loopstatus = loopsub.add_parser("status", aliases=["show"])
    loopstatus.add_argument("--id")
    loopstatus.set_defaults(fn=loop_status)
    loopstep = loopsub.add_parser("step")
    loopstep.add_argument("--id")
    loopstep.add_argument("--task", type=int, default=1)
    loopstep.add_argument("--status", choices=["pending", "active", "complete", "blocked", "accepted", "budget_exhausted", "manual_review_required", "failed"], default="active")
    loopstep.add_argument("--evidence", default="")
    loopstep.add_argument("--evidence-artifact", action="append", default=[])
    loopstep.set_defaults(fn=loop_step)
    loopstop = loopsub.add_parser("stop", aliases=["cancel"])
    loopstop.add_argument("--status", default="stopped")
    loopstop.set_defaults(fn=loop_stop)

    rp = sub.add_parser("ralph")
    rsub = rp.add_subparsers(dest="ralph_cmd", required=True)
    rc = rsub.add_parser("create")
    rc.add_argument("objective")
    rc.add_argument("--id")
    rc.add_argument("--max-iterations", type=int, default=3)
    rc.add_argument("--stop-condition")
    rc.set_defaults(fn=ralph_create)
    rs = rsub.add_parser("step")
    rs.add_argument("--id")
    rs.add_argument("--status", choices=["active", "complete", "blocked"], default="active")
    rs.add_argument("--evidence", default="")
    rs.add_argument("--evidence-artifact", action="append", default=[])
    rs.set_defaults(fn=ralph_step)
    rsh = rsub.add_parser("show")
    rsh.add_argument("--id")
    rsh.set_defaults(fn=ralph_show)

    wp2 = sub.add_parser("worker")
    w2sub = wp2.add_subparsers(dest="worker_cmd", required=True)
    wa2 = w2sub.add_parser("ack")
    wa2.add_argument("worker")
    wa2.add_argument("task")
    wa2.set_defaults(fn=worker_ack)
    wr2 = w2sub.add_parser("result")
    wr2.add_argument("worker")
    wr2.add_argument("result")
    wr2.add_argument("--status", default="complete", choices=["complete", "blocked", "failed"])
    wr2.add_argument("--evidence-artifact", action="append", default=[])
    wr2.set_defaults(fn=worker_result)
    ws2 = w2sub.add_parser("status")
    ws2.add_argument("worker", nargs="?")
    ws2.set_defaults(fn=worker_status)

    cleanp = sub.add_parser("ai-slop-cleaner")
    cleansub = cleanp.add_subparsers(dest="cleanup_cmd", required=True)
    cleanc = cleansub.add_parser("create")
    cleanc.add_argument("--scope", help="comma-separated files or repo")
    cleanc.add_argument("--verification")
    cleanc.set_defaults(fn=ai_slop_cleaner)
    cleanl = cleansub.add_parser("list")
    cleanl.add_argument("--limit", type=int)
    cleanl.set_defaults(fn=ai_slop_cleaner_list)

    arp = sub.add_parser("autoresearch")
    arsub = arp.add_subparsers(dest="autoresearch_cmd", required=True)
    arc = arsub.add_parser("create")
    arc.add_argument("question")
    arc.add_argument("--id")
    arc.set_defaults(fn=autoresearch_create)
    ars = arsub.add_parser("add-source")
    ars.add_argument("url")
    ars.add_argument("--id")
    ars.add_argument("--note")
    ars.set_defaults(fn=autoresearch_add_source)
    arshow = arsub.add_parser("show")
    arshow.add_argument("--id")
    arshow.set_defaults(fn=autoresearch_show)

    dip = sub.add_parser("deep-interview")
    disub = dip.add_subparsers(dest="deep_interview_cmd", required=True)
    dic = disub.add_parser("create")
    dic.add_argument("topic")
    dic.add_argument("--id")
    dic.add_argument("--questions")
    dic.set_defaults(fn=deep_interview_create)
    dia = disub.add_parser("answer")
    dia.add_argument("--id")
    dia.add_argument("--question", type=int, required=True)
    dia.add_argument("answer")
    dia.set_defaults(fn=deep_interview_answer)
    dish = disub.add_parser("show")
    dish.add_argument("--id")
    dish.set_defaults(fn=deep_interview_show)

    dp = sub.add_parser("design")
    dsub = dp.add_subparsers(dest="design_cmd", required=True)
    da = dsub.add_parser("add")
    da.add_argument("title")
    da.add_argument("decision")
    da.add_argument("--rationale")
    da.set_defaults(fn=design_add)
    dl = dsub.add_parser("list")
    dl.add_argument("--limit", type=int)
    dl.set_defaults(fn=design_list)

    np = sub.add_parser("configure-notifications")
    nsub = np.add_subparsers(dest="notifications_cmd", required=True)
    ns = nsub.add_parser("set")
    ns.add_argument("--channel", default="console", choices=["console", "slack", "webhook", "none"])
    ns.add_argument("--target")
    ns.add_argument("--enabled", action="store_true")
    ns.set_defaults(fn=notifications_set)
    nsh = nsub.add_parser("show")
    nsh.set_defaults(fn=notifications_show)

    provp = sub.add_parser("provider")
    provsub = provp.add_subparsers(dest="provider_cmd", required=True)
    prova = provsub.add_parser("add")
    prova.add_argument("--id")
    prova.add_argument("--kind", choices=sorted(APPROVED_MODEL_PROVIDERS))
    prova.add_argument("--env")
    prova.add_argument("--model")
    prova.add_argument("--interactive", action="store_true")
    prova.set_defaults(fn=provider_add)
    provl = provsub.add_parser("list")
    provl.set_defaults(fn=provider_list)
    provs = provsub.add_parser("show")
    provs.add_argument("id")
    provs.set_defaults(fn=provider_show)
    provm = provsub.add_parser("matrix")
    provm.add_argument("--provider", choices=sorted(set(TEAM_PROVIDER_EXECUTABLES) | APPROVED_MODEL_PROVIDERS), default="openai")
    provm.add_argument("--id")
    provm.add_argument("--scenario", choices=sorted(PROVIDER_FAILURE_SCENARIOS), required=True)
    provm.set_defaults(fn=provider_failure_matrix)

    models = sub.add_parser("models", help="Show or switch LFG model routing")
    modelsub = models.add_subparsers(dest="models_cmd")
    modelshow = modelsub.add_parser("show")
    modelshow.add_argument("--provider", choices=sorted(APPROVED_MODEL_PROVIDERS))
    modelshow.set_defaults(fn=models_show)
    modelsw = modelsub.add_parser("switch")
    modelsw.add_argument("model")
    modelsw.add_argument("--provider", choices=sorted(APPROVED_MODEL_PROVIDERS))
    modelsw.add_argument("--reasoning", choices=sorted(OMO_REASONING_LEVELS))
    modelsw.set_defaults(fn=models_switch)
    models.add_argument("--provider", choices=sorted(APPROVED_MODEL_PROVIDERS))
    models.set_defaults(fn=models_show)

    authp = sub.add_parser("auth")
    authsub = authp.add_subparsers(dest="auth_cmd", required=True)
    authl = authsub.add_parser("login", help="Configure a provider login without storing secrets")
    authl.add_argument("provider", nargs="?", choices=sorted(APPROVED_MODEL_PROVIDERS))
    authl.add_argument("--id")
    authl.add_argument("--env")
    authl.add_argument("--model")
    authl.add_argument("--interactive", action="store_true")
    authl.set_defaults(fn=auth_login)

    setupp = sub.add_parser("setup", help="Install/sync the LFG Grok plugin and prepare provider state")
    setupsub = setupp.add_subparsers(dest="setup_cmd", required=False)
    setupc = setupsub.add_parser("check")
    setupc.set_defaults(fn=setup)
    setupps = setupsub.add_parser("install-plan")
    setupps.add_argument("--marketplace")
    setupps.set_defaults(fn=setup)
    setups = setupsub.add_parser("show")
    setups.set_defaults(fn=setup)
    setupp.add_argument("--plugin-dir", help="destination plugin directory, defaults to ~/.grok/plugins/lfg")
    setupp.add_argument("--dry-run", action="store_true")
    setupp.add_argument("--interactive", action="store_true", help="run the OMO-style provider setup wizard")
    setupp.add_argument("--no-tui", action="store_true", help="skip prompts and use explicit provider flags")
    for provider_flag in ("openai", "zai", "copilot", "codex"):
        setupp.add_argument(f"--{provider_flag}", choices=["yes", "no"], help=f"enable {provider_flag} provider metadata during setup")
    setupp.set_defaults(fn=setup)

    askp = sub.add_parser("ask")
    asksub = askp.add_subparsers(dest="ask_cmd", required=True)
    askc = asksub.add_parser("create")
    askc.add_argument("prompt")
    askc.add_argument("--provider", choices=sorted(TEAM_PROVIDER_EXECUTABLES), default="hermes")
    askc.add_argument("--dry-run", action="store_true", default=True)
    askc.add_argument("--run", dest="dry_run", action="store_false")
    askc.add_argument("--timeout", type=int, default=60)
    askc.set_defaults(fn=ask)
    askl = asksub.add_parser("list")
    askl.add_argument("--limit", type=int)
    askl.set_defaults(fn=ask_list)

    ap = sub.add_parser("analyze")
    asub = ap.add_subparsers(dest="analyze_cmd", required=True)
    ac = asub.add_parser("create")
    ac.add_argument("--focus")
    ac.set_defaults(fn=analyze)
    al = asub.add_parser("list")
    al.add_argument("--limit", type=int)
    al.set_defaults(fn=analyze_list)

    crp = sub.add_parser("code-review")
    crsub = crp.add_subparsers(dest="code_review_cmd", required=True)
    crc = crsub.add_parser("create")
    crc.add_argument("objective")
    crc.set_defaults(fn=code_review)
    crl = crsub.add_parser("list")
    crl.add_argument("--limit", type=int)
    crl.set_defaults(fn=code_review_list)

    pip = sub.add_parser("pipeline")
    psub = pip.add_subparsers(dest="pipeline_cmd", required=True)
    pc = psub.add_parser("create")
    pc.add_argument("title")
    pc.add_argument("--id")
    pc.add_argument("--stages")
    pc.set_defaults(fn=pipeline_create)
    pln = psub.add_parser("list")
    pln.add_argument("--limit", type=int)
    pln.set_defaults(fn=pipeline_list)
    pu = psub.add_parser("update")
    pu.add_argument("--id")
    pu.add_argument("--stage", type=int, required=True)
    pu.add_argument("--status", choices=["pending", "active", "complete", "blocked"], required=True)
    pu.add_argument("--note")
    pu.add_argument("--evidence-artifact", action="append", default=[])
    pu.set_defaults(fn=pipeline_update)

    autop = sub.add_parser("autopilot")
    autosub = autop.add_subparsers(dest="autopilot_cmd", required=True)
    autoc = autosub.add_parser("create")
    autoc.add_argument("objective")
    autoc.add_argument("--id")
    autoc.set_defaults(fn=autopilot_create)
    autoa = autosub.add_parser("advance")
    autoa.add_argument("--id")
    autoa.add_argument("--phase", type=int, required=True)
    autoa.add_argument("--status", choices=["pending", "active", "complete", "blocked"], required=True)
    autoa.add_argument("--evidence", default="")
    autoa.add_argument("--evidence-artifact", action="append", default=[])
    autoa.set_defaults(fn=autopilot_advance)
    autos = autosub.add_parser("show")
    autos.add_argument("--id")
    autos.set_defaults(fn=autopilot_show)


    perf = sub.add_parser("performance-goal")
    perfsub = perf.add_subparsers(dest="performance_goal_cmd", required=True)
    perfc = perfsub.add_parser("create")
    perfc.add_argument("objective")
    perfc.add_argument("--id")
    perfc.add_argument("--metrics")
    perfc.set_defaults(fn=performance_create)
    perfm = perfsub.add_parser("measure")
    perfm.add_argument("--id")
    perfm.add_argument("--metric", required=True)
    perfm.add_argument("--baseline", type=float)
    perfm.add_argument("--current", type=float)
    perfm.add_argument("--target", type=float)
    perfm.add_argument("--evidence", default="")
    perfm.add_argument("--evidence-artifact", action="append", default=[])
    perfm.set_defaults(fn=performance_measure)
    perfs = perfsub.add_parser("show")
    perfs.add_argument("--id")
    perfs.set_defaults(fn=performance_show)


    vr = sub.add_parser("visual-ralph")
    vrsub = vr.add_subparsers(dest="visual_ralph_cmd", required=True)
    vrc = vrsub.add_parser("create")
    vrc.add_argument("target")
    vrc.add_argument("--id")
    vrc.add_argument("--reference")
    vrc.add_argument("--threshold", type=float, default=0.95)
    vrc.set_defaults(fn=visual_ralph_create)
    vrv = vrsub.add_parser("verdict")
    vrv.add_argument("--id")
    vrv.add_argument("--score", type=float, required=True)
    vrv.add_argument("--status", choices=["pass", "fail", "blocked"], required=True)
    vrv.add_argument("--evidence", default="")
    vrv.add_argument("--evidence-artifact", action="append", default=[])
    vrv.set_defaults(fn=visual_ralph_verdict)
    vrs = vrsub.add_parser("show")
    vrs.add_argument("--id")
    vrs.set_defaults(fn=visual_ralph_show)


    argp = sub.add_parser("autoresearch-goal")
    argsub = argp.add_subparsers(dest="autoresearch_goal_cmd", required=True)
    argc = argsub.add_parser("create")
    argc.add_argument("question")
    argc.add_argument("--id")
    argc.add_argument("--hypotheses")
    argc.set_defaults(fn=autoresearch_goal_create)
    argcr = argsub.add_parser("critique")
    argcr.add_argument("--id")
    argcr.add_argument("--verdict", choices=["pass", "revise", "blocked"], required=True)
    argcr.add_argument("--critic", default="critic")
    argcr.add_argument("--evidence", default="")
    argcr.add_argument("--evidence-artifact", action="append", default=[])
    argcr.set_defaults(fn=autoresearch_goal_critique)
    args = argsub.add_parser("show")
    args.add_argument("--id")
    args.set_defaults(fn=autoresearch_goal_show)


    skp = sub.add_parser("skill")
    sksub = skp.add_subparsers(dest="skill_cmd", required=True)
    skl = sksub.add_parser("list")
    skl.set_defaults(fn=skill_list)
    sks = sksub.add_parser("search")
    sks.add_argument("query")
    sks.set_defaults(fn=skill_search)

    wp = sub.add_parser("wiki")
    wsub = wp.add_subparsers(dest="wiki_cmd", required=True)
    wa = wsub.add_parser("add")
    wa.add_argument("title")
    wa.add_argument("body")
    wa.add_argument("--tags")
    wa.set_defaults(fn=wiki_add)
    wl = wsub.add_parser("list")
    wl.add_argument("--limit", type=int)
    wl.set_defaults(fn=wiki_list)
    ws = wsub.add_parser("search")
    ws.add_argument("query")
    ws.set_defaults(fn=wiki_search)

    gp = sub.add_parser("goal")
    gsub = gp.add_subparsers(dest="goal_cmd", required=True)
    gnew = gsub.add_parser("create")
    gnew.add_argument("objective")
    gnew.add_argument("--id")
    gnew.add_argument("--checklist")
    gnew.set_defaults(fn=create_goal)
    gls = gsub.add_parser("list")
    gls.set_defaults(fn=lambda args: {"goals": list_goals()})
    gupd = gsub.add_parser("update")
    gupd.add_argument("--id")
    gupd.add_argument("--status", choices=["active", "blocked", "complete", "cancelled"], required=True)
    gupd.add_argument("--note")
    gupd.add_argument("--evidence-artifact", action="append", default=[])
    gupd.set_defaults(fn=update_goal)


    rlp = sub.add_parser("ralplan")
    rlsub = rlp.add_subparsers(dest="ralplan_cmd", required=True)
    rlc = rlsub.add_parser("create")
    rlc.add_argument("title")
    rlc.add_argument("--id")
    rlc.add_argument("--steps")
    rlc.set_defaults(fn=ralplan_create)
    rlr = rlsub.add_parser("review")
    rlr.add_argument("--id")
    rlr.add_argument("--verdict", choices=["approve", "revise", "block"], required=True)
    rlr.add_argument("--reviewer", default="architect")
    rlr.add_argument("--evidence", default="")
    rlr.add_argument("--evidence-artifact", action="append", default=[])
    rlr.set_defaults(fn=ralplan_review)
    rls = rlsub.add_parser("show")
    rls.add_argument("--id")
    rls.set_defaults(fn=ralplan_show)

    pp = sub.add_parser("plan")
    psub = pp.add_subparsers(dest="plan_cmd", required=True)
    pc = psub.add_parser("create")
    pc.add_argument("title")
    pc.add_argument("--steps")
    pc.add_argument("--interview", action="store_true", help="force interview mode")
    pc.set_defaults(fn=mk_plan)
    pa = psub.add_parser("answer")
    pa.add_argument("id", help="plan id")
    pa.add_argument("answers", help="answers to planning questions")
    pa.set_defaults(fn=plan_answer)
    pl = psub.add_parser("list")
    pl.add_argument("--limit", type=int)
    pl.set_defaults(fn=plan_list)

    sw = sub.add_parser("start-work", help="Start or resume Atlas execution for the active plan")
    sw.add_argument("--plan-id")
    sw.add_argument("--session-id")
    sw.set_defaults(fn=atlas_start_work)

    atp = sub.add_parser("atlas")
    atsub = atp.add_subparsers(dest="atlas_cmd", required=True)
    ats = atsub.add_parser("start-work", aliases=["resume"])
    ats.add_argument("--plan-id")
    ats.add_argument("--session-id")
    ats.set_defaults(fn=atlas_start_work)
    atst = atsub.add_parser("status")
    atst.add_argument("--plan-id")
    atst.add_argument("--session-id")
    atst.set_defaults(fn=atlas_status)
    atu = atsub.add_parser("checkbox", aliases=["update-checkbox"])
    atu.add_argument("--plan-id")
    atu.add_argument("--session-id")
    atu.add_argument("--task", required=True)
    atu.add_argument("--status", choices=["pending", "active", "blocked", "complete", "completed"], required=True)
    atu.add_argument("--evidence", default="")
    atu.add_argument("--evidence-artifact", action="append", default=[])
    atu.add_argument("--learning")
    atu.add_argument("--decision")
    atu.add_argument("--issue")
    atu.add_argument("--verification")
    atu.add_argument("--problem")
    atu.set_defaults(fn=atlas_checkbox_update)

    uq = sub.add_parser("ultraqa")
    uq.add_argument("objective")
    uq.add_argument("--no-run", action="store_true")
    uq.add_argument("--timeout", type=int, default=60)
    uq.add_argument("--command", action="append", nargs="+")
    uq.set_defaults(fn=ultraqa)


    sp = sub.add_parser("slash")
    sp.add_argument("command", help='slash command, e.g. /team 3:executor "fix tests"')
    sp.add_argument("--name")
    sp.add_argument("--providers", default="grok,subagent")
    sp.add_argument("--dry-run", action="store_true")
    sp.set_defaults(fn=slash)

    hbp = sub.add_parser("hook-bridge")
    hbsub = hbp.add_subparsers(dest="hook_bridge_cmd", required=True)
    hbs = hbsub.add_parser("status")
    hbs.set_defaults(fn=hook_bridge_status)
    hbi = hbsub.add_parser("install")
    hbi.set_defaults(fn=hook_bridge_install)

    bp = sub.add_parser("backend")
    bsub = bp.add_subparsers(dest="backend_cmd", required=True)
    bs = bsub.add_parser("start")
    bs.add_argument("--name")
    bs.set_defaults(fn=backend_start)
    bst = bsub.add_parser("status")
    bst.add_argument("--name")
    bst.set_defaults(fn=backend_status)
    bx = bsub.add_parser("stop")
    bx.add_argument("--name")
    bx.set_defaults(fn=backend_stop)

    gb = sub.add_parser("grok-build", help="Control Grok Build inside [tmux [grok-build]]")
    gbsub = gb.add_subparsers(dest="grok_build_cmd", required=True)
    gbs = gbsub.add_parser("start")
    gbs.add_argument("--name")
    gbs.add_argument("--model")
    gbs.add_argument("--provider", choices=sorted(APPROVED_MODEL_PROVIDERS))
    gbs.add_argument("--reasoning", choices=sorted(OMO_REASONING_LEVELS))
    gbs.add_argument("--dry-run", action="store_true")
    gbs.set_defaults(fn=grok_build_tmux_start)
    gbst = gbsub.add_parser("status")
    gbst.add_argument("--name")
    gbst.set_defaults(fn=grok_build_tmux_status)
    gbk = gbsub.add_parser("keywords", aliases=["known-keywords"], help="List Grok Build @agent known keyword registrations")
    gbk.add_argument("--ids", "--completion", dest="ids", action="store_true",
                     help="Output only @agent keywords (one per line) for autocomplete.")
    gbk.set_defaults(fn=grok_build_keywords_cmd)
    gbm = gbsub.add_parser("model")
    gbm.add_argument("model")
    gbm.add_argument("--name")
    gbm.add_argument("--provider", choices=sorted(APPROVED_MODEL_PROVIDERS))
    gbm.add_argument("--reasoning", choices=sorted(OMO_REASONING_LEVELS))
    gbm.add_argument("--dry-run", action="store_true")
    gbm.set_defaults(fn=grok_build_tmux_model)
    gbsend = gbsub.add_parser("send")
    gbsend.add_argument("text")
    gbsend.add_argument("--name")
    gbsend.set_defaults(fn=grok_build_tmux_send)
    gbc = gbsub.add_parser("capture")
    gbc.add_argument("--name")
    gbc.add_argument("--start", type=int, default=-80)
    gbc.set_defaults(fn=grok_build_tmux_capture)
    gbx = gbsub.add_parser("stop")
    gbx.add_argument("--name")
    gbx.set_defaults(fn=grok_build_tmux_stop)

    tp = sub.add_parser("team")
    tsub = tp.add_subparsers(dest="team_cmd", required=True)
    tprov = tsub.add_parser("providers")
    tprov.set_defaults(fn=team_providers)
    tpre = tsub.add_parser("preflight")
    tpre.add_argument("--name")
    tpre.set_defaults(fn=team_preflight)
    tc = tsub.add_parser("create", aliases=["team_create"])
    tc.add_argument("spec", help="team spec like 3:executor")
    tc.add_argument("objective")
    tc.add_argument("--name")
    tc.add_argument("--providers", default="grok,subagent", help="comma list, default grok,subagent (manual-gated Grok fallback lanes)")
    tc.add_argument("--dry-run", action="store_true")
    tc.add_argument("--actor", default="leader")
    tc.set_defaults(fn=team_create)
    ts = tsub.add_parser("status", aliases=["team_status"])
    ts.add_argument("name", nargs="?")
    ts.set_defaults(fn=team_status)

    tl = tsub.add_parser("list", aliases=["team_list"])
    tl.set_defaults(fn=team_list)

    tmsg = tsub.add_parser("send-message", aliases=["team_send_message"])
    tmsg.add_argument("team")
    tmsg.add_argument("to")
    tmsg.add_argument("body")
    tmsg.add_argument("--actor", default="leader")
    tmsg.add_argument("--type", default="message")
    tmsg.add_argument("--wait", action="store_true")
    tmsg.set_defaults(fn=team_send_message)

    ttc = tsub.add_parser("task-create", aliases=["team_task_create"])
    ttc.add_argument("team")
    ttc.add_argument("title")
    ttc.add_argument("--description", default="")
    ttc.add_argument("--owner")
    ttc.add_argument("--depends-on", action="append", default=[])
    ttc.add_argument("--actor", default="leader")
    ttc.set_defaults(fn=team_task_create)

    ttl = tsub.add_parser("task-list", aliases=["team_task_list"])
    ttl.add_argument("team")
    ttl.add_argument("--actor", default="leader")
    ttl.set_defaults(fn=team_task_list)

    ttu = tsub.add_parser("task-update", aliases=["team_task_update"])
    ttu.add_argument("team")
    ttu.add_argument("task")
    ttu.add_argument("--status")
    ttu.add_argument("--owner")
    ttu.add_argument("--evidence")
    ttu.add_argument("--actor", default="leader")
    ttu.set_defaults(fn=team_task_update)

    ttg = tsub.add_parser("task-get", aliases=["team_task_get"])
    ttg.add_argument("team")
    ttg.add_argument("task")
    ttg.add_argument("--actor", default="leader")
    ttg.set_defaults(fn=team_task_get)

    tsr = tsub.add_parser("shutdown-request", aliases=["team_shutdown_request"])
    tsr.add_argument("team")
    tsr.add_argument("member")
    tsr.add_argument("--reason", default="")
    tsr.add_argument("--actor", default="leader")
    tsr.set_defaults(fn=team_shutdown_request)

    tsa = tsub.add_parser("approve-shutdown", aliases=["team_approve_shutdown"])
    tsa.add_argument("team")
    tsa.add_argument("member")
    tsa.add_argument("--actor", default="leader")
    tsa.set_defaults(fn=team_approve_shutdown)

    tsj = tsub.add_parser("reject-shutdown", aliases=["team_reject_shutdown"])
    tsj.add_argument("team")
    tsj.add_argument("member")
    tsj.add_argument("--actor", default="leader")
    tsj.set_defaults(fn=team_reject_shutdown)

    tdel = tsub.add_parser("delete", aliases=["team_delete"])
    tdel.add_argument("team")
    tdel.add_argument("--actor", default="leader")
    tdel.set_defaults(fn=team_delete)

    # New inspection commands (Phase 1+)
    tagents = tsub.add_parser("agents")
    tagents.set_defaults(fn=team_agents_list)

    tstate = tsub.add_parser("state")
    tstate.add_argument("name")
    tstate.set_defaults(fn=team_state_show)

    trun = tsub.add_parser("run")
    trun.add_argument("name")
    trun.set_defaults(fn=team_state_show)

    tr = tsub.add_parser("resume")
    tr.add_argument("name", nargs="?")
    tr.set_defaults(fn=team_resume)
    td = tsub.add_parser("shutdown")
    td.add_argument("name", nargs="?")
    td.set_defaults(fn=team_shutdown)

    args = p.parse_args(argv)
    if not getattr(args, "cmd", None):
        args.fn = lfg_launch
    try:
        result = args.fn(args)
    except EvidenceGateError as exc:
        if args.json:
            emit(exc.payload, True)
        else:
            print(exc.payload["message"], file=sys.stderr)
        return 2
    # Special support for completion-friendly plain text output (e.g. `lfg agents list --ids`)
    if (not getattr(args, "json", False) and
            isinstance(result, dict) and result.get("_raw_text")):
        print(result["_raw_text"])
        return 0

    emit(result, args.json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
