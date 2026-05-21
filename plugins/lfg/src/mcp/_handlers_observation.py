#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess

from plugins.lfg.src.mcp._helpers import (
    DATA,
    ROOT,
    run_lfg_json,
    text_result,
)

def handle_catalog(arguments):
    path = ROOT / "catalog" / "omo-skill-map.json"
    return text_result(json.loads(path.read_text()))


def handle_status(arguments):
    return text_result({
        "pluginRoot": str(ROOT),
        "pluginData": str(DATA),
        "catalogExists": (ROOT / "catalog" / "omo-skill-map.json").exists(),
        "skillsDir": str(ROOT / "skills"),
        "hooksFile": str(ROOT / "hooks" / "hooks.json"),
        "runtime": str(ROOT / "bin" / "lfg"),
    })


def handle_runtime(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json"]
    if action == "status":
        cmd += ["status"]
    elif action == "catalog":
        cmd += ["catalog"]
    elif action == "doctor":
        cmd += ["doctor"]
    elif action == "hud":
        cmd += ["hud"]
    elif action == "pipeline_list":
        cmd += ["pipeline", "list"]
    elif action == "skill_list":
        cmd += ["skill", "list"]
    elif action == "skill_search":
        cmd += ["skill", "search", arguments.get("query") or ""]
    elif action == "plan_list":
        cmd += ["plan", "list"]
    elif action == "wiki_list":
        cmd += ["wiki", "list"]
    elif action == "wiki_search":
        cmd += ["wiki", "search", arguments.get("query") or ""]
    elif action == "backend_status":
        cmd += ["backend", "status"]
    elif action == "team_status":
        cmd += ["team", "status"] + ([arguments["team"]] if arguments.get("team") else [])
    elif action == "hook_bridge_status":
        cmd += ["hook-bridge", "status"]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=20)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})



def handle_doctor(arguments):
    return text_result(run_lfg_json(["doctor"], timeout=30))


def handle_hook_bridge(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "hook-bridge"]
    if action in {"status", "install"}:
        cmd += [action]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_backend_start(arguments):
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "backend", "start"]
    if arguments.get("name"):
        cmd += ["--name", arguments["name"]]
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=20)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_models(arguments):
    action = arguments.get("action") or "show"
    if action == "switch":
        cmd = ["models", "switch", arguments.get("model") or "grok-build"]
        if arguments.get("provider"):
            cmd += ["--provider", arguments["provider"]]
        if arguments.get("reasoning"):
            cmd += ["--reasoning", arguments["reasoning"]]
    elif action == "show":
        cmd = ["models", "show"]
        if arguments.get("provider"):
            cmd += ["--provider", arguments["provider"]]
    else:
        raise KeyError(action)
    return text_result(run_lfg_json(cmd, timeout=30))


def handle_auth(arguments):
    if arguments.get("action") != "login":
        raise KeyError(arguments.get("action"))
    cmd = ["auth", "login", arguments["provider"]]
    for key, flag in (("id", "--id"), ("env", "--env"), ("model", "--model")):
        if arguments.get(key):
            cmd += [flag, arguments[key]]
    return text_result(run_lfg_json(cmd, timeout=30))


def handle_skill(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "skill"]
    if action == "list":
        cmd += ["list"]
    elif action == "search":
        cmd += ["search", arguments.get("query") or ""]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_hud(arguments):
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "hud"]
    if arguments.get("text"):
        cmd += ["--text"]
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_cancel(arguments):
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "cancel"]
    if arguments.get("scope"):
        cmd += ["--scope", arguments["scope"]]
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_slash(arguments):
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "slash", arguments["command"]]
    if arguments.get("providers"):
        cmd += ["--providers", arguments["providers"]]
    if arguments.get("dryRun", True):
        cmd += ["--dry-run"]
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})



HANDLERS = {
    "grok_build_catalog": handle_catalog,
    "grok_build_status": handle_status,
    "grok_build_runtime": handle_runtime,
    "grok_build_doctor": handle_doctor,
    "grok_build_hook_bridge": handle_hook_bridge,
    "grok_build_backend_start": handle_backend_start,
    "grok_build_models": handle_models,
    "grok_build_auth": handle_auth,
    "grok_build_skill": handle_skill,
    "grok_build_hud": handle_hud,
    "grok_build_cancel": handle_cancel,
    "grok_build_slash": handle_slash,
}
