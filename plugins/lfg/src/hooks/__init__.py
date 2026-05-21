# ruff: noqa: E402  # dynamic imports after sys.path bootstrap for spec_from_file_location
from __future__ import annotations

import pathlib
import sys

_HOOKS_DIR = pathlib.Path(__file__).resolve().parent
if str(_HOOKS_DIR) not in sys.path:
    sys.path.insert(0, str(_HOOKS_DIR))

# Tier registry and OMO 5-tier public API surface (Session, Tool Guard, Transform, Continuation, Skill)
# Use absolute import style matching other hook modules (sys.path bootstrap in each)
from tiers import (
    HOOK_TIERS,
    get_omo_origin,
    get_tier_for_event,
    get_tier_modules,
    get_tier_name,
    list_hook_tiers,
)

# Core hook modules (re-exported for backward compat and LFG public surface)
from ambiguity_gate import compute_heuristic_ambiguity
from boulder_persistence import persist_boulder_from_payload
from compaction_protection import build_compaction_protection_injection
from dispatch_gate import reserve_continuation_dispatch
from injection import build_aggressive_injection, write_injection_artifacts
from payload import extract_user_prompt_from_payload
from run_discovery import find_active_runs
from snapshot import get_goal_snapshot
from state_io import boulder_path, load_current_ultragoal, read_boulder, read_json, safe_child_path, validate_safe_id, write_boulder
from task_helpers import evidence_identity, message_is_evidence, progress_evidence_fingerprint, task_is_pending
from todo_continuation import incomplete_todo_items, todo_continuation_reminder


__all__ = [
    # Tier API (new public surface for OMO parity)
    "HOOK_TIERS",
    "get_omo_origin",
    "get_tier_for_event",
    "get_tier_modules",
    "get_tier_name",
    "list_hook_tiers",
    # Existing core exports (unchanged behavior)
    "boulder_path",
    "build_aggressive_injection",
    "build_compaction_protection_injection",
    "compute_heuristic_ambiguity",
    "evidence_identity",
    "extract_user_prompt_from_payload",
    "find_active_runs",
    "get_goal_snapshot",
    "incomplete_todo_items",
    "load_current_ultragoal",
    "message_is_evidence",
    "persist_boulder_from_payload",
    "progress_evidence_fingerprint",
    "read_boulder",
    "read_json",
    "reserve_continuation_dispatch",
    "safe_child_path",
    "task_is_pending",
    "todo_continuation_reminder",
    "validate_safe_id",
    "write_boulder",
    "write_injection_artifacts",
]
