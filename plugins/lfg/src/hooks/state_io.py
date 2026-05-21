# ruff: noqa: E402  # dynamic imports after sys.path bootstrap for spec_from_file_location
from __future__ import annotations

import json  # noqa: E402
import importlib  # noqa: E402
import pathlib  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
from typing import Any, Dict, Optional


_HOOKS_DIR = pathlib.Path(__file__).resolve().parent
if str(_HOOKS_DIR) not in sys.path:
    sys.path.insert(0, str(_HOOKS_DIR))

_paths = importlib.import_module("paths")
SAFE_ID_RE = _paths.SAFE_ID_RE
state_dir = _paths.state_dir
ultragoal_dir = _paths.ultragoal_dir


def read_json(path: pathlib.Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def validate_safe_id(value: str, field: str) -> str:
    if not SAFE_ID_RE.fullmatch(value or ""):
        raise ValueError(f"invalid {field}: {value!r}")
    return value


def safe_child_path(root: pathlib.Path, *parts: str) -> pathlib.Path:
    root_resolved = root.resolve()
    path = root_resolved.joinpath(*parts).resolve()
    if path != root_resolved and root_resolved not in path.parents:
        raise ValueError(f"unsafe path outside {root_resolved}: {path}")
    return path


def load_current_ultragoal() -> Optional[Dict[str, Any]]:
    cur = state_dir() / "current-ultragoal.json"
    data = read_json(cur, {})
    if not data or not data.get("id"):
        return None
    return data


def boulder_path(ugid: str) -> pathlib.Path:
    return safe_child_path(ultragoal_dir(), validate_safe_id(ugid, "ultragoal id"), "boulder.json")


def read_boulder(ugid: str) -> Dict[str, Any]:
    return read_json(boulder_path(ugid), {}) or {}


def write_boulder(ugid: str, boulder: Dict[str, Any]) -> None:
    path = boulder_path(ugid)
    path.parent.mkdir(parents=True, exist_ok=True)
    boulder["last_updated_by"] = "sisyphus"
    boulder["last_updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    path.write_text(json.dumps(boulder, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
