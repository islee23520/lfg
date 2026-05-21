"""Dependency-free MCP server package for LFG."""
from __future__ import annotations

from plugins.lfg.src.mcp._helpers import (
    CANONICAL_TOOL_NAMES,
    DATA,
    LEGACY_TOOL_PREFIX,
    ROOT,
    SERVER_INFO,
    TOOLS,
    append_evidence_artifacts,
    dispatch_tool_name,
    load_mcp_tools,
    respond,
    run_lfg_json,
    text_result,
)

__all__ = [
    "CANONICAL_TOOL_NAMES",
    "DATA",
    "LEGACY_TOOL_PREFIX",
    "ROOT",
    "SERVER_INFO",
    "TOOLS",
    "append_evidence_artifacts",
    "dispatch_tool_name",
    "load_mcp_tools",
    "respond",
    "run_lfg_json",
    "text_result",
]
