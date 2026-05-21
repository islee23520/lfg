#!/usr/bin/env python3
from __future__ import annotations

import os
import pathlib
import sys


ROOT = pathlib.Path(os.environ.get("GROK_PLUGIN_ROOT") or pathlib.Path(__file__).resolve().parents[1])
REPO_ROOT = ROOT.parents[1]


def load_main():
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    from plugins.lfg.src.mcp.server import main

    return main


if __name__ == "__main__":
    sys.exit(load_main()())
