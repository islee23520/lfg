#!/usr/bin/env python3
"""Dependency-free OMO agent registry and model-routing core.

This is the Python analogue of OMO's extracted pure TypeScript core packages:
the reusable agent/category/model policy lives here, while runtime/cli.py keeps
the command adapter, state IO, and fallback execution envelopes.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any, Callable

JsonReader = Callable[[pathlib.Path, Any], Any]


def read_json_file(path: pathlib.Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_agent_record(
    agent: dict[str, Any],
    *,
    team_eligibility_registry: dict[str, str],
    primary_agent_ids: tuple[str, ...],
) -> dict[str, Any]:
    normalized = dict(agent)
    agent_id = normalized.get("id")
    if isinstance(agent_id, str):
        eligibility = team_eligibility_registry.get(agent_id, normalized.get("teamEligibility", "unknown"))
        normalized["teamEligibility"] = eligibility
        normalized["teamMemberEligible"] = eligibility == "eligible"
        normalized["teamMemberConditional"] = eligibility == "conditional"
        normalized["primaryOrder"] = agent_id in primary_agent_ids
    return normalized


def load_agent_registry(
    *,
    agents_dir: pathlib.Path,
    canonical_agent_ids: tuple[str, ...],
    team_eligibility_registry: dict[str, str],
    primary_agent_ids: tuple[str, ...],
    read_json: JsonReader = read_json_file,
) -> list[dict[str, Any]]:
    """Load file-backed OMO agents and enforce the canonical inventory."""
    agents: list[dict[str, Any]] = []
    seen: set[str] = set()

    for path in sorted(agents_dir.glob("*.json")):
        try:
            data = read_json(path, None)
            if not isinstance(data, dict):
                continue
            agent_id = data.get("id")
            if not isinstance(agent_id, str) or agent_id in seen:
                continue
            if path.stem != agent_id:
                continue
            agents.append(
                normalize_agent_record(
                    data,
                    team_eligibility_registry=team_eligibility_registry,
                    primary_agent_ids=primary_agent_ids,
                )
            )
            seen.add(agent_id)
        except Exception:
            continue

    missing = [agent_id for agent_id in canonical_agent_ids if agent_id not in seen]
    if missing:
        raise SystemExit(
            f"missing required OMO agent definition(s) in {agents_dir}: {missing}. "
            "All entries in CANONICAL_OMO_AGENT_IDS must have a corresponding *.json file."
        )

    by_id = {agent["id"]: agent for agent in agents}
    ordered: list[dict[str, Any]] = []
    for agent_id in canonical_agent_ids:
        if agent_id in by_id:
            ordered.append(by_id[agent_id])
    for agent in agents:
        if agent["id"] not in canonical_agent_ids:
            ordered.append(agent)
    return ordered


def team_member_eligibility(agent_id: str, *, team_eligibility_registry: dict[str, str]) -> str:
    return team_eligibility_registry.get(agent_id, "unknown")


def validate_team_member_eligibility(
    agent_id: str,
    *,
    team_eligibility_registry: dict[str, str],
    eligible_team_member_ids: tuple[str, ...],
    conditional_team_member_ids: tuple[str, ...],
    hard_reject_team_member_ids: tuple[str, ...],
) -> dict[str, Any]:
    eligibility = team_member_eligibility(agent_id, team_eligibility_registry=team_eligibility_registry)
    if eligibility in {"hard-reject", "policy-layer"}:
        return {
            "ok": False,
            "error": "team member eligibility rejected",
            "agent": agent_id,
            "teamEligibility": eligibility,
            "eligibleTeamMembers": list(eligible_team_member_ids),
            "conditionalTeamMembers": list(conditional_team_member_ids),
            "hardRejectedTeamMembers": list(hard_reject_team_member_ids),
            "policyLayerTeamMembers": ["builtin-agents"],
        }
    return {"ok": True, "agent": agent_id, "teamEligibility": eligibility}


def category_route_catalog(
    *,
    upstream_category_names: list[str],
    supported_category_names: list[str],
    category_migration_notes: dict[str, str],
) -> dict[str, Any]:
    return {
        "upstreamCategories": list(upstream_category_names),
        "supportedCategories": list(supported_category_names),
        "migrationNotes": dict(category_migration_notes),
    }


def canonical_model_provider(provider: str, *, model_provider_aliases: dict[str, str]) -> str:
    return model_provider_aliases.get(provider, provider)


def validate_model_provider_boundary(
    *,
    provider: str | None,
    model: str | None,
    approved_model_providers: set[str],
    model_provider_aliases: dict[str, str],
) -> dict[str, Any] | None:
    selected_provider = canonical_model_provider(provider, model_provider_aliases=model_provider_aliases) if provider else None
    if provider and provider not in approved_model_providers:
        return {
            "ok": False,
            "error": "unsupported model provider for LFG multi-provider OMO agents",
            "provider": provider,
            "known": sorted(approved_model_providers),
        }
    if selected_provider and selected_provider not in approved_model_providers:
        return {
            "ok": False,
            "error": "unsupported model provider for LFG multi-provider OMO agents",
            "provider": provider,
            "known": sorted(approved_model_providers),
        }
    if model and "/" in model:
        raw_provider = model.split("/", 1)[0]
        canonical = canonical_model_provider(raw_provider, model_provider_aliases=model_provider_aliases)
        if canonical not in approved_model_providers:
            return {
                "ok": False,
                "error": "unsupported model provider in model override",
                "provider": raw_provider,
                "model": model,
                "known": sorted(approved_model_providers),
            }
        if selected_provider and selected_provider != canonical:
            return {
                "ok": False,
                "error": "model override provider does not match selected provider",
                "provider": provider,
                "modelProvider": raw_provider,
                "model": model,
            }
    return None


def hephaestus_model_family_status(
    profile: dict[str, Any],
    *,
    model_provider_aliases: dict[str, str],
    hephaestus_approved_model_profiles: tuple[dict[str, str], ...],
) -> dict[str, Any]:
    provider = canonical_model_provider(str(profile.get("provider") or ""), model_provider_aliases=model_provider_aliases)
    model = str(profile.get("model") or "")
    approved = any(provider == item["provider"] and model == item["model"] for item in hephaestus_approved_model_profiles)
    return {
        "agent": "hephaestus",
        "requiredFamily": "GPT-style deep specialist",
        "approved": approved,
        "approvedProfiles": [dict(item) for item in hephaestus_approved_model_profiles],
        "selectedProfile": dict(profile),
        "source": "agent-model-matching.md:224-232",
    }


def model_resolution_policy(
    agent: dict[str, Any],
    category: str | None,
    profile: dict[str, Any],
    selected_by: str,
    *,
    role_fit_policies: dict[str, dict[str, Any]],
    agent_role_fit: dict[str, str],
    category_role_fit: dict[str, str],
    runtime_fallback_policy: dict[str, Any],
    approved_model_providers: set[str],
) -> dict[str, Any]:
    role_fit = (
        agent_role_fit.get(agent["id"], "communicator")
        if agent.get("id") == "hephaestus"
        else category_role_fit.get(category or "") or agent_role_fit.get(agent["id"], "communicator")
    )
    policy = role_fit_policies[role_fit]
    return {
        "roleFit": role_fit,
        "reason": policy["reason"],
        "selectedBy": selected_by,
        "selectedModelProfile": dict(profile),
        "fallbackChainSource": policy["fallbackChainSource"],
        "proactiveFallbackChain": [dict(item) for item in policy["fallbackChain"]],
        "runtimeFallback": dict(runtime_fallback_policy),
        "providerBoundary": {
            "approvedProviders": sorted(approved_model_providers),
            "source": "docs/reference.md and approved-only external provider contract",
        },
    }


def resolve_model_profile(
    agent: dict[str, Any],
    *,
    category: str | None,
    provider: str | None,
    model: str | None,
    reasoning: str | None,
    current_model_selection: dict[str, Any],
    approved_model_providers: set[str],
    model_provider_aliases: dict[str, str],
    provider_default_models: dict[str, str],
    hephaestus_approved_model_profiles: tuple[dict[str, str], ...],
    category_model_profiles: dict[str, dict[str, str]],
    category_migration_notes: dict[str, str],
    upstream_category_names: list[str],
    supported_category_names: list[str],
    reasoning_levels: set[str],
    role_fit_policies: dict[str, dict[str, Any]],
    agent_role_fit: dict[str, str],
    category_role_fit: dict[str, str],
    runtime_fallback_policy: dict[str, Any],
) -> dict[str, Any]:
    boundary_error = validate_model_provider_boundary(
        provider=provider,
        model=model,
        approved_model_providers=approved_model_providers,
        model_provider_aliases=model_provider_aliases,
    )
    if boundary_error:
        return boundary_error

    if category and agent.get("id") == "hephaestus":
        profile = dict(agent["modelProfile"])
        selected_by = "hephaestus-approved-default"
    elif category:
        if category in category_migration_notes:
            return {
                "ok": False,
                "error": "category not yet supported by LFG",
                "category": category,
                "migrationNote": category_migration_notes[category],
                "upstreamCategories": list(upstream_category_names),
                "supportedCategories": list(supported_category_names),
            }
        if category not in category_model_profiles:
            return {
                "ok": False,
                "error": "unknown OMO category",
                "category": category,
                "known": sorted(category_model_profiles),
                "upstreamCategories": list(upstream_category_names),
            }
        if category not in agent.get("categories", []):
            return {
                "ok": False,
                "error": "category not supported for agent",
                "agent": agent["id"],
                "category": category,
                "supported": agent.get("categories", []),
                "upstreamCategories": list(upstream_category_names),
                "supportedCategories": list(supported_category_names),
            }
        profile = dict(category_model_profiles[category])
        selected_by = "category"
    else:
        profile = dict(agent["modelProfile"])
        selected_by = "agent"

    selected_from_model_switch = False
    if not provider and not model and agent.get("id") != "hephaestus" and current_model_selection.get("source") != "default":
        provider = str(current_model_selection.get("provider") or "xai")
        model = str(current_model_selection.get("model") or provider_default_models.get(provider, ""))
        reasoning = reasoning or current_model_selection.get("reasoning")
        selected_from_model_switch = True

    if provider:
        resolved_provider = canonical_model_provider(provider, model_provider_aliases=model_provider_aliases)
        profile["provider"] = resolved_provider
        if not model:
            profile["model"] = provider_default_models[resolved_provider]
        selected_by = "grok-build-model-switch" if selected_from_model_switch else "provider-override"
    else:
        profile.setdefault("provider", "xai")
    if model:
        profile["model"] = model
        selected_by = "model-override" if selected_by == "agent" else selected_by
    if reasoning:
        if reasoning not in reasoning_levels:
            return {"ok": False, "error": "unknown Grok reasoning level", "reasoning": reasoning, "known": sorted(reasoning_levels)}
        profile["reasoning"] = reasoning
    if agent.get("id") == "hephaestus":
        family_status = hephaestus_model_family_status(
            profile,
            model_provider_aliases=model_provider_aliases,
            hephaestus_approved_model_profiles=hephaestus_approved_model_profiles,
        )
        if not family_status["approved"]:
            return {
                "ok": False,
                "status": "blocked",
                "error": "model-family mismatch",
                "message": (
                    "Hephaestus requires an approved GPT-style deep-specialist profile; "
                    "refusing mismatched cheap, utility, or non-GPT model activation."
                ),
                "modelFamilyPolicy": family_status,
                "modelResolution": model_resolution_policy(
                    agent,
                    category,
                    profile,
                    selected_by,
                    role_fit_policies=role_fit_policies,
                    agent_role_fit=agent_role_fit,
                    category_role_fit=category_role_fit,
                    runtime_fallback_policy=runtime_fallback_policy,
                    approved_model_providers=approved_model_providers,
                ),
            }
    resolution = model_resolution_policy(
        agent,
        category,
        profile,
        selected_by,
        role_fit_policies=role_fit_policies,
        agent_role_fit=agent_role_fit,
        category_role_fit=category_role_fit,
        runtime_fallback_policy=runtime_fallback_policy,
        approved_model_providers=approved_model_providers,
    )
    if agent.get("id") == "hephaestus":
        resolution["modelFamilyPolicy"] = hephaestus_model_family_status(
            profile,
            model_provider_aliases=model_provider_aliases,
            hephaestus_approved_model_profiles=hephaestus_approved_model_profiles,
        )
    return {"ok": True, "modelProfile": profile, "modelResolution": resolution}


__all__ = (
    "category_route_catalog",
    "canonical_model_provider",
    "hephaestus_model_family_status",
    "load_agent_registry",
    "model_resolution_policy",
    "normalize_agent_record",
    "read_json_file",
    "resolve_model_profile",
    "team_member_eligibility",
    "validate_model_provider_boundary",
    "validate_team_member_eligibility",
)
