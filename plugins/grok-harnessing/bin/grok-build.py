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
STATE_SCHEMA_VERSION = 1


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def state_schema_path() -> pathlib.Path:
    return STATE_DIR / "schema.json"


def ensure_state_schema() -> dict[str, Any]:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    path = state_schema_path()
    current = read_json(path, {}) if path.exists() else {}
    previous = current.get("version")
    migrations = list(current.get("migrations", [])) if isinstance(current.get("migrations"), list) else []
    if previous != STATE_SCHEMA_VERSION:
        migrations.append({"ts": now(), "from": previous, "to": STATE_SCHEMA_VERSION})
    schema = {
        "name": "grok-build-state",
        "version": STATE_SCHEMA_VERSION,
        "createdAt": current.get("createdAt") or now(),
        "updatedAt": now(),
        "stateDir": str(STATE_DIR),
        "runsDir": str(RUNS_DIR),
        "migrations": migrations,
    }
    path.write_text(jdump(schema) + "\n", encoding="utf-8")
    return schema


def ensure_dirs() -> None:
    for p in (DATA, STATE_DIR, RUNS_DIR):
        p.mkdir(parents=True, exist_ok=True)
    ensure_state_schema()


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
















def ultrawork_dir() -> pathlib.Path:
    return RUNS_DIR / "ultrawork"


def ultrawork_path(uid: str) -> pathlib.Path:
    return ultrawork_dir() / f"{uid}.json"


def ultrawork_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    uid = args.id or f"ultrawork-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    tasks = [t.strip() for t in re.split(r"\n|;", args.tasks or "") if t.strip()] or [args.objective]
    rec = {
        "id": uid,
        "objective": args.objective,
        "status": "active",
        "createdAt": now(),
        "updatedAt": now(),
        "tasks": [{"id": i + 1, "task": t, "status": "pending", "evidence": ""} for i, t in enumerate(tasks)],
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(ultrawork_path(uid), rec)
    write_json(STATE_DIR / "current-ultrawork.json", {"id": uid, "path": str(ultrawork_path(uid)), "updatedAt": now()})
    rec["path"] = str(ultrawork_path(uid))
    return rec


def ultrawork_update(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ultrawork.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no ultrawork id and no current ultrawork batch")
    rec = read_json(ultrawork_path(ref))
    if not rec:
        raise SystemExit(f"ultrawork batch not found: {ref}")
    idx = args.task - 1
    if idx < 0 or idx >= len(rec.get("tasks", [])):
        raise SystemExit(f"task out of range: {args.task}")
    rec["tasks"][idx]["status"] = args.status
    rec["tasks"][idx]["evidence"] = args.evidence or ""
    if all(t.get("status") == "complete" for t in rec.get("tasks", [])):
        rec["status"] = "complete"
    elif any(t.get("status") == "blocked" for t in rec.get("tasks", [])):
        rec["status"] = "blocked"
    else:
        rec["status"] = "active"
    rec["updatedAt"] = now()
    write_json(ultrawork_path(ref), rec)
    rec["path"] = str(ultrawork_path(ref))
    return rec


def ultrawork_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ultrawork.json", {}) or {}).get("id")
    if not ref:
        return {"ultrawork": []}
    rec = read_json(ultrawork_path(ref))
    if not rec:
        raise SystemExit(f"ultrawork batch not found: {ref}")
    rec["path"] = str(ultrawork_path(ref))
    return rec

def ralph_dir() -> pathlib.Path:
    return RUNS_DIR / "ralph"


def ralph_path(rid: str) -> pathlib.Path:
    return ralph_dir() / f"{rid}.json"


def ralph_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    rid = args.id or f"ralph-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    record = {
        "id": rid,
        "objective": args.objective,
        "status": "active",
        "iteration": 0,
        "maxIterations": args.max_iterations,
        "stopCondition": args.stop_condition or "verification passes and no blockers remain",
        "createdAt": now(),
        "updatedAt": now(),
        "events": [{"ts": now(), "type": "created", "objective": args.objective}],
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(ralph_path(rid), record)
    write_json(STATE_DIR / "current-ralph.json", {"id": rid, "path": str(ralph_path(rid)), "updatedAt": now()})
    record["path"] = str(ralph_path(rid))
    return record


def ralph_step(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ralph.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no ralph id and no current ralph loop")
    record = read_json(ralph_path(ref))
    if not record:
        raise SystemExit(f"ralph loop not found: {ref}")
    record["iteration"] = int(record.get("iteration", 0)) + 1
    record["status"] = args.status
    record["updatedAt"] = now()
    record.setdefault("events", []).append({"ts": now(), "type": "step", "iteration": record["iteration"], "status": args.status, "evidence": args.evidence})
    if record["iteration"] >= int(record.get("maxIterations", 1)) and args.status != "complete":
        record["status"] = "blocked"
    write_json(ralph_path(ref), record)
    record["path"] = str(ralph_path(ref))
    return record


def ralph_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ralph.json", {}) or {}).get("id")
    if not ref:
        return {"ralph": []}
    record = read_json(ralph_path(ref))
    if not record:
        raise SystemExit(f"ralph loop not found: {ref}")
    record["path"] = str(ralph_path(ref))
    return record

def workers_dir() -> pathlib.Path:
    return STATE_DIR / "workers"


def worker_path(worker_id: str) -> pathlib.Path:
    return workers_dir() / f"{slugify(worker_id)}.json"


def worker_ack(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    wid = args.worker
    rec = read_json(worker_path(wid), {"worker": wid, "events": []})
    rec.update({"worker": wid, "status": "ack", "task": args.task, "updatedAt": now()})
    rec.setdefault("events", []).append({"ts": now(), "type": "ack", "task": args.task})
    write_json(worker_path(wid), rec)
    rec["path"] = str(worker_path(wid))
    return rec


def worker_result(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    wid = args.worker
    rec = read_json(worker_path(wid), {"worker": wid, "events": []})
    rec.update({"worker": wid, "status": args.status, "result": args.result, "updatedAt": now()})
    rec.setdefault("events", []).append({"ts": now(), "type": "result", "status": args.status, "result": args.result})
    write_json(worker_path(wid), rec)
    rec["path"] = str(worker_path(wid))
    return rec


def worker_status(args: argparse.Namespace) -> dict[str, Any]:
    if args.worker:
        rec = read_json(worker_path(args.worker))
        if not rec:
            raise SystemExit(f"worker not found: {args.worker}")
        rec["path"] = str(worker_path(args.worker))
        return rec
    workers = []
    for path in sorted(workers_dir().glob("*.json")) if workers_dir().exists() else []:
        item = read_json(path)
        item["path"] = str(path)
        workers.append(item)
    return {"count": len(workers), "workers": workers}

def cleanup_dir() -> pathlib.Path:
    return RUNS_DIR / "ai-slop-cleaner"


def ai_slop_cleaner(args: argparse.Namespace) -> dict[str, Any]:
    """Create a durable cleanup/deslop report; no automatic edits in MVP."""
    ensure_dirs()
    scope = [x.strip() for x in (args.scope or "").split(",") if x.strip()]
    if not scope:
        scope = ["repo"]
    report_id = f"cleanup-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    fallback_findings = []
    for item in scope:
        path = pathlib.Path(args.cwd).resolve() / item
        if path.exists() and path.is_file():
            text = path.read_text(errors="ignore")[:20000]
            if re.search(r"fallback|workaround|TODO|FIXME", text, re.I):
                fallback_findings.append({"path": item, "signal": "fallback/workaround/TODO/FIXME"})
    report = {
        "id": report_id,
        "createdAt": now(),
        "scope": scope,
        "status": "planned",
        "behaviorLock": args.verification or "not run",
        "fallbackFindings": fallback_findings,
        "passes": [],
        "qualityGate": {"status": "planned", "evidence": "MVP records cleanup plan only; no automatic edits."},
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    path = cleanup_dir() / f"{report_id}.json"
    write_json(path, report)
    write_json(STATE_DIR / "last-cleanup.json", {"id": report_id, "path": str(path), "updatedAt": now()})
    report["path"] = str(path)
    return report


def ai_slop_cleaner_list(args: argparse.Namespace) -> dict[str, Any]:
    reports = []
    for path in sorted(cleanup_dir().glob("*.json")) if cleanup_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            reports.append(item)
        except Exception:
            pass
    if args.limit:
        reports = reports[-args.limit:]
    return {"count": len(reports), "reports": reports}

def research_dir() -> pathlib.Path:
    return RUNS_DIR / "autoresearch"


def research_path(rid: str) -> pathlib.Path:
    return research_dir() / f"{rid}.json"


def autoresearch_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    rid = args.id or f"research-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    record = {
        "id": rid,
        "question": args.question,
        "status": "open",
        "createdAt": now(),
        "updatedAt": now(),
        "sources": [],
        "findings": [],
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(research_path(rid), record)
    write_json(STATE_DIR / "current-research.json", {"id": rid, "path": str(research_path(rid)), "updatedAt": now()})
    record["path"] = str(research_path(rid))
    return record


def autoresearch_add_source(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-research.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no research id and no current research")
    record = read_json(research_path(ref))
    if not record:
        raise SystemExit(f"research not found: {ref}")
    record.setdefault("sources", []).append({"url": args.url, "note": args.note or "", "addedAt": now()})
    record["updatedAt"] = now()
    write_json(research_path(ref), record)
    record["path"] = str(research_path(ref))
    return record


def autoresearch_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-research.json", {}) or {}).get("id")
    if not ref:
        return {"research": []}
    record = read_json(research_path(ref))
    if not record:
        raise SystemExit(f"research not found: {ref}")
    record["path"] = str(research_path(ref))
    return record

def interviews_dir() -> pathlib.Path:
    return DATA / "interviews"


def interview_path(iid: str) -> pathlib.Path:
    return interviews_dir() / f"{iid}.json"


def deep_interview_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    iid = args.id or f"interview-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    questions = [q.strip() for q in re.split(r"\n|;", args.questions or "") if q.strip()]
    if not questions:
        questions = [
            "What exact outcome should be true when this is done?",
            "What constraints or integrations must not be broken?",
            "What evidence should prove completion?",
        ]
    record = {
        "id": iid,
        "topic": args.topic,
        "status": "open",
        "createdAt": now(),
        "updatedAt": now(),
        "questions": [{"id": i + 1, "question": q, "answer": None} for i, q in enumerate(questions)],
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(interview_path(iid), record)
    write_json(STATE_DIR / "current-interview.json", {"id": iid, "path": str(interview_path(iid)), "updatedAt": now()})
    record["path"] = str(interview_path(iid))
    return record


def deep_interview_answer(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-interview.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no interview id and no current interview")
    record = read_json(interview_path(ref))
    if not record:
        raise SystemExit(f"interview not found: {ref}")
    idx = args.question - 1
    if idx < 0 or idx >= len(record.get("questions", [])):
        raise SystemExit(f"question out of range: {args.question}")
    record["questions"][idx]["answer"] = args.answer
    record["updatedAt"] = now()
    if all(q.get("answer") for q in record.get("questions", [])):
        record["status"] = "answered"
    write_json(interview_path(ref), record)
    record["path"] = str(interview_path(ref))
    return record


def deep_interview_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-interview.json", {}) or {}).get("id")
    if not ref:
        return {"interviews": []}
    record = read_json(interview_path(ref))
    if not record:
        raise SystemExit(f"interview not found: {ref}")
    record["path"] = str(interview_path(ref))
    return record

def design_dir() -> pathlib.Path:
    return DATA / "design"


def design_add(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    decision_id = f"design-{time.strftime('%Y%m%d-%H%M%S')}-{slugify(args.title)}"
    record = {
        "id": decision_id,
        "title": args.title,
        "decision": args.decision,
        "rationale": args.rationale or "",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    path = design_dir() / f"{decision_id}.json"
    write_json(path, record)
    write_json(STATE_DIR / "last-design.json", {"id": decision_id, "path": str(path), "updatedAt": now()})
    record["path"] = str(path)
    return record


def design_list(args: argparse.Namespace) -> dict[str, Any]:
    items = []
    for path in sorted(design_dir().glob("*.json")) if design_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            items.append(item)
        except Exception:
            pass
    if args.limit:
        items = items[-args.limit:]
    return {"count": len(items), "decisions": items}

def notifications_path() -> pathlib.Path:
    return STATE_DIR / "notifications.json"


def notifications_set(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    config = {
        "enabled": bool(args.enabled),
        "channel": args.channel,
        "target": args.target,
        "updatedAt": now(),
        "dryRunOnly": True,
    }
    write_json(notifications_path(), config)
    return {"ok": True, "config": config, "path": str(notifications_path())}


def notifications_show(args: argparse.Namespace) -> dict[str, Any]:
    config = read_json(notifications_path(), {"enabled": False, "channel": "none", "target": None, "dryRunOnly": True})
    return {"ok": True, "config": config, "path": str(notifications_path())}

def asks_dir() -> pathlib.Path:
    return RUNS_DIR / "ask"


def ask(args: argparse.Namespace) -> dict[str, Any]:
    """Record or run an external-advisor ask request; dry-run by default."""
    ensure_dirs()
    provider = args.provider or "hermes"
    prompt = args.prompt
    req_id = f"ask-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    commands = {
        "hermes": ["hermes", "-z", prompt, "chat"],
        "claude": ["claude", "-p", prompt],
        "codex": ["codex", "exec", prompt],
    }
    cmd = commands.get(provider, [provider, prompt])
    result = None
    if not args.dry_run:
        proc = subprocess.run(cmd, cwd=str(pathlib.Path(args.cwd).resolve()), text=True, capture_output=True, timeout=args.timeout)
        result = {"returncode": proc.returncode, "stdoutTail": proc.stdout[-4000:], "stderrTail": proc.stderr[-4000:]}
    record = {
        "id": req_id,
        "createdAt": now(),
        "provider": provider,
        "prompt": prompt,
        "dryRun": args.dry_run,
        "command": cmd,
        "result": result,
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    path = asks_dir() / f"{req_id}.json"
    write_json(path, record)
    write_json(STATE_DIR / "last-ask.json", {"id": req_id, "path": str(path), "updatedAt": now()})
    record["path"] = str(path)
    return record


def ask_list(args: argparse.Namespace) -> dict[str, Any]:
    items = []
    for path in sorted(asks_dir().glob("*.json")) if asks_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            items.append(item)
        except Exception:
            pass
    if args.limit:
        items = items[-args.limit:]
    return {"count": len(items), "asks": items}

def analyses_dir() -> pathlib.Path:
    return RUNS_DIR / "analyze"


def analyze(args: argparse.Namespace) -> dict[str, Any]:
    """Create a lightweight durable repo analysis report."""
    ensure_dirs()
    cwd = pathlib.Path(args.cwd).resolve()
    tracked = []
    try:
        tracked = subprocess.check_output(["git", "ls-files"], cwd=str(cwd), text=True, stderr=subprocess.DEVNULL).splitlines()
    except Exception:
        tracked = [str(p.relative_to(cwd)) for p in cwd.rglob("*") if p.is_file() and ".git" not in p.parts]
    by_ext: dict[str, int] = {}
    for rel in tracked:
        ext = pathlib.Path(rel).suffix or "[no-ext]"
        by_ext[ext] = by_ext.get(ext, 0) + 1
    focus = args.focus or "repo surface"
    report_id = f"analyze-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    report = {
        "id": report_id,
        "createdAt": now(),
        "focus": focus,
        "repo": detect_repo(cwd),
        "fileCount": len(tracked),
        "extensions": dict(sorted(by_ext.items(), key=lambda x: (-x[1], x[0]))[:20]),
        "keyPaths": [p for p in tracked if p in {"README.md", "ROADMAP.md"} or p.startswith("plugins/grok-harnessing/")][:40],
        "summary": f"Lightweight analysis for {focus}: {len(tracked)} tracked files, {len(by_ext)} extension groups.",
    }
    path = analyses_dir() / f"{report_id}.json"
    write_json(path, report)
    write_json(STATE_DIR / "last-analyze.json", {"id": report_id, "path": str(path), "updatedAt": now()})
    report["path"] = str(path)
    return report


def analyze_list(args: argparse.Namespace) -> dict[str, Any]:
    reports = []
    for path in sorted(analyses_dir().glob("*.json")) if analyses_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            reports.append(item)
        except Exception:
            pass
    if args.limit:
        reports = reports[-args.limit:]
    return {"count": len(reports), "reports": reports}

def reviews_dir() -> pathlib.Path:
    return RUNS_DIR / "code-review"


def code_review(args: argparse.Namespace) -> dict[str, Any]:
    """Create a lightweight durable review report from repo status/diff stats."""
    ensure_dirs()
    cwd = pathlib.Path(args.cwd).resolve()
    def git(cmd: list[str]) -> str:
        try:
            return subprocess.check_output(["git", *cmd], cwd=str(cwd), text=True, stderr=subprocess.DEVNULL).strip()
        except Exception:
            return ""
    status_text = git(["status", "--short"])
    diff_stat = git(["diff", "--stat"])
    name_only = git(["diff", "--name-only"])
    files = [x for x in name_only.splitlines() if x.strip()]
    report_id = f"code-review-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    recommendation = "COMMENT" if files else "APPROVE"
    architect_status = "WATCH" if files else "CLEAR"
    report = {
        "id": report_id,
        "createdAt": now(),
        "objective": args.objective,
        "repo": detect_repo(cwd),
        "filesChanged": files,
        "statusShort": status_text.splitlines(),
        "diffStat": diff_stat,
        "codeReview": {
            "recommendation": recommendation,
            "architectStatus": architect_status,
            "evidence": "Lightweight runtime review based on git status/diff stat; use full reviewer workflow before merge."
        },
        "findings": [] if not files else [{"severity": "LOW", "message": "Uncommitted diff exists; run targeted verification and full review before merge."}],
    }
    path = reviews_dir() / f"{report_id}.json"
    write_json(path, report)
    write_json(STATE_DIR / "last-code-review.json", {"id": report_id, "path": str(path), "updatedAt": now()})
    report["path"] = str(path)
    return report


def code_review_list(args: argparse.Namespace) -> dict[str, Any]:
    reports = []
    for path in sorted(reviews_dir().glob("*.json")) if reviews_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            reports.append(item)
        except Exception:
            pass
    if args.limit:
        reports = reports[-args.limit:]
    return {"count": len(reports), "reports": reports}

def pipeline_dir() -> pathlib.Path:
    return STATE_DIR / "pipelines"


def pipeline_path(pid: str) -> pathlib.Path:
    return pipeline_dir() / f"{pid}.json"


def pipeline_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    stages = [x.strip() for x in re.split(r"\n|;", args.stages or "") if x.strip()]
    if not stages:
        stages = ["plan", "implement", "verify"]
    pid = args.id or f"pipeline-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    pipeline = {
        "id": pid,
        "title": args.title,
        "status": "active",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "stages": [{"id": i + 1, "name": stage, "status": "pending"} for i, stage in enumerate(stages)],
        "events": [{"ts": now(), "type": "created", "message": args.title}],
    }
    write_json(pipeline_path(pid), pipeline)
    write_json(STATE_DIR / "current-pipeline.json", {"id": pid, "path": str(pipeline_path(pid)), "updatedAt": now()})
    return pipeline


def pipeline_list(args: argparse.Namespace) -> dict[str, Any]:
    items = []
    for path in sorted(pipeline_dir().glob("*.json")) if pipeline_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            items.append(item)
        except Exception:
            pass
    if args.limit:
        items = items[-args.limit:]
    return {"count": len(items), "pipelines": items}


def pipeline_update(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-pipeline.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no pipeline id and no current pipeline")
    item = read_json(pipeline_path(ref))
    if not item:
        raise SystemExit(f"pipeline not found: {ref}")
    if args.stage is not None:
        idx = args.stage - 1
        if idx < 0 or idx >= len(item.get("stages", [])):
            raise SystemExit(f"stage out of range: {args.stage}")
        item["stages"][idx]["status"] = args.status
    if all(s.get("status") == "complete" for s in item.get("stages", [])):
        item["status"] = "complete"
    elif any(s.get("status") == "blocked" for s in item.get("stages", [])):
        item["status"] = "blocked"
    else:
        item["status"] = "active"
    item["updatedAt"] = now()
    item.setdefault("events", []).append({"ts": now(), "type": "stage", "stage": args.stage, "status": args.status, "message": args.note or ""})
    write_json(pipeline_path(ref), item)
    return item


def autopilot_dir() -> pathlib.Path:
    return RUNS_DIR / "autopilot"


def autopilot_path(aid: str) -> pathlib.Path:
    return autopilot_dir() / f"{aid}.json"


def autopilot_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    aid = args.id or f"autopilot-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    phases = [
        {"id": 1, "name": "plan", "workflow": "ralplan", "status": "pending", "evidence": ""},
        {"id": 2, "name": "execute", "workflow": "ralph", "status": "pending", "evidence": ""},
        {"id": 3, "name": "review", "workflow": "code-review", "status": "pending", "evidence": ""},
    ]
    record = {
        "id": aid,
        "objective": args.objective,
        "status": "active",
        "currentPhase": "plan",
        "strictOrder": True,
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "phases": phases,
        "events": [{"ts": now(), "type": "created", "objective": args.objective}],
    }
    write_json(autopilot_path(aid), record)
    write_json(STATE_DIR / "current-autopilot.json", {"id": aid, "path": str(autopilot_path(aid)), "updatedAt": now()})
    record["path"] = str(autopilot_path(aid))
    return record


def autopilot_advance(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-autopilot.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no autopilot id and no current autopilot run")
    record = read_json(autopilot_path(ref))
    if not record:
        raise SystemExit(f"autopilot run not found: {ref}")
    phases = record.get("phases", [])
    idx = args.phase - 1
    if idx < 0 or idx >= len(phases):
        raise SystemExit(f"phase out of range: {args.phase}")
    if args.status == "complete" and idx > 0 and phases[idx - 1].get("status") != "complete":
        raise SystemExit(f"strict order violation: phase {args.phase - 1} is not complete")
    phases[idx]["status"] = args.status
    phases[idx]["evidence"] = args.evidence or ""
    if all(p.get("status") == "complete" for p in phases):
        record["status"] = "complete"
        record["currentPhase"] = "done"
    elif any(p.get("status") == "blocked" for p in phases):
        record["status"] = "blocked"
        record["currentPhase"] = phases[idx]["name"]
    else:
        record["status"] = "active"
        pending = next((p for p in phases if p.get("status") != "complete"), phases[-1])
        record["currentPhase"] = pending["name"]
    record["updatedAt"] = now()
    record.setdefault("events", []).append({"ts": now(), "type": "advance", "phase": args.phase, "status": args.status, "evidence": args.evidence or ""})
    write_json(autopilot_path(ref), record)
    record["path"] = str(autopilot_path(ref))
    return record


def autopilot_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-autopilot.json", {}) or {}).get("id")
    if not ref:
        return {"autopilot": []}
    record = read_json(autopilot_path(ref))
    if not record:
        raise SystemExit(f"autopilot run not found: {ref}")
    record["path"] = str(autopilot_path(ref))
    return record


def performance_dir() -> pathlib.Path:
    return RUNS_DIR / "performance-goal"


def performance_path(pid: str) -> pathlib.Path:
    return performance_dir() / f"{pid}.json"


def performance_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    pid = args.id or f"performance-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    metrics = [m.strip() for m in re.split(r"\n|;", args.metrics or "") if m.strip()] or ["latency", "throughput", "error-rate"]
    record = {
        "id": pid,
        "objective": args.objective,
        "status": "active",
        "gate": "needs-baseline",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "metrics": [{"name": name, "baseline": None, "current": None, "target": None, "status": "pending"} for name in metrics],
        "measurements": [],
    }
    write_json(performance_path(pid), record)
    write_json(STATE_DIR / "current-performance-goal.json", {"id": pid, "path": str(performance_path(pid)), "updatedAt": now()})
    record["path"] = str(performance_path(pid))
    return record


def performance_measure(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-performance-goal.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no performance-goal id and no current performance goal")
    record = read_json(performance_path(ref))
    if not record:
        raise SystemExit(f"performance-goal not found: {ref}")
    matched = None
    for metric in record.get("metrics", []):
        if metric.get("name") == args.metric:
            matched = metric
            break
    if matched is None:
        matched = {"name": args.metric, "baseline": None, "current": None, "target": None, "status": "pending"}
        record.setdefault("metrics", []).append(matched)
    if args.baseline is not None:
        matched["baseline"] = args.baseline
    if args.current is not None:
        matched["current"] = args.current
    if args.target is not None:
        matched["target"] = args.target
    if matched.get("current") is None or matched.get("target") is None:
        matched["status"] = "pending"
    elif float(matched["current"]) <= float(matched["target"]):
        matched["status"] = "pass"
    else:
        matched["status"] = "fail"
    record.setdefault("measurements", []).append({"ts": now(), "metric": args.metric, "baseline": args.baseline, "current": args.current, "target": args.target, "evidence": args.evidence or ""})
    statuses = [m.get("status") for m in record.get("metrics", [])]
    if statuses and all(st == "pass" for st in statuses):
        record["status"] = "complete"
        record["gate"] = "pass"
    elif any(st == "fail" for st in statuses):
        record["status"] = "active"
        record["gate"] = "fail"
    else:
        record["status"] = "active"
        record["gate"] = "needs-measurement"
    record["updatedAt"] = now()
    write_json(performance_path(ref), record)
    record["path"] = str(performance_path(ref))
    return record


def performance_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-performance-goal.json", {}) or {}).get("id")
    if not ref:
        return {"performanceGoals": []}
    record = read_json(performance_path(ref))
    if not record:
        raise SystemExit(f"performance-goal not found: {ref}")
    record["path"] = str(performance_path(ref))
    return record


def visual_ralph_dir() -> pathlib.Path:
    return RUNS_DIR / "visual-ralph"


def visual_ralph_path(vid: str) -> pathlib.Path:
    return visual_ralph_dir() / f"{vid}.json"


def visual_ralph_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    vid = args.id or f"visual-ralph-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    record = {
        "id": vid,
        "target": args.target,
        "reference": args.reference or "",
        "status": "active",
        "iteration": 0,
        "threshold": args.threshold,
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "verdicts": [],
    }
    write_json(visual_ralph_path(vid), record)
    write_json(STATE_DIR / "current-visual-ralph.json", {"id": vid, "path": str(visual_ralph_path(vid)), "updatedAt": now()})
    record["path"] = str(visual_ralph_path(vid))
    return record


def visual_ralph_verdict(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-visual-ralph.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no visual-ralph id and no current visual ralph run")
    record = read_json(visual_ralph_path(ref))
    if not record:
        raise SystemExit(f"visual-ralph run not found: {ref}")
    record["iteration"] = int(record.get("iteration", 0)) + 1
    verdict = {
        "ts": now(),
        "iteration": record["iteration"],
        "score": args.score,
        "threshold": record.get("threshold"),
        "status": args.status,
        "evidence": args.evidence or "",
    }
    record.setdefault("verdicts", []).append(verdict)
    if args.status == "pass" or float(args.score) >= float(record.get("threshold", 0.95)):
        record["status"] = "complete"
    elif args.status == "blocked":
        record["status"] = "blocked"
    else:
        record["status"] = "active"
    record["updatedAt"] = now()
    write_json(visual_ralph_path(ref), record)
    record["path"] = str(visual_ralph_path(ref))
    return record


def visual_ralph_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-visual-ralph.json", {}) or {}).get("id")
    if not ref:
        return {"visualRalph": []}
    record = read_json(visual_ralph_path(ref))
    if not record:
        raise SystemExit(f"visual-ralph run not found: {ref}")
    record["path"] = str(visual_ralph_path(ref))
    return record


def autoresearch_goal_dir() -> pathlib.Path:
    return RUNS_DIR / "autoresearch-goal"


def autoresearch_goal_path(rid: str) -> pathlib.Path:
    return autoresearch_goal_dir() / f"{rid}.json"


def autoresearch_goal_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    rid = args.id or f"autoresearch-goal-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    record = {
        "id": rid,
        "question": args.question,
        "status": "active",
        "gate": "needs-critique",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "hypotheses": [h.strip() for h in re.split(r"\n|;", args.hypotheses or "") if h.strip()],
        "critiques": [],
    }
    write_json(autoresearch_goal_path(rid), record)
    write_json(STATE_DIR / "current-autoresearch-goal.json", {"id": rid, "path": str(autoresearch_goal_path(rid)), "updatedAt": now()})
    record["path"] = str(autoresearch_goal_path(rid))
    return record


def autoresearch_goal_critique(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-autoresearch-goal.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no autoresearch-goal id and no current autoresearch goal")
    record = read_json(autoresearch_goal_path(ref))
    if not record:
        raise SystemExit(f"autoresearch-goal not found: {ref}")
    critique = {"ts": now(), "verdict": args.verdict, "critic": args.critic or "critic", "evidence": args.evidence or ""}
    record.setdefault("critiques", []).append(critique)
    if args.verdict == "pass":
        record["status"] = "complete"
        record["gate"] = "pass"
    elif args.verdict == "blocked":
        record["status"] = "blocked"
        record["gate"] = "blocked"
    else:
        record["status"] = "active"
        record["gate"] = "revise"
    record["updatedAt"] = now()
    write_json(autoresearch_goal_path(ref), record)
    record["path"] = str(autoresearch_goal_path(ref))
    return record


def autoresearch_goal_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-autoresearch-goal.json", {}) or {}).get("id")
    if not ref:
        return {"autoresearchGoals": []}
    record = read_json(autoresearch_goal_path(ref))
    if not record:
        raise SystemExit(f"autoresearch-goal not found: {ref}")
    record["path"] = str(autoresearch_goal_path(ref))
    return record


def ralplan_dir() -> pathlib.Path:
    return RUNS_DIR / "ralplan"


def ralplan_path(rid: str) -> pathlib.Path:
    return ralplan_dir() / f"{rid}.json"


def ralplan_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    rid = args.id or f"ralplan-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    steps = [s.strip() for s in re.split(r"\n|;", args.steps or "") if s.strip()] or [
        "state objective and constraints",
        "propose implementation path",
        "define verification evidence",
    ]
    record = {
        "id": rid,
        "title": args.title,
        "status": "active",
        "consensus": "pending",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "steps": [{"id": i + 1, "status": "pending", "text": step} for i, step in enumerate(steps)],
        "reviews": [],
    }
    write_json(ralplan_path(rid), record)
    write_json(STATE_DIR / "current-ralplan.json", {"id": rid, "path": str(ralplan_path(rid)), "updatedAt": now()})
    record["path"] = str(ralplan_path(rid))
    return record


def ralplan_review(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ralplan.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no ralplan id and no current ralplan")
    record = read_json(ralplan_path(ref))
    if not record:
        raise SystemExit(f"ralplan not found: {ref}")
    review = {"ts": now(), "reviewer": args.reviewer or "architect", "verdict": args.verdict, "evidence": args.evidence or ""}
    record.setdefault("reviews", []).append(review)
    record["consensus"] = args.verdict
    record["status"] = "complete" if args.verdict == "approve" else ("blocked" if args.verdict == "block" else "active")
    record["updatedAt"] = now()
    write_json(ralplan_path(ref), record)
    record["path"] = str(ralplan_path(ref))
    return record


def ralplan_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ralplan.json", {}) or {}).get("id")
    if not ref:
        return {"ralplans": []}
    record = read_json(ralplan_path(ref))
    if not record:
        raise SystemExit(f"ralplan not found: {ref}")
    record["path"] = str(ralplan_path(ref))
    return record


def omx_setup_path() -> pathlib.Path:
    return STATE_DIR / "omx-setup.json"


def omx_setup_check(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    checks = {
        "pluginRootExists": ROOT.exists(),
        "manifestExists": (ROOT / ".grok-plugin" / "plugin.json").exists(),
        "skillsDirExists": (ROOT / "skills").exists(),
        "mcpExists": (ROOT / "bin" / "grok-build-mcp.py").exists(),
        "hookExists": (ROOT / "hooks").exists(),
        "dataDirExists": DATA.exists(),
    }
    record = {
        "status": "ok" if all(checks.values()) else "needs-action",
        "updatedAt": now(),
        "pluginRoot": str(ROOT),
        "pluginData": str(DATA),
        "checks": checks,
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(omx_setup_path(), record)
    return record


def omx_setup_plan(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    steps = [
        "add marketplace source in Grok /plugins",
        "install linalab-io-framework/grok-build",
        "enable plugin skills, hooks, and MCP server",
        "run /omx-setup check",
        "run runtime self-test and Grok inspect smoke",
    ]
    record = {
        "status": "planned",
        "updatedAt": now(),
        "marketplace": args.marketplace or "linalab-io-framework/grok-build",
        "steps": [{"id": i + 1, "status": "pending", "text": step} for i, step in enumerate(steps)],
    }
    write_json(omx_setup_path(), record)
    return record


def omx_setup_show(args: argparse.Namespace) -> dict[str, Any]:
    return read_json(omx_setup_path(), {"omxSetup": []})

def skill_list(args: argparse.Namespace) -> dict[str, Any]:
    data = read_json(CATALOG_PATH, {"skills": []})
    skills = data.get("skills", [])
    return {"count": len(skills), "skills": skills}


def skill_search(args: argparse.Namespace) -> dict[str, Any]:
    q = args.query.lower()
    data = read_json(CATALOG_PATH, {"skills": []})
    matches = []
    for skill in data.get("skills", []):
        haystack = json.dumps(skill, ensure_ascii=False).lower()
        if q in haystack:
            matches.append(skill)
    return {"query": args.query, "count": len(matches), "matches": matches}

def list_plans() -> list[dict[str, Any]]:
    plans = []
    for path in sorted((STATE_DIR / "plans").glob("*.json")) if (STATE_DIR / "plans").exists() else []:
        try:
            plan = read_json(path)
            plan["path"] = str(path)
            plans.append(plan)
        except Exception:
            pass
    return plans


def plan_list(args: argparse.Namespace) -> dict[str, Any]:
    plans = list_plans()
    if args.limit:
        plans = plans[-args.limit:]
    return {"count": len(plans), "plans": plans}

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



def hud(args: argparse.Namespace) -> dict[str, Any]:
    """Return a compact workflow status summary."""
    ensure_dirs()
    goals = list_goals()
    plans = list_plans()
    teams = [read_json(p) for p in sorted(team_dir().glob("*.json"))] if team_dir().exists() else []
    notes = wiki_notes()
    last_ultraqa = read_json(STATE_DIR / "last-ultraqa.json", None)
    last_cancel = read_json(STATE_DIR / "last-cancel.json", None)
    summary = {
        "ok": True,
        "plugin": "grok-build",
        "version": read_json(ROOT / ".grok-plugin" / "plugin.json", {}).get("version"),
        "pluginData": str(DATA),
        "counts": {
            "goals": len(goals),
            "activeGoals": len([g for g in goals if g.get("status") == "active"]),
            "plans": len(plans),
            "teams": len(teams),
            "wikiNotes": len(notes),
        },
        "current": {
            "goal": read_json(STATE_DIR / "current-goal.json", None),
            "plan": read_json(STATE_DIR / "current-plan.json", None),
            "team": read_json(STATE_DIR / "current-team.json", None),
            "lastUltraqa": last_ultraqa,
            "lastCancel": last_cancel,
        },
    }
    if args.text:
        summary["text"] = (
            f"grok-build {summary['version']} | goals {summary['counts']['goals']} "
            f"(active {summary['counts']['activeGoals']}) | plans {summary['counts']['plans']} | "
            f"teams {summary['counts']['teams']} | wiki {summary['counts']['wikiNotes']}"
        )
    return summary

def status(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
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


def current_tmux_pane() -> str | None:
    pane = (os.environ.get("TMUX_PANE") or "").strip()
    if re.fullmatch(r"%\d+", pane):
        return pane
    proc = subprocess.run(["tmux", "display-message", "-p", "#{pane_id}"], text=True, capture_output=True)
    candidate = proc.stdout.strip() if proc.returncode == 0 else ""
    if re.fullmatch(r"%\d+", candidate):
        return candidate
    return None


def attach_backend_from_tmux_pane(state: dict[str, Any], cwd: pathlib.Path) -> dict[str, Any]:
    pane = current_tmux_pane()
    state["attachMethod"] = "split-window"
    state["attached"] = False
    if not pane:
        state["attachMethod"] = "inside-tmux-unresolved-pane"
        state["note"] = "inside tmux but current pane could not be resolved; use attachCommand from the desired pane"
        return state
    command = f"env -u TMUX tmux attach-session -t {shlex.quote(state['name'])}"
    subprocess.run(["tmux", "split-window", "-h", "-t", pane, "-c", str(cwd), command], check=True)
    state["attached"] = True
    state["triggerPane"] = pane
    state["paneAttachCommand"] = f"tmux split-window -h -t {shlex.quote(pane)} -c {shlex.quote(str(cwd))} {shlex.quote(command)}"
    return state


def lfg_launch(args: argparse.Namespace) -> dict[str, Any]:
    """Default `lfg` behavior: start backend and attach when interactive."""
    state = backend_start(argparse.Namespace(name=args.name, cwd=args.cwd))
    state["launcher"] = "lfg"
    state["attached"] = False
    state["mode"] = "tmux-backend"
    if args.json or not (sys.stdin.isatty() and sys.stdout.isatty()):
        state["note"] = "non-interactive; run the attachCommand or execute `lfg` from a terminal to attach"
        return state
    if os.environ.get("TMUX"):
        return attach_backend_from_tmux_pane(state, pathlib.Path(args.cwd).resolve())
    os.execvp("tmux", ["tmux", "attach", "-t", state["name"]])
    raise SystemExit(0)

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


TEAM_PROVIDER_EXECUTABLES = {"hermes": "hermes", "claude": "claude", "codex": "codex", "noop": None}


def provider_command(provider: str, prompt: str) -> str:
    q = shlex.quote(prompt)
    if provider == "hermes":
        return f"hermes -z {q} chat"
    if provider == "claude":
        return f"claude --permission-mode bypassPermissions {q}"
    if provider == "codex":
        return f"codex {q}"
    if provider == "noop":
        return f"printf '%s\n' {shlex.quote('noop provider ready: ' + prompt)}; exec $SHELL"
    return f"printf '%s\n' 'unknown provider: {shlex.quote(provider)}'; exec $SHELL"


def team_provider_matrix() -> list[dict[str, Any]]:
    rows = []
    for provider, exe in TEAM_PROVIDER_EXECUTABLES.items():
        available = True if exe is None else bool(shutil.which(exe))
        rows.append({
            "provider": provider,
            "executable": exe or "builtin",
            "available": available,
            "required": False,
            "commandPreview": provider_command(provider, "TEAM_PROVIDER_SMOKE")[:240],
        })
    return rows


def team_providers(args: argparse.Namespace) -> dict[str, Any]:
    providers = team_provider_matrix()
    return {
        "ok": True,
        "providers": providers,
        "default": ["hermes", "claude", "codex"],
        "smokeSafe": "noop",
        "summary": {
            "available": [p["provider"] for p in providers if p["available"]],
            "missing": [p["provider"] for p in providers if not p["available"]],
        },
    }


def team_preflight(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    providers = team_provider_matrix()
    tmux_path = shutil.which("tmux")
    backend = backend_start(argparse.Namespace(name=getattr(args, "name", None), cwd=args.cwd))
    required_ok = bool(tmux_path) and backend.get("status") == "running"
    name = backend.get("name") or backend_name(args)
    return {
        "ok": required_ok,
        "tmux": {"available": bool(tmux_path), "path": tmux_path},
        "backend": backend,
        "providers": providers,
        "commands": {
            "createDryRun": "lfg team create 3:executor \"objective\" --dry-run",
            "createNoopSmoke": f"lfg team create 2:executor \"smoke objective\" --name {shlex.quote(name + '-team')} --providers noop",
            "backendAttach": backend.get("attachCommand") or f"tmux attach -t {shlex.quote(name)}",
            "backendStatus": f"tmux has-session -t {shlex.quote(name)}",
            "providers": "lfg team providers",
        },
        "summary": {
            "availableProviders": [p["provider"] for p in providers if p["available"]],
            "missingProviders": [p["provider"] for p in providers if not p["available"]],
            "smokeSafe": "noop",
        },
    }

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





def cancel(args: argparse.Namespace) -> dict[str, Any]:
    """Clear current workflow pointers without deleting durable run history."""
    ensure_dirs()
    targets = {
        "goal": STATE_DIR / "current-goal.json",
        "plan": STATE_DIR / "current-plan.json",
        "team": STATE_DIR / "current-team.json",
        "ultraqa": STATE_DIR / "last-ultraqa.json",
    }
    requested = [x.strip() for x in (args.scope or "all").split(",") if x.strip()]
    if "all" in requested:
        requested = list(targets)
    cleared = []
    missing = []
    for key in requested:
        path = targets.get(key)
        if not path:
            missing.append({"scope": key, "reason": "unknown"})
            continue
        if path.exists():
            path.unlink()
            cleared.append({"scope": key, "path": str(path)})
        else:
            missing.append({"scope": key, "path": str(path), "reason": "not_found"})
    record = {"ts": now(), "scope": requested, "cleared": cleared, "missing": missing}
    write_json(STATE_DIR / "last-cancel.json", record)
    return {"ok": True, **record}

def wiki_dir() -> pathlib.Path:
    return DATA / "wiki"


def slugify(text: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", text.strip().lower()).strip("-")
    return slug[:80] or f"note-{uuid.uuid4().hex[:8]}"


def wiki_add(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    title = args.title.strip()
    body = args.body.strip()
    ts = now()
    note_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{slugify(title)}"
    note = {
        "id": note_id,
        "title": title,
        "body": body,
        "tags": [t.strip() for t in (args.tags or "").split(",") if t.strip()],
        "createdAt": ts,
        "updatedAt": ts,
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    path = wiki_dir() / f"{note_id}.json"
    write_json(path, note)
    note["path"] = str(path)
    return note


def wiki_notes() -> list[dict[str, Any]]:
    notes = []
    for path in sorted(wiki_dir().glob("*.json")) if wiki_dir().exists() else []:
        try:
            note = read_json(path)
            note["path"] = str(path)
            notes.append(note)
        except Exception:
            pass
    return notes


def wiki_list(args: argparse.Namespace) -> dict[str, Any]:
    notes = wiki_notes()
    if args.limit:
        notes = notes[-args.limit:]
    return {"count": len(notes), "notes": notes}


def wiki_search(args: argparse.Namespace) -> dict[str, Any]:
    q = args.query.lower()
    matches = []
    for note in wiki_notes():
        haystack = "\n".join([note.get("title", ""), note.get("body", ""), " ".join(note.get("tags", []))]).lower()
        if q in haystack:
            matches.append(note)
    return {"query": args.query, "count": len(matches), "matches": matches}

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
    repo_root = ROOT.parents[1] if len(ROOT.parents) > 1 else ROOT
    for name, rel in [("grok_marketplace", ".grok/plugins/marketplace.json"), ("agents_marketplace", ".agents/plugins/marketplace.json")]:
        path = repo_root / rel
        data = read_json(path, {})
        plugin = (data.get("plugins") or [{}])[0] if isinstance(data.get("plugins"), list) and data.get("plugins") else {}
        ok = (
            path.exists()
            and plugin.get("name") == "grok-build"
            and plugin.get("source", {}).get("path") == "plugins/grok-harnessing"
            and plugin.get("metadata", {}).get("packageName") == "linalab-io-framework/grok-build"
        )
        add(name, ok, f"{path} package={plugin.get('metadata', {}).get('packageName')}")
    for exe, required in [("tmux", True), ("hermes", False), ("claude", False), ("codex", False), ("grok", False)]:
        path = shutil.which(exe)
        add(f"exe:{exe}", bool(path), path or "not found", required=required)
    data_ok = DATA.exists() or DATA.parent.exists()
    add("plugin_data", data_ok, str(DATA), required=True)
    schema = ensure_state_schema()
    add("state_schema", schema.get("version") == STATE_SCHEMA_VERSION and state_schema_path().exists(), f"{state_schema_path()} version={schema.get('version')}", required=True)
    providers = team_provider_matrix()
    available = [p["provider"] for p in providers if p["available"]]
    add("team_provider_commands", True, f"available={','.join(available)} providers={','.join(p['provider'] for p in providers)}", required=False)
    bridge = hook_bridge_status(argparse.Namespace())
    add("global_hook_bridge", bridge["ok"], f"installed={bridge['installed']} valid={bridge['valid']} config={bridge['config']}", required=False)
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


def hook_bridge_paths() -> dict[str, pathlib.Path]:
    hook_dir = pathlib.Path.home() / ".grok" / "hooks"
    return {
        "hookDir": hook_dir,
        "config": hook_dir / "grok-build-audit-bridge.json",
        "script": hook_dir / "grok-build-audit-bridge.sh",
        "delegate": ROOT / "hooks" / "scripts" / "grok-build-audit-hook.sh",
    }


def hook_bridge_status(args: argparse.Namespace) -> dict[str, Any]:
    paths = hook_bridge_paths()
    config = paths["config"]
    script = paths["script"]
    delegate = paths["delegate"]
    installed = config.exists() or script.exists()
    script_text = script.read_text(encoding="utf-8") if script.exists() else ""
    config_text = config.read_text(encoding="utf-8") if config.exists() else ""
    valid = (
        config.exists()
        and script.exists()
        and os.access(script, os.X_OK)
        and delegate.exists()
        and str(delegate) in script_text
        and "grok-build-audit-bridge.sh" in config_text
    )
    return {
        "ok": (not installed) or valid,
        "installed": installed,
        "valid": valid,
        "hookDir": str(paths["hookDir"]),
        "config": str(config),
        "script": str(script),
        "delegate": str(delegate),
        "evidence": "valid global bridge" if valid else ("not installed" if not installed else "installed but invalid"),
    }


def hook_bridge_install(args: argparse.Namespace) -> dict[str, Any]:
    paths = hook_bridge_paths()
    hook_dir = paths["hookDir"]
    config = paths["config"]
    script = paths["script"]
    delegate = paths["delegate"]
    if not delegate.exists():
        raise SystemExit(f"delegate hook not found: {delegate}")
    hook_dir.mkdir(parents=True, exist_ok=True)
    command = str(script)
    config.write_text(jdump({
        "hooks": {
            event: [{"hooks": [{"type": "command", "command": command, "timeout": 5}]}]
            for event in [
                "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
                "PostToolUseFailure", "PreCompact", "Stop", "SessionEnd", "Notification"
            ]
        }
    }) + "\n", encoding="utf-8")
    script.write_text(
        "#!/usr/bin/env bash\n"
        "set +euo pipefail\n"
        f"export GROK_PLUGIN_ROOT={shlex.quote(str(ROOT))}\n"
        f"export GROK_PLUGIN_DATA=\"${{GROK_PLUGIN_DATA:-{pathlib.Path.home() / '.grok' / 'plugin-data' / 'grok-build'}}}\"\n"
        f"exec {shlex.quote(str(delegate))}\n",
        encoding="utf-8",
    )
    script.chmod(0o755)
    status = hook_bridge_status(args)
    status["installedNow"] = True
    return status

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
    rest = parts[1:]
    if name == "hook-bridge":
        action = rest[0] if rest else "status"
        if action == "status":
            return hook_bridge_status(argparse.Namespace())
        if action == "install":
            return hook_bridge_install(argparse.Namespace())
        raise SystemExit("usage: /hook-bridge [status|install]")
    if name != "team":
        raise SystemExit(f"unsupported slash command: /{name}")
    if not rest:
        return team_status(argparse.Namespace(name=None, cwd=args.cwd))
    verb = rest[0]
    if verb == "providers":
        return team_providers(argparse.Namespace())
    if verb == "preflight":
        return team_preflight(argparse.Namespace(name=args.name, cwd=args.cwd))
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
    p.add_argument("--name", help="backend session name for default lfg attach/start")
    sub = p.add_subparsers(dest="cmd")

    sub.add_parser("catalog").set_defaults(fn=catalog)
    sub.add_parser("status").set_defaults(fn=status)
    sub.add_parser("doctor").set_defaults(fn=doctor)
    hp = sub.add_parser("hud")
    hp.add_argument("--text", action="store_true")
    hp.set_defaults(fn=hud)
    cp = sub.add_parser("cancel")
    cp.add_argument("--scope", default="all", help="comma list: goal,plan,team,ultraqa or all")
    cp.set_defaults(fn=cancel)















    uwp = sub.add_parser("ultrawork")
    uwsub = uwp.add_subparsers(dest="ultrawork_cmd", required=True)
    uwc = uwsub.add_parser("create")
    uwc.add_argument("objective")
    uwc.add_argument("--id")
    uwc.add_argument("--tasks")
    uwc.set_defaults(fn=ultrawork_create)
    uwu = uwsub.add_parser("update")
    uwu.add_argument("--id")
    uwu.add_argument("--task", type=int, required=True)
    uwu.add_argument("--status", choices=["pending", "active", "complete", "blocked"], required=True)
    uwu.add_argument("--evidence", default="")
    uwu.set_defaults(fn=ultrawork_update)
    uwsh = uwsub.add_parser("show")
    uwsh.add_argument("--id")
    uwsh.set_defaults(fn=ultrawork_show)

    rp = sub.add_parser("ralph")
    rsub = rp.add_subparsers(dest="ralph_cmd", required=True)
    rc = rsub.add_parser("create")
    rc.add_argument("objective")
    rc.add_argument("--id")
    rc.add_argument("--max-iterations", type=int, default=3)
    rc.add_argument("--stop-condition")
    rc.set_defaults(fn=ralph_create)
    rs = rsub.add_parser("step")
    rs.add_argument("--id")
    rs.add_argument("--status", choices=["active", "complete", "blocked"], default="active")
    rs.add_argument("--evidence", default="")
    rs.set_defaults(fn=ralph_step)
    rsh = rsub.add_parser("show")
    rsh.add_argument("--id")
    rsh.set_defaults(fn=ralph_show)

    wp2 = sub.add_parser("worker")
    w2sub = wp2.add_subparsers(dest="worker_cmd", required=True)
    wa2 = w2sub.add_parser("ack")
    wa2.add_argument("worker")
    wa2.add_argument("task")
    wa2.set_defaults(fn=worker_ack)
    wr2 = w2sub.add_parser("result")
    wr2.add_argument("worker")
    wr2.add_argument("result")
    wr2.add_argument("--status", default="complete", choices=["complete", "blocked", "failed"])
    wr2.set_defaults(fn=worker_result)
    ws2 = w2sub.add_parser("status")
    ws2.add_argument("worker", nargs="?")
    ws2.set_defaults(fn=worker_status)

    cleanp = sub.add_parser("ai-slop-cleaner")
    cleansub = cleanp.add_subparsers(dest="cleanup_cmd", required=True)
    cleanc = cleansub.add_parser("create")
    cleanc.add_argument("--scope", help="comma-separated files or repo")
    cleanc.add_argument("--verification")
    cleanc.set_defaults(fn=ai_slop_cleaner)
    cleanl = cleansub.add_parser("list")
    cleanl.add_argument("--limit", type=int)
    cleanl.set_defaults(fn=ai_slop_cleaner_list)

    arp = sub.add_parser("autoresearch")
    arsub = arp.add_subparsers(dest="autoresearch_cmd", required=True)
    arc = arsub.add_parser("create")
    arc.add_argument("question")
    arc.add_argument("--id")
    arc.set_defaults(fn=autoresearch_create)
    ars = arsub.add_parser("add-source")
    ars.add_argument("url")
    ars.add_argument("--id")
    ars.add_argument("--note")
    ars.set_defaults(fn=autoresearch_add_source)
    arshow = arsub.add_parser("show")
    arshow.add_argument("--id")
    arshow.set_defaults(fn=autoresearch_show)

    dip = sub.add_parser("deep-interview")
    disub = dip.add_subparsers(dest="deep_interview_cmd", required=True)
    dic = disub.add_parser("create")
    dic.add_argument("topic")
    dic.add_argument("--id")
    dic.add_argument("--questions")
    dic.set_defaults(fn=deep_interview_create)
    dia = disub.add_parser("answer")
    dia.add_argument("--id")
    dia.add_argument("--question", type=int, required=True)
    dia.add_argument("answer")
    dia.set_defaults(fn=deep_interview_answer)
    dish = disub.add_parser("show")
    dish.add_argument("--id")
    dish.set_defaults(fn=deep_interview_show)

    dp = sub.add_parser("design")
    dsub = dp.add_subparsers(dest="design_cmd", required=True)
    da = dsub.add_parser("add")
    da.add_argument("title")
    da.add_argument("decision")
    da.add_argument("--rationale")
    da.set_defaults(fn=design_add)
    dl = dsub.add_parser("list")
    dl.add_argument("--limit", type=int)
    dl.set_defaults(fn=design_list)

    np = sub.add_parser("configure-notifications")
    nsub = np.add_subparsers(dest="notifications_cmd", required=True)
    ns = nsub.add_parser("set")
    ns.add_argument("--channel", default="console", choices=["console", "slack", "webhook", "none"])
    ns.add_argument("--target")
    ns.add_argument("--enabled", action="store_true")
    ns.set_defaults(fn=notifications_set)
    nsh = nsub.add_parser("show")
    nsh.set_defaults(fn=notifications_show)

    askp = sub.add_parser("ask")
    asksub = askp.add_subparsers(dest="ask_cmd", required=True)
    askc = asksub.add_parser("create")
    askc.add_argument("prompt")
    askc.add_argument("--provider", choices=["hermes", "claude", "codex"], default="hermes")
    askc.add_argument("--dry-run", action="store_true", default=True)
    askc.add_argument("--run", dest="dry_run", action="store_false")
    askc.add_argument("--timeout", type=int, default=60)
    askc.set_defaults(fn=ask)
    askl = asksub.add_parser("list")
    askl.add_argument("--limit", type=int)
    askl.set_defaults(fn=ask_list)

    ap = sub.add_parser("analyze")
    asub = ap.add_subparsers(dest="analyze_cmd", required=True)
    ac = asub.add_parser("create")
    ac.add_argument("--focus")
    ac.set_defaults(fn=analyze)
    al = asub.add_parser("list")
    al.add_argument("--limit", type=int)
    al.set_defaults(fn=analyze_list)

    crp = sub.add_parser("code-review")
    crsub = crp.add_subparsers(dest="code_review_cmd", required=True)
    crc = crsub.add_parser("create")
    crc.add_argument("objective")
    crc.set_defaults(fn=code_review)
    crl = crsub.add_parser("list")
    crl.add_argument("--limit", type=int)
    crl.set_defaults(fn=code_review_list)

    pip = sub.add_parser("pipeline")
    psub = pip.add_subparsers(dest="pipeline_cmd", required=True)
    pc = psub.add_parser("create")
    pc.add_argument("title")
    pc.add_argument("--id")
    pc.add_argument("--stages")
    pc.set_defaults(fn=pipeline_create)
    pln = psub.add_parser("list")
    pln.add_argument("--limit", type=int)
    pln.set_defaults(fn=pipeline_list)
    pu = psub.add_parser("update")
    pu.add_argument("--id")
    pu.add_argument("--stage", type=int, required=True)
    pu.add_argument("--status", choices=["pending", "active", "complete", "blocked"], required=True)
    pu.add_argument("--note")
    pu.set_defaults(fn=pipeline_update)

    autop = sub.add_parser("autopilot")
    autosub = autop.add_subparsers(dest="autopilot_cmd", required=True)
    autoc = autosub.add_parser("create")
    autoc.add_argument("objective")
    autoc.add_argument("--id")
    autoc.set_defaults(fn=autopilot_create)
    autoa = autosub.add_parser("advance")
    autoa.add_argument("--id")
    autoa.add_argument("--phase", type=int, required=True)
    autoa.add_argument("--status", choices=["pending", "active", "complete", "blocked"], required=True)
    autoa.add_argument("--evidence", default="")
    autoa.set_defaults(fn=autopilot_advance)
    autos = autosub.add_parser("show")
    autos.add_argument("--id")
    autos.set_defaults(fn=autopilot_show)


    perf = sub.add_parser("performance-goal")
    perfsub = perf.add_subparsers(dest="performance_goal_cmd", required=True)
    perfc = perfsub.add_parser("create")
    perfc.add_argument("objective")
    perfc.add_argument("--id")
    perfc.add_argument("--metrics")
    perfc.set_defaults(fn=performance_create)
    perfm = perfsub.add_parser("measure")
    perfm.add_argument("--id")
    perfm.add_argument("--metric", required=True)
    perfm.add_argument("--baseline", type=float)
    perfm.add_argument("--current", type=float)
    perfm.add_argument("--target", type=float)
    perfm.add_argument("--evidence", default="")
    perfm.set_defaults(fn=performance_measure)
    perfs = perfsub.add_parser("show")
    perfs.add_argument("--id")
    perfs.set_defaults(fn=performance_show)


    vr = sub.add_parser("visual-ralph")
    vrsub = vr.add_subparsers(dest="visual_ralph_cmd", required=True)
    vrc = vrsub.add_parser("create")
    vrc.add_argument("target")
    vrc.add_argument("--id")
    vrc.add_argument("--reference")
    vrc.add_argument("--threshold", type=float, default=0.95)
    vrc.set_defaults(fn=visual_ralph_create)
    vrv = vrsub.add_parser("verdict")
    vrv.add_argument("--id")
    vrv.add_argument("--score", type=float, required=True)
    vrv.add_argument("--status", choices=["pass", "fail", "blocked"], required=True)
    vrv.add_argument("--evidence", default="")
    vrv.set_defaults(fn=visual_ralph_verdict)
    vrs = vrsub.add_parser("show")
    vrs.add_argument("--id")
    vrs.set_defaults(fn=visual_ralph_show)


    argp = sub.add_parser("autoresearch-goal")
    argsub = argp.add_subparsers(dest="autoresearch_goal_cmd", required=True)
    argc = argsub.add_parser("create")
    argc.add_argument("question")
    argc.add_argument("--id")
    argc.add_argument("--hypotheses")
    argc.set_defaults(fn=autoresearch_goal_create)
    argcr = argsub.add_parser("critique")
    argcr.add_argument("--id")
    argcr.add_argument("--verdict", choices=["pass", "revise", "blocked"], required=True)
    argcr.add_argument("--critic", default="critic")
    argcr.add_argument("--evidence", default="")
    argcr.set_defaults(fn=autoresearch_goal_critique)
    args = argsub.add_parser("show")
    args.add_argument("--id")
    args.set_defaults(fn=autoresearch_goal_show)


    omxs = sub.add_parser("omx-setup")
    omxsub = omxs.add_subparsers(dest="omx_setup_cmd", required=True)
    omxc = omxsub.add_parser("check")
    omxc.set_defaults(fn=omx_setup_check)
    omxp = omxsub.add_parser("install-plan")
    omxp.add_argument("--marketplace")
    omxp.set_defaults(fn=omx_setup_plan)
    omxsh = omxsub.add_parser("show")
    omxsh.set_defaults(fn=omx_setup_show)

    skp = sub.add_parser("skill")
    sksub = skp.add_subparsers(dest="skill_cmd", required=True)
    skl = sksub.add_parser("list")
    skl.set_defaults(fn=skill_list)
    sks = sksub.add_parser("search")
    sks.add_argument("query")
    sks.set_defaults(fn=skill_search)

    wp = sub.add_parser("wiki")
    wsub = wp.add_subparsers(dest="wiki_cmd", required=True)
    wa = wsub.add_parser("add")
    wa.add_argument("title")
    wa.add_argument("body")
    wa.add_argument("--tags")
    wa.set_defaults(fn=wiki_add)
    wl = wsub.add_parser("list")
    wl.add_argument("--limit", type=int)
    wl.set_defaults(fn=wiki_list)
    ws = wsub.add_parser("search")
    ws.add_argument("query")
    ws.set_defaults(fn=wiki_search)

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


    rlp = sub.add_parser("ralplan")
    rlsub = rlp.add_subparsers(dest="ralplan_cmd", required=True)
    rlc = rlsub.add_parser("create")
    rlc.add_argument("title")
    rlc.add_argument("--id")
    rlc.add_argument("--steps")
    rlc.set_defaults(fn=ralplan_create)
    rlr = rlsub.add_parser("review")
    rlr.add_argument("--id")
    rlr.add_argument("--verdict", choices=["approve", "revise", "block"], required=True)
    rlr.add_argument("--reviewer", default="architect")
    rlr.add_argument("--evidence", default="")
    rlr.set_defaults(fn=ralplan_review)
    rls = rlsub.add_parser("show")
    rls.add_argument("--id")
    rls.set_defaults(fn=ralplan_show)

    pp = sub.add_parser("plan")
    psub = pp.add_subparsers(dest="plan_cmd", required=True)
    pc = psub.add_parser("create")
    pc.add_argument("title")
    pc.add_argument("--steps")
    pc.set_defaults(fn=mk_plan)
    pl = psub.add_parser("list")
    pl.add_argument("--limit", type=int)
    pl.set_defaults(fn=plan_list)

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

    hbp = sub.add_parser("hook-bridge")
    hbsub = hbp.add_subparsers(dest="hook_bridge_cmd", required=True)
    hbs = hbsub.add_parser("status")
    hbs.set_defaults(fn=hook_bridge_status)
    hbi = hbsub.add_parser("install")
    hbi.set_defaults(fn=hook_bridge_install)

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
    tprov = tsub.add_parser("providers")
    tprov.set_defaults(fn=team_providers)
    tpre = tsub.add_parser("preflight")
    tpre.add_argument("--name")
    tpre.set_defaults(fn=team_preflight)
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
    if not getattr(args, "cmd", None):
        args.fn = lfg_launch
    result = args.fn(args)
    emit(result, args.json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
