from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
from typing import Any

from hook_bridge.paths import hook_dir, repo_root


def run(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, check=False, **kwargs)


def assert_grok_session(output: str) -> None:
    obj = json.loads(output)
    assert obj.get("text", "").strip().startswith("DONE"), obj
    assert "LFG_GLOBAL_BRIDGE_HOOK_SESSION" in obj.get("thought", ""), obj


def assert_audit_log(log: pathlib.Path) -> int:
    assert log.stat().st_size > 0, log
    lines = [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines() if line.strip()]
    events = {line.get("event") for line in lines}
    assert {"session_start", "user_prompt_submit", "pre_tool_use", "post_tool_use", "stop"} & events, events
    assert all("LFG_GLOBAL_BRIDGE_HOOK_SESSION" not in line.get("payloadPreview", "") or line.get("payloadBytes", 0) > 0 for line in lines)
    return len(lines)


def main() -> int:
    repo = repo_root()
    plugin = repo / "plugins" / "lfg"
    grok_bin = pathlib.Path(os.environ.get("GROK_BIN", "/Users/ilseoblee/.grok/bin/grok"))
    if not os.access(grok_bin, os.X_OK):
        raise SystemExit(f"GROK_BIN is not executable: {grok_bin}")

    install_smoke = run([sys.executable, str(plugin / "bin" / "grok-install-smoke.py")], cwd=repo, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if install_smoke.returncode != 0:
        sys.stderr.write(install_smoke.stderr)
        raise SystemExit(install_smoke.returncode)

    hooks = hook_dir()
    with tempfile.TemporaryDirectory() as backup_dir:
        backup = pathlib.Path(backup_dir) / "hooks.bak"
        if hooks.exists():
            shutil.copytree(hooks, backup)
        try:
            shutil.rmtree(hooks, ignore_errors=True)
            shutil.rmtree(repo / ".lfg" / "events", ignore_errors=True)
            install = run(
                [sys.executable, str(plugin / "scripts" / "hook-bridge-install.py")],
                cwd=plugin,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            if install.returncode != 0:
                sys.stderr.write(install.stderr)
                raise SystemExit(install.returncode)

            session = run(
                [
                    str(grok_bin),
                    "--no-leader",
                    "--cwd",
                    "/tmp",
                    "--no-alt-screen",
                    "--always-approve",
                    "--max-turns",
                    "12",
                    "--output-format",
                    "json",
                    "-p",
                    "Use the terminal tool to run: echo LFG_GLOBAL_BRIDGE_HOOK_SESSION. Then answer exactly DONE.",
                ],
                cwd=repo,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            assert_grok_session(session.stdout)
            count = assert_audit_log(repo / ".lfg" / "events" / "audit.jsonl")
            print(f"grok-global-hook-bridge=ok events={count}")
            return 0
        finally:
            shutil.rmtree(hooks, ignore_errors=True)
            if backup.exists():
                shutil.move(str(backup), str(hooks))
