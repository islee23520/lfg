#!/usr/bin/env python3
from __future__ import annotations

import subprocess

from plugins.lfg.src.mcp._helpers import (
    ROOT,
    run_lfg_json,
    text_result,
)

def handle_setup(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "omx-setup"]
    if action == "check":
        cmd += ["check"]
    elif action == "install-plan":
        cmd += ["install-plan"]
        if arguments.get("marketplace"):
            cmd += ["--marketplace", arguments["marketplace"]]
    elif action == "show":
        cmd += ["show"]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_omo_agent_catalog(arguments):
    result = run_lfg_json(["agents", "list"], timeout=20)
    payload = result.get("data") or {}
    agents = list(payload.get("agents", [])) if isinstance(payload, dict) else []
    agent_filter = arguments.get("filter", "all")
    if agent_filter == "eligible_team_members":
        agents = [agent for agent in agents if agent.get("teamEligibility") == "eligible"]
    elif agent_filter == "lead_agents":
        primary_order = ["sisyphus", "hephaestus", "prometheus", "atlas"]
        by_id = {agent.get("id"): agent for agent in agents}
        agents = [by_id[agent_id] for agent_id in primary_order if agent_id in by_id]
    elif agent_filter == "hyperplan":
        primary_order = ["sisyphus", "hephaestus", "prometheus", "atlas", "sisyphus-junior"]
        by_id = {agent.get("id"): agent for agent in agents}
        agents = [by_id[agent_id] for agent_id in primary_order if agent_id in by_id]
    if not arguments.get("with_eligibility", True):
        for agent in agents:
            agent.pop("teamEligibility", None)
            agent.pop("teamMemberEligible", None)
            agent.pop("teamMemberConditional", None)
    return text_result({
        **result,
        "source": "plugins/lfg/src/agents",
        "filter": agent_filter,
        "withEligibility": bool(arguments.get("with_eligibility", True)),
        "agents": agents,
        "count": len(agents),
    })



def handle_omo_team_create(arguments):
    objective = arguments.get("objective") or "OMO huge orchestration"
    spec = arguments.get("spec") or ("hyperplan" if arguments.get("hyperplan") else "3:executor")
    cmd = ["team", "create", spec, objective]
    if arguments.get("name"):
        cmd += ["--name", arguments["name"]]
    if arguments.get("providers"):
        cmd += ["--providers", arguments["providers"]]
    if arguments.get("dryRun", True):
        cmd += ["--dry-run"]
    result = run_lfg_json(cmd, timeout=45, launcher="ulw")
    result["note"] = "Hyperplan/OMO agent expansion handled by lfg team_create + TeamRuntime when spec contains hyperplan or template"
    return text_result(result)



def handle_omo_ulw(arguments):
    act = arguments.get("action", "create")
    if act in ("create", "show"):
        cmd = ["ultrawork"]
        if act == "create":
            cmd += ["create", arguments.get("objective") or "lfg ultrawork via MCP"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("tasks"):
                cmd += ["--tasks", arguments["tasks"]]
        else:
            cmd += ["show"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
        return text_result(run_lfg_json(cmd, timeout=30, launcher="ulw"))
    if act == "hyperplan-sim":
        cmd = ["team", "create", "3:executor", arguments.get("objective") or "hyperplan simulation via lfg MCP", "--providers", "grok,subagent", "--dry-run"]
        return text_result(run_lfg_json(cmd, timeout=30, launcher="ulw"))
    if act == "intent":
        return text_result({
            "ok": True,
            "source": "lfg-native",
            "message": arguments.get("message") or "",
            "model": arguments.get("model", "grok"),
            "note": "Intent preamble handling is provided by the lfg/ulw runtime, not an archived reference tree.",
        })
    return text_result({"error": "unsupported omo_ulw action", "action": act})



def handle_omo_doctor(arguments):
    result = run_lfg_json(["doctor"], timeout=25)
    result["source"] = "lfg doctor"
    return text_result(result)



HANDLERS = {
    "grok_build_setup": handle_setup,
    "grok_build_omx_setup": handle_setup,
    "grok_build_omo_agent_catalog": handle_omo_agent_catalog,
    "grok_build_omo_team_create": handle_omo_team_create,
    "grok_build_omo_ulw": handle_omo_ulw,
    "grok_build_omo_doctor": handle_omo_doctor,
}
