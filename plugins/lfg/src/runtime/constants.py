#!/usr/bin/env python3
"""Runtime constants for the dependency-free LFG CLI implementation."""

from __future__ import annotations

import os
import pathlib
from typing import Any

ROOT = pathlib.Path(os.environ.get("GROK_PLUGIN_ROOT") or pathlib.Path(__file__).resolve().parents[2])

DATA = pathlib.Path(os.environ.get("GROK_PLUGIN_DATA") or pathlib.Path.cwd() / ".lfg")
STATE_DIR = DATA / "state"
RUNS_DIR = DATA / "runs"
PLANS_DIR = DATA / "plans"
CATALOG_PATH = ROOT / "catalog" / "omo-skill-map.json"
STATE_SCHEMA_VERSION = 2
ATLAS_BOULDER_SCHEMA_VERSION = 2
MAILBOX_DELIVERY_TTL_SECONDS = 10 * 60
APPROVED_MODEL_PROVIDERS = {"openai", "xai", "grok", "codex", "copilot", "zai"}
DEFAULT_MODEL_PROVIDER = "openai"
MODEL_PROVIDER_ALIASES = {"grok": "xai", "github-copilot": "copilot", "zai-coding-plan": "zai"}
PROVIDER_DEFAULT_MODELS = {
    "openai": "openai/gpt-5.5",
    "xai": "xai/grok-4.3",
    "grok": "xai/grok-4.3",
    "codex": "openai-codex",
    "copilot": "github-copilot",
    "zai": "zai-coding-plan",
}
HEPHAESTUS_APPROVED_MODEL_PROFILES = (
    {"provider": "openai", "model": "openai/gpt-5.5", "reasoning": "medium"},
    {"provider": "copilot", "model": "github-copilot/gpt-5.5", "reasoning": "medium"},
)
ZAI_CODING_PLAN_BASE_URL = "https://api.z.ai/api/coding/paas/v4"
ZAI_GENERAL_BASE_URL = "https://api.z.ai/api/paas/v4"
ZAI_DEFAULT_MODEL = "glm-4.6"
GROK_ORACLE_REVIEW = {
    "required": True,
    "gate": "xai/grok",
    "provider": "xai",
    "model": "xai/grok-4.3",
    "variant": "high",
    "fallback_models": [],
    "role": "oracle",
    "strict": True,
    "mode": "local-smoke",
    "reviewKind": "static-local-schema",
    "realGrokJudgment": False,
    "status": "passed",
}
SPAWN_ENVELOPE_SCHEMA_VERSION = 1
SPAWN_ENVELOPE_STATUSES = {"completed", "blocked", "failed"}
SPAWN_ENVELOPE_MODES = {"native-grok", "fallback"}
SPAWN_ENVELOPE_EVIDENCE_CLASSES = {
    "dependency-free-smoke",
    "repo-native-integration",
    "real-grok-manual-gate",
}
COMPLETION_STATUSES = {"complete", "completed", "pass", "passed"}
EVIDENCE_ARTIFACT_KINDS = {"command-output", "trace", "envelope"}
TEAM_MODE_TOOL_NAMES = (
    "team_create",
    "team_delete",
    "team_shutdown_request",
    "team_approve_shutdown",
    "team_reject_shutdown",
    "team_send_message",
    "team_task_create",
    "team_task_list",
    "team_task_update",
    "team_task_get",
    "team_status",
    "team_list",
)
TEAM_MAX_MEMBERS = 8
TEAM_MAX_PARALLEL_WORKERS = 4
TEAM_MAX_MESSAGE_BYTES = 32 * 1024
TEAM_MAX_UNREAD_BYTES = 256 * 1024
TEAM_MAX_MESSAGES_PER_RUN = 10000
TEAM_MEMBER_BLOCKED_TOOLS = ("delegate-task", "team_create", "team_delete", "wait_for_reply", "sync_wait")
HYPERPLAN_REQUIRED_CRITIC_CATEGORIES = ("unspecified-low", "unspecified-high", "ultrabrain", "artistry")
HYPERPLAN_OPTIONAL_CRITIC_CATEGORIES = ("deep",)
HYPERPLAN_MAX_CRITICS = 5
HYPERPLAN_CRITIQUE_ROUNDS = ("independent-analysis", "cross-attack", "defend-refine")
HYPERPLAN_REVISION_ROUNDS = ("lead-revision", "final-tightening")
ATLAS_NOTEPAD_CATEGORIES = ("learnings", "decisions", "issues", "verification", "problems")


SETUP_PROVIDER_WIZARD = [
    {
        "flag": "openai",
        "kind": "openai",
        "id": "openai-main",
        "question": "Do you have OpenAI access for GPT-style execution/consultation lanes?",
        "default": True,
    },
    {"flag": "zai", "kind": "zai", "id": "zai-main", "question": "Do you have a Z.ai Coding Plan subscription?", "default": False},
    {"flag": "copilot", "kind": "copilot", "id": "copilot-main", "question": "Do you have a GitHub Copilot subscription?", "default": False},
    {"flag": "codex", "kind": "codex", "id": "codex-main", "question": "Do you have Codex CLI access for execution lanes?", "default": False},
]


TEAM_PROVIDER_EXECUTABLES = {
    "hermes": "hermes",
    "claude": "claude",
    "codex": "codex",
    "gemini": "gemini",
    "copilot": "copilot",
    "zai": None,
    "opencode": "opencode",
    "grok": None,
    "subagent": None,
    "noop": None,
}

DEEP_ROLES = {"architect", "consultant", "reviewer", "deep", "planner", "strategist", "designer"}

# --- LFG Named Agents (User-defined personas with ULW identity) ---

LFG_AGENTS_DIR = pathlib.Path.home() / ".grok" / "lfg" / "agents"


CANONICAL_OMO_AGENT_IDS = (
    "sisyphus",
    "hephaestus",
    "prometheus",
    "atlas",
    "oracle",
    "librarian",
    "explore",
    "multimodal-looker",
    "metis",
    "momus",
    "sisyphus-junior",
    "builtin-agents",
)

OMO_PRIMARY_AGENT_IDS = ("sisyphus", "hephaestus", "prometheus", "atlas")
OMO_ELIGIBLE_TEAM_MEMBER_IDS = ("sisyphus", "atlas", "sisyphus-junior")
OMO_CONDITIONAL_TEAM_MEMBER_IDS = ("hephaestus",)
OMO_HARD_REJECT_TEAM_MEMBER_IDS = (
    "prometheus",
    "oracle",
    "librarian",
    "explore",
    "multimodal-looker",
    "metis",
    "momus",
)
OMO_TEAM_ELIGIBILITY_REGISTRY = {
    "sisyphus": "eligible",
    "hephaestus": "conditional",
    "prometheus": "hard-reject",
    "atlas": "eligible",
    "oracle": "hard-reject",
    "librarian": "hard-reject",
    "explore": "hard-reject",
    "multimodal-looker": "hard-reject",
    "metis": "hard-reject",
    "momus": "hard-reject",
    "sisyphus-junior": "eligible",
    "builtin-agents": "policy-layer",
}


OMO_CATEGORY_MODEL_PROFILES: dict[str, dict[str, str]] = {
    "quick": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "low"},
    "unspecified-low": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "medium"},
    "unspecified-high": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "high"},
    "ultrabrain": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "high"},
    "artistry": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "high"},
    "deep": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "xhigh"},
    "writing": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "medium"},
    "visual-engineering": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "high"},
    "planning": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "high"},
    "policy": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "low"},
    "configuration": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "low"},
}

OMO_UPSTREAM_CATEGORY_NAMES = [
    "visual-engineering",
    "artistry",
    "ultrabrain",
    "deep",
    "quick",
    "unspecified-low",
    "unspecified-high",
    "writing",
    "quick-rust",
    "quick-zig",
    "git",
]
OMO_LFG_SUPPORTED_CATEGORY_NAMES = [
    "visual-engineering",
    "artistry",
    "ultrabrain",
    "deep",
    "quick",
    "unspecified-low",
    "unspecified-high",
    "writing",
]
OMO_CATEGORY_MIGRATION_NOTES = {
    "quick-rust": "quick-rust is an upstream OMO category but is not routed by LFG yet; use quick until the migration slice lands.",
    "quick-zig": "quick-zig is an upstream OMO category but is not routed by LFG yet; use quick until the migration slice lands.",
    "git": "git is an upstream OMO category but is not routed by LFG yet; use quick or planning until the migration slice lands.",
}
OMO_CATEGORY_ROUTE_BLOCKED_TOOLS = ["spawn", "spawn_wave", "dependency_graph", "team_create", "team_delete"]
OMO_CATEGORY_ROUTE_VERIFICATION_GATE = {
    "required": True,
    "gate": "dependency-free-smoke",
    "kind": "self-verify",
    "status": "required",
    "reason": "Sisyphus-Junior must verify bounded category work before handoff",
}


OMO_REASONING_LEVELS = {"low", "medium", "high", "xhigh"}
OMO_MODEL_MATCHING_SOURCE = "agent-model-matching.md:141-149,202-243,311-325 adapted through docs/reference.md:49-59 and T6 provider metadata boundaries"
OMO_RUNTIME_FALLBACK_POLICY = {
    "kind": "runtime-fallback",
    "source": "docs/reference.md:57-62",
    "status": "fallback_manual_gate",
    "trigger": "reactive recovery when native Grok sub-agent spawning is unavailable or execution fails",
    "separateFromProactiveSelection": True,
    "manualGateRequired": True,
}
BACKGROUND_CONCURRENCY_CONFIG = {
    "defaultConcurrency": 5,
    "keyedBy": "model/provider routing key per OMO orchestration.md:362-368",
    "providerConcurrency": {},
    "modelConcurrency": {},
    "honoredInDeterministicFixtures": True,
}
OMO_ROLE_FIT_POLICIES: dict[str, dict[str, Any]] = {
    "communicator": {
        "reason": (
            "communicator/orchestrator role: preserve OMO's instruction-following "
            "coordination semantics with Grok-first execution and approved optional lanes only"
        ),
        "fallbackChainSource": OMO_MODEL_MATCHING_SOURCE,
        "fallbackChain": [
            {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "high", "roleFit": "Grok-first orchestration default"},
            {"provider": "copilot", "model": "github-copilot/gpt-5.5", "reasoning": "medium", "roleFit": "optional non-Grok approved communicator lane"},
        ],
    },
    "dual-prompt": {
        "reason": "dual-prompt planner/checklist role: keep OMO's Claude/GPT prompt-family distinction while selecting a Grok-first high-reasoning profile",
        "fallbackChainSource": OMO_MODEL_MATCHING_SOURCE,
        "fallbackChain": [
            {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "high", "roleFit": "Grok-first strategic/checklist default"},
            {"provider": "copilot", "model": "github-copilot/gpt-5.5", "reasoning": "high", "roleFit": "optional non-Grok approved planning lane"},
        ],
    },
    "deep-specialist": {
        "reason": (
            "deep specialist role: match OMO's principle-driven autonomous coding semantics "
            "with approved GPT-style profiles; Hephaestus must not silently downgrade to "
            "cheap or utility models"
        ),
        "fallbackChainSource": OMO_MODEL_MATCHING_SOURCE,
        "fallbackChain": [
            {
                "provider": "openai",
                "model": "openai/gpt-5.5",
                "reasoning": "medium",
                "roleFit": "approved GPT-style autonomous deep-work lane through approved",
            },
            {"provider": "copilot", "model": "github-copilot/gpt-5.5", "reasoning": "medium", "roleFit": "approved Copilot GPT-style lane through approved"},
        ],
    },
    "visual-artistry": {
        "reason": (
            "visual/artistry role: preserve OMO's visual reasoning distinction with a high-reasoning Grok profile and approved bounded Z.ai consultation lane"
        ),
        "fallbackChainSource": OMO_MODEL_MATCHING_SOURCE,
        "fallbackChain": [
            {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "high", "roleFit": "Grok-first visual/design default"},
            {"provider": "zai", "model": "zai-coding-plan/glm-5", "reasoning": "medium", "roleFit": "optional non-Grok approved visual lane"},
        ],
    },
    "utility-runner": {
        "reason": "utility runner role: favor bounded fast search/retrieval semantics instead of upgrading every role to one deep profile",
        "fallbackChainSource": OMO_MODEL_MATCHING_SOURCE,
        "fallbackChain": [
            {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "low", "roleFit": "Grok-first lightweight utility default"},
            {"provider": "zai", "model": "zai-coding-plan/glm-5", "reasoning": "low", "roleFit": "optional non-Grok approved utility lane"},
        ],
    },
    "policy-layer": {
        "reason": "policy/configuration role: keep builtin-agents cheap and deterministic while exposing the model resolver contract",
        "fallbackChainSource": OMO_MODEL_MATCHING_SOURCE,
        "fallbackChain": [
            {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "low", "roleFit": "Grok-first policy resolver default"},
        ],
    },
}
OMO_AGENT_ROLE_FIT = {
    "sisyphus": "communicator",
    "sisyphus-junior": "communicator",
    "prometheus": "dual-prompt",
    "atlas": "dual-prompt",
    "hephaestus": "deep-specialist",
    "oracle": "deep-specialist",
    "metis": "dual-prompt",
    "momus": "deep-specialist",
    "explore": "utility-runner",
    "librarian": "utility-runner",
    "multimodal-looker": "visual-artistry",
    "builtin-agents": "policy-layer",
}
OMO_CATEGORY_ROLE_FIT = {
    "visual-engineering": "visual-artistry",
    "artistry": "visual-artistry",
    "ultrabrain": "deep-specialist",
    "deep": "deep-specialist",
    "quick": "utility-runner",
    "unspecified-high": "communicator",
    "unspecified-low": "communicator",
    "writing": "communicator",
    "planning": "dual-prompt",
    "policy": "policy-layer",
    "configuration": "policy-layer",
}


__all__ = (
    "ROOT",
    "DATA",
    "STATE_DIR",
    "RUNS_DIR",
    "PLANS_DIR",
    "CATALOG_PATH",
    "STATE_SCHEMA_VERSION",
    "ATLAS_BOULDER_SCHEMA_VERSION",
    "MAILBOX_DELIVERY_TTL_SECONDS",
    "APPROVED_MODEL_PROVIDERS",
    "DEFAULT_MODEL_PROVIDER",
    "MODEL_PROVIDER_ALIASES",
    "PROVIDER_DEFAULT_MODELS",
    "HEPHAESTUS_APPROVED_MODEL_PROFILES",
    "ZAI_CODING_PLAN_BASE_URL",
    "ZAI_GENERAL_BASE_URL",
    "ZAI_DEFAULT_MODEL",
    "GROK_ORACLE_REVIEW",
    "SPAWN_ENVELOPE_SCHEMA_VERSION",
    "SPAWN_ENVELOPE_STATUSES",
    "SPAWN_ENVELOPE_MODES",
    "SPAWN_ENVELOPE_EVIDENCE_CLASSES",
    "COMPLETION_STATUSES",
    "EVIDENCE_ARTIFACT_KINDS",
    "TEAM_MODE_TOOL_NAMES",
    "TEAM_MAX_MEMBERS",
    "TEAM_MAX_PARALLEL_WORKERS",
    "TEAM_MAX_MESSAGE_BYTES",
    "TEAM_MAX_UNREAD_BYTES",
    "TEAM_MAX_MESSAGES_PER_RUN",
    "TEAM_MEMBER_BLOCKED_TOOLS",
    "HYPERPLAN_REQUIRED_CRITIC_CATEGORIES",
    "HYPERPLAN_OPTIONAL_CRITIC_CATEGORIES",
    "HYPERPLAN_MAX_CRITICS",
    "HYPERPLAN_CRITIQUE_ROUNDS",
    "HYPERPLAN_REVISION_ROUNDS",
    "ATLAS_NOTEPAD_CATEGORIES",
    "SETUP_PROVIDER_WIZARD",
    "TEAM_PROVIDER_EXECUTABLES",
    "DEEP_ROLES",
    "LFG_AGENTS_DIR",
    "CANONICAL_OMO_AGENT_IDS",
    "OMO_PRIMARY_AGENT_IDS",
    "OMO_ELIGIBLE_TEAM_MEMBER_IDS",
    "OMO_CONDITIONAL_TEAM_MEMBER_IDS",
    "OMO_HARD_REJECT_TEAM_MEMBER_IDS",
    "OMO_TEAM_ELIGIBILITY_REGISTRY",
    "OMO_CATEGORY_MODEL_PROFILES",
    "OMO_UPSTREAM_CATEGORY_NAMES",
    "OMO_LFG_SUPPORTED_CATEGORY_NAMES",
    "OMO_CATEGORY_MIGRATION_NOTES",
    "OMO_CATEGORY_ROUTE_BLOCKED_TOOLS",
    "OMO_CATEGORY_ROUTE_VERIFICATION_GATE",
    "OMO_REASONING_LEVELS",
    "OMO_MODEL_MATCHING_SOURCE",
    "OMO_RUNTIME_FALLBACK_POLICY",
    "BACKGROUND_CONCURRENCY_CONFIG",
    "OMO_ROLE_FIT_POLICIES",
    "OMO_AGENT_ROLE_FIT",
    "OMO_CATEGORY_ROLE_FIT",
)
