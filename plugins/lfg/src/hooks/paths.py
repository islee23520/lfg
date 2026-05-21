from __future__ import annotations

import os
import pathlib
import re


HOME = pathlib.Path.home()
PLUGIN_ROOT = pathlib.Path(os.environ.get("GROK_PLUGIN_ROOT", pathlib.Path(__file__).resolve().parents[2]))
GROK_PLUGIN_DATA = pathlib.Path(os.environ.get("GROK_PLUGIN_DATA", str(pathlib.Path.cwd() / ".lfg")))
STATE_DIR = GROK_PLUGIN_DATA / "state"
ULTRAGOAL_DIR = GROK_PLUGIN_DATA / "ultragoal"
HARNESS_DIR = GROK_PLUGIN_DATA / "harness"
DISPATCH_GATE_DIR = GROK_PLUGIN_DATA / "dispatch-gate"
INJECTION_FILE = HARNESS_DIR / "active_injection.txt"
INJECTION_META = HARNESS_DIR / "last_turn.json"
TODO_REMINDER_STATE = HARNESS_DIR / "todo-continuation.json"
SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")


def plugin_root() -> pathlib.Path:
    return pathlib.Path(os.environ.get("GROK_PLUGIN_ROOT", pathlib.Path(__file__).resolve().parents[2]))


def plugin_data() -> pathlib.Path:
    return pathlib.Path(os.environ.get("GROK_PLUGIN_DATA", str(pathlib.Path.cwd() / ".lfg")))


def state_dir() -> pathlib.Path:
    return plugin_data() / "state"


def ultragoal_dir() -> pathlib.Path:
    return plugin_data() / "ultragoal"


def harness_dir() -> pathlib.Path:
    return plugin_data() / "harness"


def dispatch_gate_dir() -> pathlib.Path:
    return plugin_data() / "dispatch-gate"


def injection_file() -> pathlib.Path:
    return harness_dir() / "active_injection.txt"


def injection_meta() -> pathlib.Path:
    return harness_dir() / "last_turn.json"


def todo_reminder_state() -> pathlib.Path:
    return harness_dir() / "todo-continuation.json"


def ralph_state_dir() -> pathlib.Path:
    return plugin_data() / "runs" / "ralph"


def ralph_current_path() -> pathlib.Path:
    return state_dir() / "current-ralph.json"


def stop_guard_state() -> pathlib.Path:
    return harness_dir() / "stop-continuation-guard.json"
