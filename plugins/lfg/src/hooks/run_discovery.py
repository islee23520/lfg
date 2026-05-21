# ruff: noqa: E402  # dynamic imports after sys.path bootstrap for spec_from_file_location
from __future__ import annotations

import pathlib  # noqa: E402
import sys  # noqa: E402
from typing import Any, Dict, List


_HOOKS_DIR = pathlib.Path(__file__).resolve().parent
if str(_HOOKS_DIR) not in sys.path:
    sys.path.insert(0, str(_HOOKS_DIR))

from paths import state_dir  # noqa: E402
from state_io import load_current_ultragoal, read_json
from task_helpers import message_is_evidence, task_is_pending


def find_active_runs() -> List[Dict[str, Any]]:
    runs_root = state_dir() / "runs"
    active_runs: List[Dict[str, Any]] = []
    current_ug = load_current_ultragoal() or {}
    current_ug_id = current_ug.get("id")

    if not runs_root.exists():
        return active_runs

    candidates = []
    for run_dir in sorted(runs_root.iterdir(), reverse=True):
        if not run_dir.is_dir():
            continue
        name = run_dir.name
        teams_dir = run_dir / "teams"
        if not teams_dir.exists():
            continue

        for team_dir in teams_dir.iterdir():
            if not team_dir.is_dir():
                continue

            run_data = read_json(team_dir / "run.json", {})
            if not run_data:
                continue

            status = run_data.get("status", "active")
            if status in ("completed", "aborted", "archived"):
                continue

            updated = run_data.get("updated_at", "")
            ulid = run_data.get("ultragoal_id")

            relevance = 10 if (current_ug_id and ulid == current_ug_id) else 5

            candidates.append({
                "run_dir": team_dir,
                "run_data": run_data,
                "name": name,
                "relevance": relevance,
                "updated": updated,
            })

    candidates.sort(key=lambda c: (c["relevance"], c["updated"]), reverse=True)

    for c in candidates[:2]:
        run_data = c["run_data"]
        team_dir = c["run_dir"]
        name = c["name"]

        tasks = read_json(team_dir / "tasks.json", [])
        mailbox = read_json(team_dir / "mailbox.json", [])

        active_runs.append({
            "run_id": run_data.get("id"),
            "mode": run_data.get("mode") or name.split("-")[0],
            "mode_id": name,
            "objective": run_data.get("objective", ""),
            "ultragoal_id": run_data.get("ultragoal_id"),
            "status": run_data.get("status", "active"),
            "tasks": tasks,
            "pending_tasks": [t for t in tasks if task_is_pending(t)][:4],
            "recent_evidence": [m for m in mailbox if message_is_evidence(m)][-3:],
            "team_dir": str(team_dir),
        })

    return active_runs
