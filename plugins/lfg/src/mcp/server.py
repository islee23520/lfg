#!/usr/bin/env python3
"""Thin stdio MCP server shim for islee23520/lfg."""
from __future__ import annotations

import json
import pathlib
import sys

if __package__ in {None, ""}:
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[4]))
from plugins.lfg.src.mcp import _handlers_observation as observation
from plugins.lfg.src.mcp import _handlers_workflow as workflow
from plugins.lfg.src.mcp import _handlers_planning as planning
from plugins.lfg.src.mcp import _handlers_omo as omo
from plugins.lfg.src.mcp._helpers import SERVER_INFO, TOOLS, dispatch_tool_name, respond

_HANDLER_NAME_CONTRACT = "grok_build_catalog grok_build_status grok_build_runtime grok_build_doctor grok_build_hook_bridge grok_build_backend_start grok_build_team grok_build_ultrawork grok_build_agents grok_build_spawn grok_build_provider grok_build_boulder grok_build_atlas grok_build_hyperplan grok_build_ralph grok_build_worker grok_build_cleanup grok_build_autoresearch grok_build_deep_interview grok_build_design grok_build_notifications grok_build_models grok_build_auth grok_build_ask grok_build_analyze grok_build_code_review grok_build_pipeline grok_build_autopilot grok_build_performance_goal grok_build_visual_ralph grok_build_autoresearch_goal grok_build_setup grok_build_skill grok_build_hud grok_build_cancel grok_build_ultraqa grok_build_goal grok_build_ultragoal grok_build_ralplan grok_build_plan grok_build_wiki grok_build_slash grok_build_omo_agent_catalog grok_build_omo_team_create grok_build_omo_ulw grok_build_omo_doctor"
HANDLERS = {}
for group in (observation, workflow, planning, omo):
    HANDLERS.update(group.HANDLERS)

def handle_tool(name, arguments=None):
    handler_name = dispatch_tool_name(name)
    handler = HANDLERS.get(handler_name)
    if handler is None:
        raise KeyError(handler_name)
    return handler(arguments or {})

def handle(message):
    method = message.get("method")
    if method == "initialize":
        result = {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": SERVER_INFO}
        respond(message, result)
    elif method == "notifications/initialized":
        return
    elif method == "tools/list":
        respond(message, {"tools": TOOLS})
    elif method == "tools/call":
        try:
            params = message.get("params") or {}
            respond(message, handle_tool(params.get("name"), params.get("arguments") or {}))
        except Exception as exc:
            respond(message, error={"code": -32000, "message": str(exc)})
    elif method == "ping":
        respond(message, {})
    else:
        respond(message, error={"code": -32601, "message": f"Method not found: {method}"})

def main():
    for line in sys.stdin:
        try:
            if line.strip():
                handle(json.loads(line))
        except json.JSONDecodeError:
            continue
if __name__ == "__main__":
    main()
