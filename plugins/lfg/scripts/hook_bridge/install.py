from __future__ import annotations

import json
import pathlib
import stat

from hook_bridge.paths import hook_dir, plugin_data, plugin_root


CRITICAL_EVENTS = {"UserPromptSubmit", "PostToolUse", "PreCompact", "Stop"}
EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "PreCompact", "Stop", "SessionEnd", "Notification"]


def write_executable(path: pathlib.Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def bridge_source(root: pathlib.Path) -> str:
    return f'''#!/usr/bin/env python3
from __future__ import annotations

import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path({str(root)!r})
    AUDIT = ROOT / "src" / "hooks" / "audit_hook.sh"


def main() -> int:
    payload = sys.stdin.buffer.read()
    env = os.environ.copy()
    env.setdefault("GROK_PLUGIN_ROOT", str(ROOT))
    env.setdefault("GROK_PLUGIN_DATA", str(pathlib.Path({str(plugin_data())!r})))
    env.setdefault("LFG_LAUNCHER", os.environ.get("LFG_LAUNCHER", "lfg"))
    if AUDIT.exists():
        subprocess.run([str(AUDIT)], input=payload, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
'''


def command(path: pathlib.Path, timeout: int) -> list[dict[str, list[dict[str, object]]]]:
    return [{"hooks": [{"type": "command", "command": str(path), "timeout": timeout}]}]


def hook_config(bridge: pathlib.Path, harness: pathlib.Path) -> dict[str, object]:
    hooks: dict[str, object] = {}
    for event in EVENTS:
        target = harness if event in CRITICAL_EVENTS else bridge
        timeout = 12 if event == "PreCompact" else (10 if event in CRITICAL_EVENTS else 5)
        hooks[event] = command(target, timeout)
    return {"hooks": hooks}


def main() -> int:
    root = plugin_root()
    hooks = hook_dir()
    hooks.mkdir(parents=True, exist_ok=True)

    harness = root / "src" / "hooks" / "goal_harness.py"
    audit = root / "src" / "hooks" / "audit_hook.sh"
    bridge = hooks / "lfg-audit-bridge.py"
    config = hooks / "lfg-audit-bridge.json"

    warnings: list[str] = []
    if not harness.exists():
        warnings.append("WARNING: lfg-goal-harness.py not found, aggressive injection will be unavailable")
    if not audit.exists():
        warnings.append("WARNING: lfg-audit-hook.sh not found, audit logging will be unavailable")

    write_executable(bridge, bridge_source(root))
    config.write_text(json.dumps(hook_config(bridge, harness), ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    for warning in warnings:
        print(warning)
    print(f"lfg-global-hook-bridge=installed-with-python-harness hookDir={hooks} pluginRoot={root}")
    print("Critical events (UserPromptSubmit, Stop, PostToolUse) now route through lfg-goal-harness.py for direct prompt injection.")
    return 0
