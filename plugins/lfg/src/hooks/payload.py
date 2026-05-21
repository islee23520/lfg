from __future__ import annotations

import json
import os
import sys


def detect_current_agent(user_prompt: str = "") -> str:
    env_agent = (
        os.environ.get("CURRENT_AGENT")
        or os.environ.get("GROK_AGENT_ID")
        or os.environ.get("AGENT_ID")
        or os.environ.get("LFG_ACTIVE_AGENT")
    )
    if env_agent:
        return env_agent.lower().strip()
    prompt_lower = (user_prompt or "").lower()
    known_agents = [
        "sisyphus",
        "hephaestus",
        "prometheus",
        "atlas",
        "sisyphus-junior",
        "oracle",
        "librarian",
        "explore",
        "metis",
        "momus",
        "multimodal-looker",
        "builtin-agents",
    ]
    for agent in known_agents:
        if agent in prompt_lower or f"you are {agent}" in prompt_lower or f"as {agent}" in prompt_lower:
            return agent
    return "sisyphus"


def extract_user_prompt_from_payload() -> str:
    try:
        raw = sys.stdin.read()
        if not raw:
            return ""
        data = json.loads(raw) if raw.strip().startswith("{") else {}
        for key in ("prompt", "user_prompt", "input", "message", "text"):
            if key in data and isinstance(data[key], str):
                return data[key]
        if len(raw) < 4000:
            return raw.strip()
        return raw[:2000] + " ... [truncated]"
    except Exception:
        return ""
