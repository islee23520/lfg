#!/usr/bin/env python3
from __future__ import annotations

import subprocess

from plugins.lfg.src.mcp._helpers import (
    ROOT,
    append_evidence_artifacts,
    run_lfg_json,
    text_result,
)

def handle_cleanup(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "ai-slop-cleaner"]
    if action == "create":
        cmd += ["create"]
        if arguments.get("scope"):
            cmd += ["--scope", arguments["scope"]]
        if arguments.get("verification"):
            cmd += ["--verification", arguments["verification"]]
    elif action == "list":
        cmd += ["list"]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_autoresearch(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "autoresearch"]
    if action == "create":
        cmd += ["create", arguments.get("question") or "Untitled research"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
    elif action == "add-source":
        cmd += ["add-source", arguments.get("url") or ""]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("note"):
            cmd += ["--note", arguments["note"]]
    elif action == "show":
        cmd += ["show"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_deep_interview(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "deep-interview"]
    if action == "create":
        cmd += ["create", arguments.get("topic") or "Untitled interview"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("questions"):
            cmd += ["--questions", arguments["questions"]]
    elif action == "answer":
        cmd += ["answer", "--question", str(arguments.get("question") or 1), arguments.get("answer") or ""]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
    elif action == "show":
        cmd += ["show"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_design(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "design"]
    if action == "add":
        cmd += ["add", arguments.get("title") or "Untitled", arguments.get("decision") or ""]
        if arguments.get("rationale"):
            cmd += ["--rationale", arguments["rationale"]]
    elif action == "list":
        cmd += ["list"]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_notifications(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "configure-notifications"]
    if action == "set":
        cmd += ["set", "--channel", arguments.get("channel") or "console"]
        if arguments.get("target"):
            cmd += ["--target", arguments["target"]]
        if arguments.get("enabled"):
            cmd += ["--enabled"]
    elif action == "show":
        cmd += ["show"]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_ask(arguments):
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "ask", "create", arguments["prompt"]]
    if arguments.get("provider"):
        cmd += ["--provider", arguments["provider"]]
    if arguments.get("model"):
        cmd += ["--model", arguments["model"]]
    if arguments.get("dryRun", True):
        cmd += ["--dry-run"]
    else:
        cmd += ["--run"]
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_analyze(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "analyze"]
    if action == "create":
        cmd += ["create"]
        if arguments.get("focus"):
            cmd += ["--focus", arguments["focus"]]
    elif action == "list":
        cmd += ["list"]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_code_review(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "code-review"]
    if action == "create":
        cmd += ["create", arguments.get("objective") or "review current changes"]
    elif action == "list":
        cmd += ["list"]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_pipeline(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "pipeline"]
    if action == "create":
        cmd += ["create", arguments.get("title") or "Untitled pipeline"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("stages"):
            cmd += ["--stages", arguments["stages"]]
    elif action == "list":
        cmd += ["list"]
    elif action == "update":
        cmd += ["update", "--stage", str(arguments.get("stage") or 1), "--status", arguments.get("status") or "active"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("note"):
            cmd += ["--note", arguments["note"]]
        append_evidence_artifacts(cmd, arguments)
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_autopilot(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "autopilot"]
    if action == "create":
        cmd += ["create", arguments.get("objective") or "Autopilot objective"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
    elif action == "advance":
        cmd += ["advance", "--phase", str(arguments.get("phase") or 1), "--status", arguments.get("status") or "active"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("evidence"):
            cmd += ["--evidence", arguments["evidence"]]
        append_evidence_artifacts(cmd, arguments)
    elif action == "show":
        cmd += ["show"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})



def handle_performance_goal(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "performance-goal"]
    if action == "create":
        cmd += ["create", arguments.get("objective") or "Performance objective"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("metrics"):
            cmd += ["--metrics", arguments["metrics"]]
    elif action == "measure":
        cmd += ["measure", "--metric", arguments.get("metric") or "latency"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        for key in ["baseline", "current", "target"]:
            if arguments.get(key) is not None:
                cmd += [f"--{key}", str(arguments[key])]
        if arguments.get("evidence"):
            cmd += ["--evidence", arguments["evidence"]]
        append_evidence_artifacts(cmd, arguments)
    elif action == "show":
        cmd += ["show"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})



def handle_visual_ralph(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "visual-ralph"]
    if action == "create":
        cmd += ["create", arguments.get("target") or "visual target"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("reference"):
            cmd += ["--reference", arguments["reference"]]
        if arguments.get("threshold") is not None:
            cmd += ["--threshold", str(arguments["threshold"])]
    elif action == "verdict":
        cmd += ["verdict", "--score", str(arguments.get("score") if arguments.get("score") is not None else 0), "--status", arguments.get("status") or "fail"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("evidence"):
            cmd += ["--evidence", arguments["evidence"]]
        append_evidence_artifacts(cmd, arguments)
    elif action == "show":
        cmd += ["show"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})



def handle_autoresearch_goal(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "autoresearch-goal"]
    if action == "create":
        cmd += ["create", arguments.get("question") or "Research question"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("hypotheses"):
            cmd += ["--hypotheses", arguments["hypotheses"]]
    elif action == "critique":
        cmd += ["critique", "--verdict", arguments.get("verdict") or "revise"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("critic"):
            cmd += ["--critic", arguments["critic"]]
        if arguments.get("evidence"):
            cmd += ["--evidence", arguments["evidence"]]
        append_evidence_artifacts(cmd, arguments)
    elif action == "show":
        cmd += ["show"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})



def handle_ultraqa(arguments):
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "ultraqa", arguments["objective"]]
    if arguments.get("noRun", True):
        cmd += ["--no-run"]
    if arguments.get("timeout"):
        cmd += ["--timeout", str(arguments["timeout"])]
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=60)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


def handle_goal(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "goal"]
    if action == "create":
        cmd += ["create", arguments.get("objective") or "Untitled goal"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("checklist"):
            cmd += ["--checklist", arguments["checklist"]]
    elif action == "list":
        cmd += ["list"]
    elif action == "update":
        cmd += ["update", "--status", arguments.get("status") or "active"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("note"):
            cmd += ["--note", arguments["note"]]
        append_evidence_artifacts(cmd, arguments)
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})



def handle_ralplan(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "ralplan"]
    if action == "create":
        cmd += ["create", arguments.get("title") or "Consensus plan"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("steps"):
            cmd += ["--steps", arguments["steps"]]
    elif action == "review":
        cmd += ["review", "--verdict", arguments.get("verdict") or "revise"]
        if arguments.get("id"):
            cmd += ["--id", arguments["id"]]
        if arguments.get("reviewer"):
            cmd += ["--reviewer", arguments["reviewer"]]
        if arguments.get("evidence"):
            cmd += ["--evidence", arguments["evidence"]]
        append_evidence_artifacts(cmd, arguments)
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})



def handle_plan(arguments):
    action = arguments.get("action")
    cmd = ["plan"]
    if action == "create":
        cmd += ["create", arguments.get("title") or "Untitled plan"]
        if arguments.get("steps"):
            cmd += ["--steps", arguments["steps"]]
    elif action == "list":
        cmd += ["list"]
    else:
        raise KeyError(action)
    payload = run_lfg_json(cmd, timeout=30)
    if action == "create" and payload.get("data"):
        payload["plan"] = payload["data"]
        if isinstance(payload["data"], dict) and "preview" in payload["data"]:
            payload["preview"] = payload["data"]["preview"]
            payload["note"] = "Rich plan preview ready for popup/card render (full markdown + interactive steps metadata included; self-contained)."
        else:
            payload["note"] = "Plan created; preview available in parsed plan object."
    else:
        payload["note"] = "Plan written to .lfg/plans/ (both .json and .md). Open the .md file to work on the plan."
    return text_result(payload)


def handle_wiki(arguments):
    action = arguments.get("action")
    cmd = [str(ROOT / "bin" / "lfg"), "--json", "wiki"]
    if action == "add":
        cmd += ["add", arguments.get("title") or "Untitled", arguments.get("body") or ""]
        if arguments.get("tags"):
            cmd += ["--tags", arguments["tags"]]
    elif action == "list":
        cmd += ["list"]
    elif action == "search":
        cmd += ["search", arguments.get("query") or ""]
    else:
        raise KeyError(action)
    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    return text_result({"cmd": cmd, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr})


HANDLERS = {
    "grok_build_cleanup": handle_cleanup,
    "grok_build_autoresearch": handle_autoresearch,
    "grok_build_deep_interview": handle_deep_interview,
    "grok_build_design": handle_design,
    "grok_build_notifications": handle_notifications,
    "grok_build_ask": handle_ask,
    "grok_build_analyze": handle_analyze,
    "grok_build_code_review": handle_code_review,
    "grok_build_pipeline": handle_pipeline,
    "grok_build_autopilot": handle_autopilot,
    "grok_build_performance_goal": handle_performance_goal,
    "grok_build_visual_ralph": handle_visual_ralph,
    "grok_build_autoresearch_goal": handle_autoresearch_goal,
    "grok_build_ultraqa": handle_ultraqa,
    "grok_build_goal": handle_goal,
    "grok_build_ralplan": handle_ralplan,
    "grok_build_plan": handle_plan,
    "grok_build_wiki": handle_wiki,
}
