# ruff: noqa: E402  # dynamic imports after sys.path bootstrap for spec_from_file_location
from __future__ import annotations

import pathlib  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
from typing import Any, Dict


_HOOKS_DIR = pathlib.Path(__file__).resolve().parent
if str(_HOOKS_DIR) not in sys.path:
    sys.path.insert(0, str(_HOOKS_DIR))

from run_discovery import find_active_runs  # noqa: E402
from state_io import load_current_ultragoal, read_boulder


def get_goal_snapshot() -> Dict[str, Any]:
    ug = load_current_ultragoal()
    runs = find_active_runs()

    boulder = {}
    if ug and ug.get("id"):
        boulder = read_boulder(ug["id"])

    snapshot = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "ultragoal": ug,
        "active_runs": runs,
        "boulder": boulder,
        "has_durable_goal": bool(ug or runs),
    }
    return snapshot
