# ruff: noqa: E402  # dynamic imports after sys.path bootstrap for spec_from_file_location
from __future__ import annotations

import json  # noqa: E402
import pathlib  # noqa: E402
import re  # noqa: E402
import sys  # noqa: E402
from typing import Any, Dict


_HOOKS_DIR = pathlib.Path(__file__).resolve().parent
if str(_HOOKS_DIR) not in sys.path:
    sys.path.insert(0, str(_HOOKS_DIR))

from snapshot import get_goal_snapshot  # noqa: E402
from state_io import write_boulder


def persist_boulder_from_payload(raw_payload: str, snapshot: Dict[str, Any]) -> Dict[str, Any]:
    if snapshot.get("has_durable_goal"):
        ug = snapshot.get("ultragoal") or {}
        ugid = ug.get("id")
        if ugid:
            try:
                boulder_match = re.search(
                    r"```(?:boulder|json)\s*(\{.*?\})\s*```",
                    raw_payload,
                    re.DOTALL | re.IGNORECASE,
                )
                if boulder_match:
                    candidate = boulder_match.group(1)
                    candidate = candidate.strip()
                    if candidate:
                        parsed = json.loads(candidate)
                        if isinstance(parsed, dict) and (
                            parsed.get("ultragoal_id") == ugid
                            or parsed.get("active_work_id") == ugid
                            or parsed.get("plan_id") == ugid
                        ):
                            parsed.setdefault("schema_version", 2)
                            write_boulder(ugid, parsed)
                            snapshot = get_goal_snapshot()
            except Exception:
                pass
    return snapshot
