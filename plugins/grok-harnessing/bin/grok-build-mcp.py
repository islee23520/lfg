#!/usr/bin/env python3
"""Minimal stdio MCP server for linalab-io-framework/grok-build.

Provides catalog/status tools for the Grok adaptation of oh-my-codex.
"""
import json
import os
import pathlib
import sys
import subprocess

SERVER_INFO = {"name": "grok-build-harness", "version": "0.3.0"}
ROOT = pathlib.Path(os.environ.get("GROK_PLUGIN_ROOT") or pathlib.Path(__file__).resolve().parents[1])
DATA = pathlib.Path(os.environ.get("GROK_PLUGIN_DATA") or pathlib.Path.home() / ".grok" / "plugin-data" / "grok-build")

TOOLS = [
    {
        "name": "grok_build_catalog",
        "description": "Return the OMX-to-Grok skill catalog for linalab-io-framework/grok-build.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "grok_build_status",
        "description": "Return install/status paths for the grok-build plugin.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "grok_build_runtime",
        "description": "Run a safe grok-build runtime query such as status, catalog, doctor, hud, pipeline_list, skill_list, skill_search, plan_list, wiki_list, wiki_search, backend_status, or team_status.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["status", "catalog", "doctor", "hud", "pipeline_list", "skill_list", "skill_search", "plan_list", "wiki_list", "wiki_search", "backend_status", "team_status"]},
                "team": {"type": "string"},
                "query": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_backend_start",
        "description": "Start the LFG tmux backend session used by /team.",
        "inputSchema": {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_team",
        "description": "Create/status/resume/shutdown an LFG tmux team. Creation defaults to dryRun=true unless explicitly false.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "status", "resume", "shutdown"]},
                "spec": {"type": "string", "description": "team spec like 3:executor"},
                "objective": {"type": "string"},
                "team": {"type": "string"},
                "query": {"type": "string"},
                "providers": {"type": "string", "description": "comma list, default hermes,claude,codex"},
                "dryRun": {"type": "boolean", "default": True}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_code_review",
        "description": "Create/list lightweight durable code review reports from git status/diff evidence.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "list"]},
                "objective": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_pipeline",
        "description": "Create/list/update durable staged workflow pipelines under plugin data.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "list", "update"]},
                "id": {"type": "string"},
                "title": {"type": "string"},
                "stages": {"type": "string", "description": "semicolon or newline separated stages"},
                "stage": {"type": "integer"},
                "status": {"type": "string", "enum": ["pending", "active", "complete", "blocked"]},
                "note": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_skill",
        "description": "List/search the Grok Build OMX-like skill catalog.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["list", "search"]},
                "query": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_hud",
        "description": "Return compact LFG workflow status summary.",
        "inputSchema": {
            "type": "object",
            "properties": {"text": {"type": "boolean", "default": False}},
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_cancel",
        "description": "Clear current LFG workflow pointers without deleting durable history.",
        "inputSchema": {
            "type": "object",
            "properties": {"scope": {"type": "string", "description": "comma list: goal,plan,team,ultraqa or all"}},
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_ultraqa",
        "description": "Create an adversarial QA smoke run and persist evidence under plugin data.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "objective": {"type": "string"},
                "noRun": {"type": "boolean", "default": True},
                "timeout": {"type": "integer", "default": 60}
            },
            "required": ["objective"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_goal",
        "description": "Create/list/update durable LFG goal state under plugin data; foundation for /ultragoal.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "list", "update"]},
                "objective": {"type": "string"},
                "id": {"type": "string"},
                "status": {"type": "string", "enum": ["active", "blocked", "complete", "cancelled"]},
                "checklist": {"type": "string"},
                "note": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_plan",
        "description": "Create or list durable LFG plan state under plugin data.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "list"]},
                "title": {"type": "string"},
                "steps": {"type": "string", "description": "semicolon or newline separated steps"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_wiki",
        "description": "Add/list/search durable LFG wiki notes under plugin data.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["add", "list", "search"]},
                "title": {"type": "string"},
                "body": {"type": "string"},
                "tags": {"type": "string"},
                "query": {"type": "string"}
            },
            "required": ["action"],
            "additionalProperties": False
        },
    },
    {
        "name": "grok_build_slash",
        "description": "Parse and execute an LFG-supported Grok slash command, currently /team. Defaults to dryRun=true.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "command": {"type": "string"},
                "providers": {"type": "string"},
                "dryRun": {"type": "boolean", "default": True}
            },
            "required": ["command"],
            "additionalProperties": False
        },
    },
]


def respond(message, result=None, error=None):
    if "id" not in message:
        return
    payload = {"jsonrpc": "2.0", "id": message.get("id")}
    if error is not None:
        payload["error"] = error
    else:
        payload["result"] = result if result is not None else {}
    print(json.dumps(payload, separators=(",", ":")), flush=True)


def text_result(value):
    return {"content": [{"type": "text", "text": json.dumps(value, indent=2, ensure_ascii=False)}]}


def handle_tool(name, arguments=None):
    arguments = arguments or {}
    if name == "grok_build_catalog":
        path = ROOT / "catalog" / "omx-skill-map.json"
        return text_result(json.loads(path.read_text()))
    if name == "grok_build_status":
        return text_result({
            "pluginRoot": str(ROOT),
            "pluginData": str(DATA),
            "catalogExists": (ROOT / "catalog" / "omx-skill-map.json").exists(),
            "skillsDir": str(ROOT / "skills"),
            "hooksFile": str(ROOT / "hooks" / "hooks.json"),
            "runtime": str(ROOT / "bin" / "lfg"),
        })
    if name == "grok_build_runtime":
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
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=20)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_backend_start":
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "backend", "start"]
        if arguments.get("name"):
            cmd += ["--name", arguments["name"]]
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=20)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_team":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "team"]
        if action == "create":
            spec = arguments.get("spec") or "3:executor"
            objective = arguments.get("objective") or "coordinate Grok Build team work with verification"
            cmd += ["create", spec, objective]
            if arguments.get("team"):
                cmd += ["--name", arguments["team"]]
            if arguments.get("providers"):
                cmd += ["--providers", arguments["providers"]]
            if arguments.get("dryRun", True):
                cmd += ["--dry-run"]
        elif action in {"status", "resume", "shutdown"}:
            cmd += [action]
            if arguments.get("team"):
                cmd += [arguments["team"]]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_code_review":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "code-review"]
        if action == "create":
            cmd += ["create", arguments.get("objective") or "review current changes"]
        elif action == "list":
            cmd += ["list"]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_pipeline":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "pipeline"]
        if action == "create":
            cmd += ["create", arguments.get("title") or "Untitled pipeline"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("stages"):
                cmd += ["--stages", arguments["stages"]]
        elif action == "list":
            cmd += ["list"]
        elif action == "update":
            cmd += ["update", "--stage", str(arguments.get("stage") or 1), "--status", arguments.get("status") or "active"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("note"):
                cmd += ["--note", arguments["note"]]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_skill":
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
    if name == "grok_build_hud":
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "hud"]
        if arguments.get("text"):
            cmd += ["--text"]
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_cancel":
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "cancel"]
        if arguments.get("scope"):
            cmd += ["--scope", arguments["scope"]]
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_ultraqa":
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "ultraqa", arguments["objective"]]
        if arguments.get("noRun", True):
            cmd += ["--no-run"]
        if arguments.get("timeout"):
            cmd += ["--timeout", str(arguments["timeout"])]
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=60)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_goal":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "goal"]
        if action == "create":
            cmd += ["create", arguments.get("objective") or "Untitled goal"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("checklist"):
                cmd += ["--checklist", arguments["checklist"]]
        elif action == "list":
            cmd += ["list"]
        elif action == "update":
            cmd += ["update", "--status", arguments.get("status") or "active"]
            if arguments.get("id"):
                cmd += ["--id", arguments["id"]]
            if arguments.get("note"):
                cmd += ["--note", arguments["note"]]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_plan":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "plan"]
        if action == "create":
            cmd += ["create", arguments.get("title") or "Untitled plan"]
            if arguments.get("steps"):
                cmd += ["--steps", arguments["steps"]]
        elif action == "list":
            cmd += ["list"]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_wiki":
        action = arguments.get("action")
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "wiki"]
        if action == "add":
            cmd += ["add", arguments.get("title") or "Untitled", arguments.get("body") or ""]
            if arguments.get("tags"):
                cmd += ["--tags", arguments["tags"]]
        elif action == "list":
            cmd += ["list"]
        elif action == "search":
            cmd += ["search", arguments.get("query") or ""]
        else:
            raise KeyError(action)
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    if name == "grok_build_slash":
        cmd = [str(ROOT / "bin" / "lfg"), "--json", "slash", arguments["command"]]
        if arguments.get("providers"):
            cmd += ["--providers", arguments["providers"]]
        if arguments.get("dryRun", True):
            cmd += ["--dry-run"]
        proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
        return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})
    raise KeyError(name)


def handle(message):
    method = message.get("method")
    if method == "initialize":
        respond(message, {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": SERVER_INFO})
    elif method == "notifications/initialized":
        return
    elif method == "tools/list":
        respond(message, {"tools": TOOLS})
    elif method == "tools/call":
        try:
            name = (message.get("params") or {}).get("name")
            respond(message, handle_tool(name, (message.get("params") or {}).get("arguments") or {}))
        except Exception as exc:
            respond(message, error={"code": -32000, "message": str(exc)})
    elif method == "ping":
        respond(message, {})
    else:
        respond(message, error={"code": -32601, "message": f"Method not found: {method}"})


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            handle(json.loads(line))
        except json.JSONDecodeError:
            continue


if __name__ == "__main__":
    main()
