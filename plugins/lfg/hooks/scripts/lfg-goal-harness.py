#!/usr/bin/env python3
"""Router: delegates to src/hooks/goal_harness.py (the real implementation)."""

from __future__ import annotations

import importlib.util
import os
import pathlib
import sys


def _plugin_root() -> pathlib.Path:
    env = os.environ.get("GROK_PLUGIN_ROOT", os.environ.get("CLAUDE_PLUGIN_ROOT", ""))
    if env:
        return pathlib.Path(env)
    return pathlib.Path(__file__).resolve().parents[2]


def main() -> int:
    root = _plugin_root()
    target = root / "src" / "hooks" / "goal_harness.py"
    if not target.exists():
        return 0  # fail-open
    spec = importlib.util.spec_from_file_location("lfg_goal_harness", target)
    if spec is None or spec.loader is None:
        return 0
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.main()


if __name__ == "__main__":
    sys.exit(main())
