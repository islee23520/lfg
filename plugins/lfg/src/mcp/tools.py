#!/usr/bin/env python3
"""Loader for the static LFG MCP tool schema catalog."""
from __future__ import annotations

import json
from pathlib import Path


def load_tools() -> list[dict]:
    return json.loads((Path(__file__).with_name("tools.json")).read_text())


TOOLS = load_tools()
