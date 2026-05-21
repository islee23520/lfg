#!/usr/bin/env python3
"""Gateway for the LFG runtime implementation under plugins/lfg/src."""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

ROOT = Path(os.environ.get("GROK_PLUGIN_ROOT") or Path(__file__).resolve().parents[1])
RUNTIME = ROOT / "src" / "runtime" / "cli.py"

def _load_runtime():
    spec = importlib.util.spec_from_file_location("lfg_runtime_cli", RUNTIME)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load LFG runtime from {RUNTIME}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module

_RUNTIME = _load_runtime()

def __getattr__(name):
    return getattr(_RUNTIME, name)

def main(argv=None):
    return _RUNTIME.main(argv)

if __name__ == "__main__":
    raise SystemExit(main())
