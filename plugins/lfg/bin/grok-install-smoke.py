#!/usr/bin/env python3
"""Python-managed Grok install/discovery smoke for the LFG plugin."""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = pathlib.Path(os.environ.get("LFG_PLUGIN_DEST", str(pathlib.Path.home() / ".grok/plugins/lfg")))
GROK_BIN = pathlib.Path(os.environ.get("GROK_BIN", str(pathlib.Path.home() / ".grok/bin/grok")))
OUT = pathlib.Path(os.environ.get("GROK_INSPECT_OUT", "/tmp/lfg-inspect.json"))


def main() -> int:
    DEST.parent.mkdir(parents=True, exist_ok=True)
    if DEST.exists():
        shutil.rmtree(DEST)
    ignore = shutil.ignore_patterns("__pycache__", "*.pyc")
    shutil.copytree(ROOT, DEST, ignore=ignore)
    print(f"plugin-sync=ok dest={DEST}")

    if not os.access(GROK_BIN, os.X_OK):
        print(f"grok-binary=missing path={GROK_BIN}", file=sys.stderr)
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w") as fh:
        subprocess.run([str(GROK_BIN), "--cwd", "/tmp", "inspect", "--json"], stdout=fh, text=True, check=True)

    obj = json.loads(OUT.read_text())
    skills = [s.get("name") for s in obj.get("skills", []) if "lfg" in json.dumps(s) or "/lfg/" in json.dumps(s)]
    agents = [a.get("name") for a in obj.get("agents", []) if "lfg" in json.dumps(a) or "/lfg/" in json.dumps(a)]
    required = {
        "agent-browser", "ai-slop-remover", "frontend-ui-ux", "git-master",
        "hyperplan", "playwright", "review-work", "team-mode", "work-with-pr",
    }
    missing = sorted(required - set(skills))
    assert not missing, missing
    required_agents = {"lfg:sisyphus", "lfg:sisyphus-junior", "lfg:prometheus", "lfg:atlas", "lfg:hephaestus", "lfg:oracle"}
    missing_agents = sorted(required_agents - set(agents))
    assert not missing_agents, missing_agents
    print(f"grok-install-smoke=ok skills={len(skills)} key_skills_present")
    print(f"grok-agent-discovery=ok agents={len(agents)} key_agents_present")
    print(f"inspect-json={OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
