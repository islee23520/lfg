#!/usr/bin/env python3
"""Shared helpers for the dependency-free LFG MCP server."""
from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import subprocess

ROOT = pathlib.Path(os.environ.get("GROK_PLUGIN_ROOT") or pathlib.Path(__file__).resolve().parents[2])
DATA = pathlib.Path(os.environ.get("GROK_PLUGIN_DATA") or pathlib.Path.cwd() / ".lfg")
LEGACY_TOOL_PREFIX = "grok_build_"


def _read_version() -> str:
    pyproject = ROOT.parents[1] / "pyproject.toml"
    if pyproject.exists():
        for line in pyproject.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped.startswith("version") and "=" in stripped:
                return stripped.split("=", 1)[1].strip().strip('"').strip("'")
    return "0.0.0"


SERVER_INFO = {"name": "lfg-harness", "version": _read_version()}


def load_mcp_tools() -> list[dict]:
    path = ROOT / "src" / "mcp" / "tools.py"
    spec = importlib.util.spec_from_file_location("_lfg_mcp_tools", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load MCP tools from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return list(module.TOOLS)


TOOLS = load_mcp_tools()
CANONICAL_TOOL_NAMES = {tool["name"] for tool in TOOLS}


def dispatch_tool_name(name):
    if not isinstance(name, str) or not name:
        raise KeyError(name)
    if name.startswith(LEGACY_TOOL_PREFIX):
        return name
    if name not in CANONICAL_TOOL_NAMES:
        raise KeyError(name)
    return f"{LEGACY_TOOL_PREFIX}{name}"


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


def run_lfg_json(args, timeout=30, launcher="lfg"):
    executable = ROOT / "bin" / launcher
    cmd = [str(executable), "--json"] + list(args)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout)
    parsed = None
    parse_error = None
    stdout = proc.stdout.strip()
    if stdout:
        try:
            parsed = json.loads(stdout)
        except json.JSONDecodeError as exc:
            parse_error = str(exc)
    status = "ok" if proc.returncode == 0 and parse_error is None else "error"
    return {
        "ok": status == "ok",
        "status": status,
        "cmd": cmd,
        "returncode": proc.returncode,
        "data": parsed,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "stdoutJson": parse_error is None,
        "parseError": parse_error,
    }


def append_evidence_artifacts(cmd, arguments):
    paths = arguments.get("evidenceArtifactPaths") or arguments.get("evidenceArtifacts") or []
    if isinstance(paths, str):
        paths = [paths]
    for path in paths:
        if path:
            cmd += ["--evidence-artifact", str(path)]
