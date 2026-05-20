from __future__ import annotations

import json
import os
import pathlib
from typing import Any


EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "PreCompact", "Stop", "SessionEnd", "Notification"]
CRITICAL_EVENTS = {"UserPromptSubmit", "PostToolUse", "PreCompact", "Stop"}


def paths(root: pathlib.Path) -> dict[str, pathlib.Path]:
    hook_dir = pathlib.Path.home() / ".grok" / "hooks"
    return {
        "hookDir": hook_dir,
        "config": hook_dir / "lfg-audit-bridge.json",
        "script": hook_dir / "lfg-audit-bridge.py",
        "delegate": root / "hooks" / "scripts" / "lfg-audit-hook.sh",
        "harness": root / "hooks" / "scripts" / "lfg-goal-harness.py",
    }


def status(root: pathlib.Path) -> dict[str, Any]:
    bridge_paths = paths(root)
    config = bridge_paths["config"]
    script = bridge_paths["script"]
    delegate = bridge_paths["delegate"]
    harness = bridge_paths["harness"]
    installed = config.exists() or script.exists()
    script_text = script.read_text(encoding="utf-8") if script.exists() else ""
    config_text = config.read_text(encoding="utf-8") if config.exists() else ""
    valid = (
        config.exists()
        and script.exists()
        and os.access(script, os.X_OK)
        and delegate.exists()
        and harness.exists()
        and str(delegate) in script_text
        and "lfg-audit-bridge.py" in config_text
        and "lfg-goal-harness.py" in config_text
    )
    return {
        "ok": (not installed) or valid,
        "installed": installed,
        "valid": valid,
        "hookDir": str(bridge_paths["hookDir"]),
        "config": str(config),
        "script": str(script),
        "delegate": str(delegate),
        "harness": str(harness),
        "evidence": "valid global bridge" if valid else ("not installed" if not installed else "installed but invalid"),
    }


def bridge_source(root: pathlib.Path, delegate: pathlib.Path) -> str:
    return (
        "#!/usr/bin/env python3\n"
        "from __future__ import annotations\n"
        "import os\n"
        "import pathlib\n"
        "import subprocess\n"
        "import sys\n\n"
        f"ROOT = pathlib.Path({str(root)!r})\n"
        f"AUDIT = pathlib.Path({str(delegate)!r})\n\n"
        "def main() -> int:\n"
        "    payload = sys.stdin.buffer.read()\n"
        "    env = os.environ.copy()\n"
        "    env.setdefault('GROK_PLUGIN_ROOT', str(ROOT))\n"
        f"    env.setdefault('GROK_PLUGIN_DATA', str(pathlib.Path({str(pathlib.Path.home() / '.grok' / 'plugin-data' / 'lfg')!r})))\n"
        "    if AUDIT.exists():\n"
        "        subprocess.run([str(AUDIT)], input=payload, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)\n"
        "    return 0\n\n"
        "if __name__ == '__main__':\n"
        "    raise SystemExit(main())\n"
    )


def install(root: pathlib.Path) -> dict[str, Any]:
    bridge_paths = paths(root)
    hook_dir = bridge_paths["hookDir"]
    config = bridge_paths["config"]
    script = bridge_paths["script"]
    delegate = bridge_paths["delegate"]
    harness = bridge_paths["harness"]
    if not delegate.exists():
        raise SystemExit(f"delegate hook not found: {delegate}")
    if not harness.exists():
        raise SystemExit(f"goal harness not found: {harness}")
    hook_dir.mkdir(parents=True, exist_ok=True)
    hooks: dict[str, Any] = {}
    for event in EVENTS:
        command = str(harness if event in CRITICAL_EVENTS else script)
        timeout = 12 if event == "PreCompact" else (10 if event in CRITICAL_EVENTS else 5)
        hooks[event] = [{"hooks": [{"type": "command", "command": command, "timeout": timeout}]}]
    config.write_text(json.dumps({"hooks": hooks}, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    script.write_text(bridge_source(root, delegate), encoding="utf-8")
    script.chmod(0o755)
    current = status(root)
    current["installedNow"] = True
    return current
