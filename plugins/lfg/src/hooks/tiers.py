from __future__ import annotations

from typing import Any, Dict, List


# OMO 5-Tier Hook System (Session, Tool Guard, Transform, Continuation, Skill)
# Ported for LFG Python runtime parity. Each tier maps current modular hooks
# and defines the events they activate on. This registry enables tiered
# composition in goal_harness and future per-agent hook constraints.

HOOK_TIERS: Dict[int, Dict[str, Any]] = {
    1: {
        "name": "Session",
        "description": "Session lifecycle hooks: start/end, notification, initial state snapshot and audit logging.",
        "modules": ["paths", "state_io", "snapshot", "run_discovery", "payload", "bridge_runtime"],
        "events": ["SessionStart", "SessionEnd", "Notification"],
        "omo_origin": "Session tier (lifecycle + audit)",
    },
    2: {
        "name": "Tool Guard",
        "description": "Pre/post tool guards, failure handling, ambiguity detection, and dispatch validation.",
        "modules": ["dispatch_gate", "ambiguity_gate", "task_helpers"],
        "events": ["PreToolUse", "PostToolUse", "PostToolUseFailure"],
        "omo_origin": "Tool Guard tier (safety + eligibility)",
    },
    3: {
        "name": "Transform",
        "description": "Prompt/context transformation: aggressive injection, compaction protection, user prompt extraction.",
        "modules": ["injection", "compaction_protection", "payload"],
        "events": ["UserPromptSubmit", "PreCompact"],
        "omo_origin": "Transform tier (context rewriting)",
    },
    4: {
        "name": "Continuation",
        "description": "TODO continuation reminders, incomplete item tracking, dispatch gate reservation for manual recovery.",
        "modules": ["todo_continuation", "dispatch_gate", "boulder_persistence"],
        "events": ["UserPromptSubmit", "PostToolUse", "Stop", "PreCompact"],
        "omo_origin": "Continuation tier (never-stops enforcement)",
    },
    5: {
        "name": "Skill",
        "description": "Skill/agent-specific hooks: evidence, task helpers, per-agent behavioral constraints and eligibility.",
        "modules": ["task_helpers", "state_io", "boulder_persistence"],
        "events": ["*"],
        "omo_origin": "Skill tier (agent + skill registration)",
    },
}


def list_hook_tiers() -> List[Dict[str, Any]]:
    """Return list of all 5 tiers with full metadata for public API / MCP exposure."""
    return [
        {"tier": tier, **data} for tier, data in sorted(HOOK_TIERS.items())
    ]


def get_tier_modules(tier: int) -> List[str]:
    """Return module names belonging to a specific tier."""
    return HOOK_TIERS.get(tier, {}).get("modules", [])


def get_tier_for_event(event: str) -> List[int]:
    """Return tiers that activate for a given hook event (supports '*' wildcard)."""
    matching: List[int] = []
    for tier, data in HOOK_TIERS.items():
        events = data.get("events", [])
        if event in events or "*" in events:
            matching.append(tier)
    return sorted(set(matching))


def get_tier_name(tier: int) -> str:
    """Human-readable tier name."""
    return HOOK_TIERS.get(tier, {}).get("name", f"Tier {tier}")


def get_omo_origin(tier: int) -> str:
    """OMO source reference for the tier."""
    return HOOK_TIERS.get(tier, {}).get("omo_origin", "unknown")


__all__ = [
    "HOOK_TIERS",
    "list_hook_tiers",
    "get_tier_modules",
    "get_tier_for_event",
    "get_tier_name",
    "get_omo_origin",
]
