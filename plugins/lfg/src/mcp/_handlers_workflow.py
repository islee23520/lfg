#!/usr/bin/env python3
from __future__ import annotations

import subprocess

from plugins.lfg.src.mcp._helpers import (
    ROOT,
    append_evidence_artifacts,
    run_lfg_json,
    text_result,
)

def handle_agents(arguments):
    action = arguments.get("action")
    cmd = ["agents"]
    if action == "list":
        cmd += ["list"]
    elif action == "inspect":
        cmd += ["inspect", arguments.get("agent") or "sisyphus"]
        for key, flag in (("category", "--category"), ("provider", "--provider"), ("model", "--model"), ("reasoning", "--reasoning")):
            if arguments.get(key):
                cmd += [flag, arguments[key]]
    else:
        raise KeyError(action)
    return text_result(run_lfg_json(cmd, timeout=20))


def handle_spawn(arguments):
    cmd = ["spawn", arguments["agent"]]
    flags = (
        ("category", "--category"),
        ("task", "--task"),
        ("provider", "--provider"),
        ("model", "--model"),
        ("reasoning", "--reasoning"),
        ("mode", "--mode"),
    )
    for key, flag in flags:
        if arguments.get(key):
            cmd += [flag, arguments[key]]
    if arguments.get("taskId"):
        cmd += ["--task-id", arguments["taskId"]]
    return text_result(run_lfg_json(cmd, timeout=30))


def handle_provider(arguments):
    action = arguments.get("action")
    cmd = ["provider"]
    if action == "list":
        cmd += ["list"]
    elif action == "show":
        cmd += ["show", arguments.get("id") or "default"]
    elif action == "add":
        cmd += ["add"]
        for key, flag in (("id", "--id"), ("kind", "--kind"), ("env", "--env"), ("model", "--model")):
            if arguments.get(key):
                cmd += [flag, arguments[key]]
    else:
        raise KeyError(action)
    return text_result(run_lfg_json(cmd, timeout=30))


def handle_boulder(arguments):
    action = arguments.get("action") or "atlas_status"
    if action == "atlas_status":
        cmd = ["atlas", "status"]
        if arguments.get("planId"):
            cmd += ["--plan-id", arguments["planId"]]
        if arguments.get("sessionId"):
            cmd += ["--session-id", arguments["sessionId"]]
    elif action == "ultragoal_show":
        cmd = ["ultragoal", "show"]
        if arguments.get("ultragoalId"):
            cmd += ["--id", arguments["ultragoalId"]]
    elif action == "ultragoal_status":
        cmd = ["ultragoal", "status"]
        if arguments.get("ultragoalId"):
            cmd += ["--id", arguments["ultragoalId"]]
    else:
        raise KeyError(action)
    return text_result(run_lfg_json(cmd, timeout=30))


def handle_atlas(arguments):
    action = arguments.get("action")
    cmd = ["atlas"]
    if action in {"start-work", "status"}:
        cmd += [action]
        if arguments.get("planId"):
            cmd += ["--plan-id", arguments["planId"]]
        if arguments.get("sessionId"):
            cmd += ["--session-id", arguments["sessionId"]]
    elif action == "checkbox":
        cmd += ["checkbox", "--task", arguments.get("task") or "1", "--status", arguments.get("status") or "active"]
        flags = (
            ("planId", "--plan-id"),
            ("sessionId", "--session-id"),
            ("evidence", "--evidence"),
            ("learning", "--learning"),
            ("decision", "--decision"),
            ("issue", "--issue"),
            ("verification", "--verification"),
            ("problem", "--problem"),
        )
        for key, flag in flags:
            if arguments.get(key):
                cmd += [flag, arguments[key]]
        append_evidence_artifacts(cmd, arguments)
    else:
        raise KeyError(action)
    return text_result(run_lfg_json(cmd, timeout=30))


def handle_hyperplan(arguments):
    cmd = ["hyperplan", arguments["objective"]]
    if arguments.get("runId"):
        cmd += ["--run-id", arguments["runId"]]
    if arguments.get("teamName"):
        cmd += ["--team-name", arguments["teamName"]]
    if arguments.get("noDeep"):
        cmd += ["--no-deep"]
    if arguments.get("dryRun", True):
        cmd += ["--dry-run"]
    return text_result(run_lfg_json(cmd, timeout=45))


def handle_team(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "team"]
    if action == "providers":
        cmd += ["providers"]
    elif action == "preflight":
        cmd += ["preflight"]
        if arguments.get("team"):
            cmd += ["--name", arguments["team"]]
    elif action == "create":
        spec = arguments.get("spec") or "3:executor"
        objective = arguments.get("objective") or "coordinate LFG team work with verification"
        cmd += ["create", spec, objective]
        if arguments.get("team"):
            cmd += ["--name", arguments["team"]]
        if arguments.get("providers"):
            cmd += ["--providers", arguments["providers"]]
        else:
            # Maximise installed coding CLIs on the machine + native grok sub-agents
            cmd += ["--providers", "grok,subagent"]
        if arguments.get("dryRun", True):
            cmd += ["--dry-run"]
    elif action in {"status", "resume", "shutdown"}:
        cmd += [action]
        if arguments.get("team"):
            cmd += [arguments["team"]]
    elif action == "list":
        cmd += ["list"]
    elif action == "delete":
        cmd += ["delete", arguments["team"]]
    elif action == "send_message":
        cmd += ["send-message", arguments["team"], arguments.get("to") or "leader", arguments.get("body") or ""]
    elif action == "task_create":
        cmd += ["task-create", arguments["team"], arguments.get("title") or "team task"]
        if arguments.get("description"):
            cmd += ["--description", arguments["description"]]
        if arguments.get("owner"):
            cmd += ["--owner", arguments["owner"]]
    elif action == "task_list":
        cmd += ["task-list", arguments["team"]]
    elif action == "task_update":
        cmd += ["task-update", arguments["team"], arguments["task"]]
        if arguments.get("status"):
            cmd += ["--status", arguments["status"]]
        if arguments.get("owner"):
            cmd += ["--owner", arguments["owner"]]
        if arguments.get("evidence"):
            cmd += ["--evidence", arguments["evidence"]]
    elif action == "task_get":
        cmd += ["task-get", arguments["team"], arguments["task"]]
    elif action == "shutdown_request":
        cmd += ["shutdown-request", arguments["team"], arguments["member"]]
        if arguments.get("reason"):
            cmd += ["--reason", arguments["reason"]]
    elif action == "approve_shutdown":
        cmd += ["approve-shutdown", arguments["team"], arguments["member"]]
    elif action == "reject_shutdown":
        cmd += ["reject-shutdown", arguments["team"], arguments["member"]]
    else:
        raise KeyError(action)
    if arguments.get("actor") and action not in {"providers", "preflight", "status", "list", "resume", "shutdown"}:
        cmd += ["--actor", arguments["actor"]]
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_ultrawork(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "ultrawork"]
    if action == "create":
        cmd += ["create", arguments.get("objective") or "Ultrawork objective"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("tasks"):
            cmd += ["--tasks", arguments["tasks"]]
    elif action == "update":
        cmd += ["update", "--task", str(arguments.get("task") or 1), "--status", arguments.get("status") or "active"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("evidence"):
            cmd += ["--evidence", arguments["evidence"]]
        append_evidence_artifacts(cmd, arguments)
    elif action == "show":
        cmd += ["show"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_ultragoal(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "ultragoal"]
    if action == "create":
        cmd += ["create", arguments.get("objective") or "Ultragoal objective"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("checklist"):
            cmd += ["--checklist", arguments["checklist"]]
        if arguments.get("brief"):
            cmd += ["--brief", arguments["brief"]]
    elif action in {"status", "show"}:
        cmd += [action]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
    elif action == "checkpoint":
        cmd += ["checkpoint", "--status", arguments.get("status") or "active"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("story"):
            cmd += ["--story", arguments["story"]]
        if arguments.get("evidence"):
            cmd += ["--evidence", arguments["evidence"]]
        if arguments.get("goal_json"):
            cmd += ["--goal-json", arguments["goal_json"]]
        if arguments.get("force_gate") or arguments.get("forceGate"):
            cmd += ["--force-gate"]
        append_evidence_artifacts(cmd, arguments)
    elif action == "spawn":
        cmd += ["spawn", arguments.get("objective") or "ultragoal swarm task"]
        if arguments.get("spec"):
            cmd += ["--spec", arguments["spec"]]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("brief"):
            cmd += ["--brief", arguments["brief"]]
        if arguments.get("providers"):
            cmd += ["--providers", arguments["providers"]]
        if arguments.get("team"):
            cmd += ["--name", arguments["team"]]
        if arguments.get("dryRun", True):
            cmd += ["--dry-run"]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_ralph(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "ralph"]
    if action == "create":
        cmd += ["create", arguments.get("objective") or "Ralph objective"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("maxIterations"):
            cmd += ["--max-iterations", str(arguments["maxIterations"])]
        if arguments.get("stopCondition"):
            cmd += ["--stop-condition", arguments["stopCondition"]]
    elif action == "step":
        cmd += ["step", "--status", arguments.get("status") or "active"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("evidence"):
            cmd += ["--evidence", arguments["evidence"]]
        append_evidence_artifacts(cmd, arguments)
    elif action == "show":
        cmd += ["show"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_worker(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "worker"]
    if action == "ack":
        cmd += ["ack", arguments.get("worker") or "worker-1", arguments.get("task") or "task"]
    elif action == "result":
        cmd += ["result", arguments.get("worker") or "worker-1", arguments.get("result") or "done"]
        if arguments.get("status"):
            cmd += ["--status", arguments["status"]]
        append_evidence_artifacts(cmd, arguments)
    elif action == "status":
        cmd += ["status"]
        if arguments.get("worker"):
            cmd += [arguments["worker"]]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


HANDLERS = {
    "grok_build_agents": handle_agents,
    "grok_build_spawn": handle_spawn,
    "grok_build_provider": handle_provider,
    "grok_build_boulder": handle_boulder,
    "grok_build_atlas": handle_atlas,
    "grok_build_hyperplan": handle_hyperplan,
    "grok_build_team": handle_team,
    "grok_build_ultrawork": handle_ultrawork,
    "grok_build_ultragoal": handle_ultragoal,
    "grok_build_ralph": handle_ralph,
    "grok_build_worker": handle_worker,
}
