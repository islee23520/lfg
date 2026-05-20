#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import os
import pathlib
import sys


ROOT = pathlib.Path(os.environ.get("GROK_PLUGIN_ROOT") or pathlib.Path(__file__).resolve().parents[1])
SERVER = ROOT / "src" / "mcp" / "server.py"


def load_main():
    spec = importlib.util.spec_from_file_location("_lfg_mcp_server", SERVER)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load MCP server from {SERVER}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.main


if __name__ == "__main__":
    sys.exit(load_main()())
