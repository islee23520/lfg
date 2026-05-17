#!/usr/bin/env python3
"""OMX-like MVP runtime for the linalab Grok Build plugin.

Dependency-free by design.  It gives Grok skills/MCP tools a concrete runtime for
stateful goal/plan/QA loops under ~/.grok/plugin-data/grok-build.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import subprocess
import shutil
import sys
import time
import uuid
import shlex
from typing import Any

ROOT = pathlib.Path(os.environ.get("GROK_PLUGIN_ROOT") or pathlib.Path(__file__).resolve().parents[1])
DATA = pathlib.Path(os.environ.get("GROK_PLUGIN_DATA") or pathlib.Path.home() / ".grok" / "plugin-data" / "grok-build")
STATE_DIR = DATA / "state"
RUNS_DIR = DATA / "runs"
CATALOG_PATH = ROOT / "catalog" / "omx-skill-map.json"


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def ensure_dirs() -> None:
    for p in (DATA, STATE_DIR, RUNS_DIR):
        p.mkdir(parents=True, exist_ok=True)


def jdump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)


def write_json(path: pathlib.Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(jdump(value) + "\n", encoding="utf-8")


def read_json(path: pathlib.Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def emit(value: Any, json_mode: bool) -> None:
    if json_mode:
        print(jdump(value))
    elif isinstance(value, str):
        print(value)
    else:
        print(jdump(value))


def detect_repo(cwd: pathlib.Path) -> dict[str, Any]:
    def run(cmd: list[str]) -> str | None:
        try:
            return subprocess.check_output(cmd, cwd=str(cwd), text=True, stderr=subprocess.DEVNULL).strip()
        except Exception:
            return None
    top = run(["git", "rev-parse", "--show-toplevel"])
    branch = run(["git", "branch", "--show-current"])
    head = run(["git", "rev-parse", "--short", "HEAD"])
    dirty = run(["git", "status", "--short"])
    return {
        "cwd": str(cwd),
        "gitRoot": top,
        "branch": branch,
        "head": head,
        "dirty": bool(dirty),
        "dirtyPreview": (dirty or "").splitlines()[:20],
    }


def goal_path(goal_id: str) -> pathlib.Path:
    return STATE_DIR / "goals" / f"{goal_id}.json"


def list_goals() -> list[dict[str, Any]]:
    goals = []
    for path in sorted((STATE_DIR / "goals").glob("*.json")):
        try:
            goals.append(read_json(path))
        except Exception:
            pass
    return goals


def create_goal(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    gid = args.id or f"grok-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    goal = {
        "id": gid,
        "objective": args.objective,
        "status": "active",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "checklist": [s.strip() for s in (args.checklist or "").split(";") if s.strip()],
        "events": [{"ts": now(), "type": "created", "message": args.objective}],
    }
    write_json(goal_path(gid), goal)
    write_json(STATE_DIR / "current-goal.json", {"id": gid, "path": str(goal_path(gid)), "updatedAt": now()})
    return goal


def update_goal(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-goal.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no goal id and no current goal")
    goal = read_json(goal_path(ref))
    if not goal:
        raise SystemExit(f"goal not found: {ref}")
    goal["status"] = args.status
    goal["updatedAt"] = now()
    goal.setdefault("events", []).append({"ts": now(), "type": "status", "status": args.status, "message": args.note or ""})
    write_json(goal_path(ref), goal)
    return goal


def mk_plan(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    steps = [s.strip() for s in re.split(r"\n|;", args.steps or "") if s.strip()]
    if not steps:
        steps = [
            "capture objective and constraints",
            "inspect current repo/plugin state",
            "implement smallest vertical slice",
            "run smoke verification",
            "install into ~/.grok/plugins/grok-build and inspect with real Grok",
            "commit and push evidence",
        ]
    plan = {
        "id": f"plan-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}",
        "title": args.title,
        "createdAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "steps": [{"id": i + 1, "status": "pending", "text": step} for i, step in enumerate(steps)],
    }
    path = STATE_DIR / "plans" / f"{plan['id']}.json"
    write_json(path, plan)
    write_json(STATE_DIR / "current-plan.json", {"id": plan["id"], "path": str(path), "updatedAt": now()})
    return plan


def catalog(_: argparse.Namespace) -> dict[str, Any]:
    data = read_json(CATALOG_PATH, {"skills": []})
    return {"pluginRoot": str(ROOT), "catalogPath": str(CATALOG_PATH), **data}


def status(args: argparse.Namespace) -> dict[str, Any]:
    goals = list_goals()
    return {
        "ok": True,
        "version": read_json(ROOT / ".grok-plugin" / "plugin.json", {}).get("version"),
        "pluginRoot": str(ROOT),
        "pluginData": str(DATA),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "catalogSkills": len(read_json(CATALOG_PATH, {"skills": []}).get("skills", [])),
        "goals": {"total": len(goals), "active": len([g for g in goals if g.get("status") == "active"])},
        "currentGoal": read_json(STATE_DIR / "current-goal.json", None),
        "currentPlan": read_json(STATE_DIR / "current-plan.json", None),
    }


def find_verify_commands(cwd: pathlib.Path) -> list[list[str]]:
    candidates: list[list[str]] = []
    if (cwd / "plugins" / "grok-harnessing" / "bin" / "self-test.sh").exists():
        candidates.append(["plugins/grok-harnessing/bin/self-test.sh"])
    if (cwd / "package.json").exists():
        pkg = read_json(cwd / "package.json", {})
        scripts = pkg.get("scripts", {}) if isinstance(pkg, dict) else {}
        for name in ("test", "lint", "typecheck"):
            if name in scripts:
                candidates.append(["npm", "run", name])
    if (cwd / "pyproject.toml").exists():
        candidates.append(["python3", "-m", "pytest", "-q"])
    if (cwd / "go.mod").exists():
        candidates.append(["go", "test", "./..."])
    return candidates[:3]


def run_cmd(cmd: list[str], cwd: pathlib.Path, timeout: int) -> dict[str, Any]:
    started = time.time()
    try:
        proc = subprocess.run(cmd, cwd=str(cwd), text=True, capture_output=True, timeout=timeout)
        return {
            "cmd": cmd,
            "returncode": proc.returncode,
            "durationSec": round(time.time() - started, 3),
            "stdoutTail": proc.stdout[-4000:],
            "stderrTail": proc.stderr[-4000:],
        }
    except subprocess.TimeoutExpired as exc:
        return {"cmd": cmd, "returncode": 124, "durationSec": timeout, "stdoutTail": (exc.stdout or "")[-4000:], "stderrTail": "timeout"}


def ultraqa(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    cwd = pathlib.Path(args.cwd).resolve()
    scenarios = [
        "plugin manifest JSON parses and declares grok-build identity",
        "MCP server initializes, lists tools, and handles catalog/status calls",
        "audit hook is fail-open and redacts obvious token markers",
        "real Grok inspect/list can discover installed plugin without relying on repo-only state",
        "repo remains plugin-only unless an executable runtime is intentionally added under bin/",
    ]
    commands = [] if args.no_run else (args.command or find_verify_commands(cwd))
    results = [run_cmd(cmd if isinstance(cmd, list) else [cmd], cwd, args.timeout) for cmd in commands]
    verdict = "pass" if results and all(r["returncode"] == 0 for r in results) else ("planned" if not results else "fail")
    run = {
        "id": f"ultraqa-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}",
        "createdAt": now(),
        "objective": args.objective,
        "repo": detect_repo(cwd),
        "scenarios": scenarios,
        "commands": commands,
        "results": results,
        "verdict": verdict,
    }
    write_json(RUNS_DIR / f"{run['id']}.json", run)
    write_json(STATE_DIR / "last-ultraqa.json", {"id": run["id"], "path": str(RUNS_DIR / f"{run['id']}.json"), "verdict": verdict, "updatedAt": now()})
    return run

def backend_name(args: argparse.Namespace) -> str:
    return args.name or "lfg-backend"


def require_executable(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise SystemExit(f"required executable not found: {name}")
    return path


def backend_start(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    require_executable("tmux")
    name = backend_name(args)
    cwd = pathlib.Path(args.cwd).resolve()
    exists = subprocess.run(["tmux", "has-session", "-t", name], text=True, capture_output=True).returncode == 0
    if not exists:
        subprocess.run([
            "tmux", "new-session", "-d", "-s", name, "-n", "lfg", "-c", str(cwd),
            "bash", "-lc", "echo 'lfg tmux backend ready'; echo 'use: lfg team create 3:executor \"task\"'; exec $SHELL"
        ], check=True)
    state = {"name": name, "status": "running", "cwd": str(cwd), "updatedAt": now(), "attachCommand": f"tmux attach -t {shlex.quote(name)}"}
    write_json(STATE_DIR / "backend.json", state)
    return state


def backend_status(args: argparse.Namespace) -> dict[str, Any]:
    name = backend_name(args)
    proc = subprocess.run(["tmux", "list-sessions"], text=True, capture_output=True)
    return {"name": name, "configured": read_json(STATE_DIR / "backend.json", None), "tmux": {"returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}}


def backend_stop(args: argparse.Namespace) -> dict[str, Any]:
    name = backend_name(args)
    proc = subprocess.run(["tmux", "kill-session", "-t", name], text=True, capture_output=True)
    state = {"name": name, "status": "stopped", "updatedAt": now(), "returncode": proc.returncode, "stderr": proc.stderr}
    write_json(STATE_DIR / "backend.json", state)
    return state

def team_dir() -> pathlib.Path:
    return STATE_DIR / "teams"


def parse_team_spec(spec: str) -> tuple[int, str]:
    if ":" in spec:
        n, role = spec.split(":", 1)
        return max(1, int(n)), role or "executor"
    return max(1, int(spec)), "executor"


def provider_command(provider: str, prompt: str) -> str:
    q = shlex.quote(prompt)
    if provider == "hermes":
        return f"hermes -z {q} chat"
    if provider == "claude":
        return f"claude --permission-mode bypassPermissions {q}"
    if provider == "codex":
        return f"codex {q}"
    return f"printf '%s\\n' 'unknown provider: {shlex.quote(provider)}'; exec $SHELL"


def team_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    cwd = pathlib.Path(args.cwd).resolve()
    count, role = parse_team_spec(args.spec)
    providers = [p.strip() for p in (args.providers or "hermes,claude,codex").split(",") if p.strip()]
    name = args.name or f"grok-team-{time.strftime('%Y%m%d-%H%M%S')}"
    objective = args.objective
    members = []
    for i in range(count):
        provider = providers[i % len(providers)]
        member_name = f"{role}-{i+1}-{provider}"
        member_prompt = (
            f"You are {member_name} in Grok Build team {name}. "
            f"Objective: {objective}. Work in {cwd}. "
            "Coordinate through git status, tests, and concise verification notes. "
            "Do not overwrite teammate work; inspect before editing."
        )
        members.append({
            "index": i + 1,
            "name": member_name,
            "role": role,
            "provider": provider,
            "prompt": member_prompt,
            "command": provider_command(provider, member_prompt),
        })
    team = {
        "name": name,
        "status": "planned" if args.dry_run else "running",
        "createdAt": now(),
        "updatedAt": now(),
        "objective": objective,
        "cwd": str(cwd),
        "tmuxSession": name,
        "members": members,
        "commands": {
            "status": f"tmux list-windows -t {shlex.quote(name)}",
            "attach": f"tmux attach -t {shlex.quote(name)}",
            "shutdown": f"tmux kill-session -t {shlex.quote(name)}",
        },
    }
    write_json(team_dir() / f"{name}.json", team)
    write_json(STATE_DIR / "current-team.json", {"name": name, "path": str(team_dir() / f"{name}.json"), "updatedAt": now()})
    if not args.dry_run:
        require_executable("tmux")
        subprocess.run(["tmux", "new-session", "-d", "-s", name, "-n", "control", "-c", str(cwd), "bash", "-lc", f"echo 'grok-build team {name}'; echo {shlex.quote(objective)}; exec $SHELL"], check=True)
        for m in members:
            subprocess.run(["tmux", "new-window", "-t", name, "-n", m["name"][:20], "-c", str(cwd), "bash", "-lc", m["command"]], check=True)
    return team


def team_status(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.name or (read_json(STATE_DIR / "current-team.json", {}) or {}).get("name")
    if not ref:
        return {"teams": [read_json(p) for p in sorted(team_dir().glob("*.json"))] if team_dir().exists() else []}
    team = read_json(team_dir() / f"{ref}.json")
    if not team:
        raise SystemExit(f"team not found: {ref}")
    proc = subprocess.run(["tmux", "list-windows", "-t", ref], text=True, capture_output=True)
    team["tmux"] = {"returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}
    return team


def team_resume(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.name or (read_json(STATE_DIR / "current-team.json", {}) or {}).get("name")
    if not ref:
        raise SystemExit("no team name and no current team")
    return {"team": ref, "attachCommand": f"tmux attach -t {shlex.quote(ref)}", "statusCommand": f"tmux list-windows -t {shlex.quote(ref)}"}


def team_shutdown(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.name or (read_json(STATE_DIR / "current-team.json", {}) or {}).get("name")
    if not ref:
        raise SystemExit("no team name and no current team")
    proc = subprocess.run(["tmux", "kill-session", "-t", ref], text=True, capture_output=True)
    path = team_dir() / f"{ref}.json"
    team = read_json(path, {"name": ref})
    team["status"] = "shutdown"
    team["updatedAt"] = now()
    team["shutdown"] = {"returncode": proc.returncode, "stderr": proc.stderr}
    write_json(path, team)
    return team



def doctor(args: argparse.Namespace) -> dict[str, Any]:
    """Diagnose the local grok-build plugin/runtime installation."""
    ensure_dirs()
    checks = []

    def add(name: str, ok: bool, evidence: str, required: bool = True) -> None:
        checks.append({"name": name, "ok": bool(ok), "required": required, "evidence": evidence})

    manifest = ROOT / ".grok-plugin" / "plugin.json"
    add("grok_manifest", manifest.exists(), str(manifest))
    mcp_config = ROOT / ".mcp.json"
    add("mcp_config", mcp_config.exists(), str(mcp_config))
    catalog_file = ROOT / "catalog" / "omx-skill-map.json"
    catalog_data = read_json(catalog_file, {"skills": []})
    add("catalog", catalog_file.exists() and len(catalog_data.get("skills", [])) >= 28, f"{catalog_file} skills={len(catalog_data.get('skills', []))}")
    skills_dir = ROOT / "skills"
    skill_count = len(list(skills_dir.glob("*/SKILL.md"))) if skills_dir.exists() else 0
    add("skills", skill_count >= 28, f"{skills_dir} skill_count={skill_count}")
    for exe, required in [("tmux", True), ("hermes", False), ("claude", False), ("codex", False), ("grok", False)]:
        path = shutil.which(exe)
        add(f"exe:{exe}", bool(path), path or "not found", required=required)
    data_ok = DATA.exists() or DATA.parent.exists()
    add("plugin_data", data_ok, str(DATA), required=True)
    failed_required = [c for c in checks if c["required"] and not c["ok"]]
    warnings = [c for c in checks if not c["required"] and not c["ok"]]
    return {
        "ok": not failed_required,
        "status": "pass" if not failed_required else "fail",
        "pluginRoot": str(ROOT),
        "pluginData": str(DATA),
        "checks": checks,
        "failedRequired": failed_required,
        "warnings": warnings,
    }

def slash(args: argparse.Namespace) -> dict[str, Any]:
    """Parse a Grok slash-command string into an LFG runtime action.

    MVP target: /team 3:executor "task", /team status NAME, /team resume NAME,
    /team shutdown NAME.  This lets a Grok skill map user-visible slash syntax to
    the durable tmux backend without duplicating parsing logic in prompt text.
    """
    raw = args.command.strip()
    if not raw.startswith("/"):
        raise SystemExit("slash command must start with /")
    parts = shlex.split(raw)
    if not parts:
        raise SystemExit("empty slash command")
    name = parts[0][1:]
    if name != "team":
        raise SystemExit(f"unsupported slash command: /{name}")
    rest = parts[1:]
    if not rest:
        return team_status(argparse.Namespace(name=None, cwd=args.cwd))
    verb = rest[0]
    if verb in {"status", "resume", "shutdown"}:
        target = rest[1] if len(rest) > 1 else None
        ns = argparse.Namespace(name=target, cwd=args.cwd)
        if verb == "status":
            return team_status(ns)
        if verb == "resume":
            return team_resume(ns)
        return team_shutdown(ns)
    if len(rest) < 2:
        raise SystemExit('usage: /team 3:executor "objective"')
    return team_create(argparse.Namespace(
        spec=rest[0],
        objective=" ".join(rest[1:]),
        name=args.name,
        providers=args.providers,
        dry_run=args.dry_run,
        cwd=args.cwd,
    ))

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="grok-build", description="OMX-like MVP runtime for Grok Build plugin")
    p.add_argument("--json", action="store_true")
    p.add_argument("--cwd", default=os.getcwd())
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("catalog").set_defaults(fn=catalog)
    sub.add_parser("status").set_defaults(fn=status)
    sub.add_parser("doctor").set_defaults(fn=doctor)

    gp = sub.add_parser("goal")
    gsub = gp.add_subparsers(dest="goal_cmd", required=True)
    gnew = gsub.add_parser("create")
    gnew.add_argument("objective")
    gnew.add_argument("--id")
    gnew.add_argument("--checklist")
    gnew.set_defaults(fn=create_goal)
    gls = gsub.add_parser("list")
    gls.set_defaults(fn=lambda args: {"goals": list_goals()})
    gupd = gsub.add_parser("update")
    gupd.add_argument("--id")
    gupd.add_argument("--status", choices=["active", "blocked", "complete", "cancelled"], required=True)
    gupd.add_argument("--note")
    gupd.set_defaults(fn=update_goal)

    pp = sub.add_parser("plan")
    pp.add_argument("title")
    pp.add_argument("--steps")
    pp.set_defaults(fn=mk_plan)

    uq = sub.add_parser("ultraqa")
    uq.add_argument("objective")
    uq.add_argument("--no-run", action="store_true")
    uq.add_argument("--timeout", type=int, default=60)
    uq.add_argument("--command", action="append", nargs="+")
    uq.set_defaults(fn=ultraqa)


    sp = sub.add_parser("slash")
    sp.add_argument("command", help='slash command, e.g. /team 3:executor "fix tests"')
    sp.add_argument("--name")
    sp.add_argument("--providers", default="hermes,claude,codex")
    sp.add_argument("--dry-run", action="store_true")
    sp.set_defaults(fn=slash)

    bp = sub.add_parser("backend")
    bsub = bp.add_subparsers(dest="backend_cmd", required=True)
    bs = bsub.add_parser("start")
    bs.add_argument("--name")
    bs.set_defaults(fn=backend_start)
    bst = bsub.add_parser("status")
    bst.add_argument("--name")
    bst.set_defaults(fn=backend_status)
    bx = bsub.add_parser("stop")
    bx.add_argument("--name")
    bx.set_defaults(fn=backend_stop)

    tp = sub.add_parser("team")
    tsub = tp.add_subparsers(dest="team_cmd", required=True)
    tc = tsub.add_parser("create")
    tc.add_argument("spec", help="team spec like 3:executor")
    tc.add_argument("objective")
    tc.add_argument("--name")
    tc.add_argument("--providers", default="hermes,claude,codex", help="comma list, default hermes,claude,codex")
    tc.add_argument("--dry-run", action="store_true")
    tc.set_defaults(fn=team_create)
    ts = tsub.add_parser("status")
    ts.add_argument("name", nargs="?")
    ts.set_defaults(fn=team_status)
    tr = tsub.add_parser("resume")
    tr.add_argument("name", nargs="?")
    tr.set_defaults(fn=team_resume)
    td = tsub.add_parser("shutdown")
    td.add_argument("name", nargs="?")
    td.set_defaults(fn=team_shutdown)

    args = p.parse_args(argv)
    result = args.fn(args)
    emit(result, args.json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
