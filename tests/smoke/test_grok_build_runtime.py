#!/usr/bin/env python3
"""Smoke/TDD coverage for the grok-build MVP runtime.

This is intentionally dependency-free so marketplace users can run it with the
system Python.  The suite is organized as a feature coverage matrix; every item
must pass for the smoke coverage score to be 100%.
"""
from __future__ import annotations

import json
import os
import pathlib
import subprocess
import tempfile
import unittest

REPO = pathlib.Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "grok-harnessing"
LFG = PLUGIN / "bin" / "lfg"
MCP = PLUGIN / "bin" / "grok-build-mcp.py"


class RuntimeSmoke(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.env = os.environ.copy()
        self.env["GROK_PLUGIN_ROOT"] = str(PLUGIN)
        self.env["GROK_PLUGIN_DATA"] = self.tmp.name

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def run_lfg(self, *args: str) -> dict:
        proc = subprocess.run(
            [str(LFG), "--json", *args],
            cwd=str(REPO),
            env=self.env,
            text=True,
            capture_output=True,
            check=True,
            timeout=20,
        )
        return json.loads(proc.stdout)

    def test_status_and_catalog(self) -> None:
        status = self.run_lfg("status")
        self.assertTrue(status["ok"])
        self.assertEqual(status["version"], "0.3.0")
        self.assertGreaterEqual(status["catalogSkills"], 28)

        catalog = self.run_lfg("catalog")
        names = {skill["name"] for skill in catalog["skills"]}
        self.assertIn("team", names)
        self.assertIn("ultraqa", names)

    def test_team_slash_dry_run_maps_to_three_default_providers(self) -> None:
        team = self.run_lfg("slash", '/team 3:executor "fix tests"', "--dry-run")
        self.assertEqual(team["status"], "planned")
        self.assertEqual(team["objective"], "fix tests")
        self.assertEqual([m["provider"] for m in team["members"]], ["hermes", "claude", "codex"])
        self.assertTrue(all("Do not overwrite teammate work" in m["prompt"] for m in team["members"]))

    def test_team_lifecycle_state_dry_run(self) -> None:
        team = self.run_lfg("team", "create", "2:reviewer", "review docs", "--providers", "claude,codex", "--dry-run")
        self.assertEqual(team["status"], "planned")
        self.assertEqual([m["provider"] for m in team["members"]], ["claude", "codex"])
        current = pathlib.Path(self.tmp.name) / "state" / "current-team.json"
        self.assertTrue(current.exists())
        current_team = json.loads(current.read_text())
        self.assertEqual(current_team["name"], team["name"])

    def test_mcp_exposes_runtime_and_team_tools(self) -> None:
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "grok_build_slash",
                    "arguments": {"command": '/team 3:executor "fix tests"', "dryRun": True},
                },
            },
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        proc.stdout.close()

        self.assertEqual(replies[0]["result"]["serverInfo"]["version"], "0.3.0")
        tool_names = {tool["name"] for tool in replies[1]["result"]["tools"]}
        for name in {"grok_build_catalog", "grok_build_runtime", "grok_build_team", "grok_build_slash"}:
            self.assertIn(name, tool_names)
        payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"status": "planned"', payload["stdout"])

    def test_doctor_reports_required_checks(self) -> None:
        report = self.run_lfg("doctor")
        self.assertTrue(report["ok"], report)
        check_names = {check["name"] for check in report["checks"]}
        for required in {"grok_manifest", "mcp_config", "catalog", "skills", "exe:tmux", "plugin_data"}:
            self.assertIn(required, check_names)
        self.assertEqual(report["failedRequired"], [])

    def test_mcp_doctor_runtime(self) -> None:
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": "grok_build_runtime", "arguments": {"action": "doctor"}},
            },
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        proc.stdout.close()
        payload = json.loads(replies[1]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"status": "pass"', payload["stdout"])

    def test_wiki_add_list_search_persists_notes(self) -> None:
        note = self.run_lfg("wiki", "add", "Team decision", "Use tmux backend for team mode", "--tags", "team,architecture")
        self.assertEqual(note["title"], "Team decision")
        self.assertTrue(pathlib.Path(note["path"]).exists())
        listed = self.run_lfg("wiki", "list")
        self.assertEqual(listed["count"], 1)
        found = self.run_lfg("wiki", "search", "tmux")
        self.assertEqual(found["count"], 1)
        self.assertEqual(found["matches"][0]["title"], "Team decision")

    def test_mcp_wiki_tool(self) -> None:
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": "grok_build_wiki", "arguments": {"action": "add", "title": "MCP note", "body": "wiki mcp body", "tags": "wiki,mcp"}},
            },
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "grok_build_wiki", "arguments": {"action": "search", "query": "mcp"}},
            },
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        proc.stdout.close()
        add_payload = json.loads(replies[1]["result"]["content"][0]["text"])
        search_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(add_payload["returncode"], 0)
        self.assertEqual(search_payload["returncode"], 0)
        self.assertIn('"count": 1', search_payload["stdout"])

    def test_plan_create_list_persists_steps(self) -> None:
        plan = self.run_lfg("plan", "create", "Ship plan", "--steps", "design;test;implement;verify")
        self.assertEqual(plan["title"], "Ship plan")
        self.assertEqual([s["text"] for s in plan["steps"]], ["design", "test", "implement", "verify"])
        current = pathlib.Path(self.tmp.name) / "state" / "current-plan.json"
        self.assertTrue(current.exists())
        listed = self.run_lfg("plan", "list")
        self.assertEqual(listed["count"], 1)
        self.assertEqual(listed["plans"][0]["title"], "Ship plan")

    def test_mcp_plan_tool(self) -> None:
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": "grok_build_plan", "arguments": {"action": "create", "title": "MCP plan", "steps": "design;test"}},
            },
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "grok_build_plan", "arguments": {"action": "list"}},
            },
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        proc.stdout.close()
        create_payload = json.loads(replies[1]["result"]["content"][0]["text"])
        list_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(create_payload["returncode"], 0)
        self.assertEqual(list_payload["returncode"], 0)
        self.assertIn('"title": "MCP plan"', list_payload["stdout"])

    def test_goal_create_list_update_persists_state(self) -> None:
        goal = self.run_lfg("goal", "create", "Ship goal", "--id", "smoke-goal", "--checklist", "design;test;verify")
        self.assertEqual(goal["id"], "smoke-goal")
        self.assertEqual(goal["checklist"], ["design", "test", "verify"])
        current = pathlib.Path(self.tmp.name) / "state" / "current-goal.json"
        self.assertTrue(current.exists())
        listed = self.run_lfg("goal", "list")
        self.assertEqual(len(listed["goals"]), 1)
        updated = self.run_lfg("goal", "update", "--id", "smoke-goal", "--status", "complete", "--note", "verified")
        self.assertEqual(updated["status"], "complete")
        self.assertEqual(updated["events"][-1]["message"], "verified")

    def test_mcp_goal_tool(self) -> None:
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": "grok_build_goal", "arguments": {"action": "create", "id": "mcp-goal", "objective": "MCP goal", "checklist": "design;test"}},
            },
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "grok_build_goal", "arguments": {"action": "update", "id": "mcp-goal", "status": "complete", "note": "done"}},
            },
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        proc.stdout.close()
        create_payload = json.loads(replies[1]["result"]["content"][0]["text"])
        update_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(create_payload["returncode"], 0)
        self.assertEqual(update_payload["returncode"], 0)
        self.assertIn('"id": "mcp-goal"', create_payload["stdout"])
        self.assertIn('"status": "complete"', update_payload["stdout"])

    def test_ultraqa_no_run_persists_run_state(self) -> None:
        run = self.run_lfg("ultraqa", "verify plugin smoke", "--no-run")
        self.assertEqual(run["verdict"], "planned")
        self.assertEqual(run["commands"], [])
        self.assertGreaterEqual(len(run["scenarios"]), 5)
        pointer = pathlib.Path(self.tmp.name) / "state" / "last-ultraqa.json"
        self.assertTrue(pointer.exists())
        stored = pathlib.Path(json.loads(pointer.read_text())["path"])
        self.assertTrue(stored.exists())

    def test_mcp_ultraqa_tool(self) -> None:
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": "grok_build_ultraqa", "arguments": {"objective": "MCP ultraqa", "noRun": True}},
            },
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        proc.stdout.close()
        payload = json.loads(replies[1]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"verdict": "planned"', payload["stdout"])
        self.assertIn('"objective": "MCP ultraqa"', payload["stdout"])

    def test_cancel_clears_current_pointers(self) -> None:
        plan = self.run_lfg("plan", "create", "Cancel plan")
        plan_path = pathlib.Path(self.tmp.name) / "state" / "plans" / f"{plan['id']}.json"
        current_plan = pathlib.Path(self.tmp.name) / "state" / "current-plan.json"
        self.assertTrue(plan_path.exists())
        self.assertTrue(current_plan.exists())
        result = self.run_lfg("cancel", "--scope", "plan")
        self.assertTrue(result["ok"])
        self.assertFalse(current_plan.exists())
        self.assertTrue(plan_path.exists(), "durable plan history must remain")
        self.assertTrue((pathlib.Path(self.tmp.name) / "state" / "last-cancel.json").exists())

    def test_mcp_cancel_tool(self) -> None:
        self.run_lfg("goal", "create", "Cancel goal", "--id", "cancel-goal")
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_cancel", "arguments": {"scope": "goal"}}},
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        proc.stdout.close()
        payload = json.loads(replies[1]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"scope": "goal"', payload["stdout"])
        self.assertFalse((pathlib.Path(self.tmp.name) / "state" / "current-goal.json").exists())
        self.assertTrue((pathlib.Path(self.tmp.name) / "state" / "goals" / "cancel-goal.json").exists())

    def test_hud_summarizes_workflow_state(self) -> None:
        self.run_lfg("goal", "create", "HUD goal")
        self.run_lfg("plan", "create", "HUD plan")
        self.run_lfg("wiki", "add", "HUD note", "body")
        hud = self.run_lfg("hud", "--text")
        self.assertTrue(hud["ok"])
        self.assertEqual(hud["counts"]["goals"], 1)
        self.assertEqual(hud["counts"]["activeGoals"], 1)
        self.assertEqual(hud["counts"]["plans"], 1)
        self.assertEqual(hud["counts"]["wikiNotes"], 1)
        self.assertIn("grok-build", hud["text"])

    def test_mcp_hud_tool(self) -> None:
        self.run_lfg("goal", "create", "MCP HUD goal")
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_hud", "arguments": {"text": True}}},
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        proc.stdout.close()
        payload = json.loads(replies[1]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"goals": 1', payload["stdout"])
        self.assertIn('"text": "grok-build', payload["stdout"])

    def test_skill_list_search_catalog(self) -> None:
        listed = self.run_lfg("skill", "list")
        self.assertGreaterEqual(listed["count"], 28)
        names = {skill["name"] for skill in listed["skills"]}
        self.assertIn("ultraqa", names)
        found = self.run_lfg("skill", "search", "ultraqa")
        self.assertGreaterEqual(found["count"], 1)
        self.assertIn("ultraqa", {skill["name"] for skill in found["matches"]})

    def test_mcp_skill_tool(self) -> None:
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_skill", "arguments": {"action": "search", "query": "ultraqa"}}},
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        proc.stdout.close()
        payload = json.loads(replies[1]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"name": "ultraqa"', payload["stdout"])

    def test_pipeline_create_list_update_persists_state(self) -> None:
        pipe = self.run_lfg("pipeline", "create", "Ship pipeline", "--id", "smoke-pipeline", "--stages", "plan;build;verify")
        self.assertEqual(pipe["id"], "smoke-pipeline")
        self.assertEqual([s["name"] for s in pipe["stages"]], ["plan", "build", "verify"])
        current = pathlib.Path(self.tmp.name) / "state" / "current-pipeline.json"
        self.assertTrue(current.exists())
        updated = self.run_lfg("pipeline", "update", "--id", "smoke-pipeline", "--stage", "1", "--status", "complete", "--note", "planned")
        self.assertEqual(updated["stages"][0]["status"], "complete")
        listed = self.run_lfg("pipeline", "list")
        self.assertEqual(listed["count"], 1)

    def test_mcp_pipeline_tool(self) -> None:
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_pipeline", "arguments": {"action": "create", "id": "mcp-pipeline", "title": "MCP pipeline", "stages": "plan;verify"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_pipeline", "arguments": {"action": "update", "id": "mcp-pipeline", "stage": 1, "status": "complete"}}},
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        proc.stdout.close()
        create_payload = json.loads(replies[1]["result"]["content"][0]["text"])
        update_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(create_payload["returncode"], 0)
        self.assertEqual(update_payload["returncode"], 0)
        self.assertIn('"id": "mcp-pipeline"', create_payload["stdout"])
        self.assertIn('"status": "complete"', update_payload["stdout"])

    def test_code_review_create_list_persists_report(self) -> None:
        report = self.run_lfg("code-review", "create", "review smoke")
        self.assertEqual(report["objective"], "review smoke")
        self.assertIn(report["codeReview"]["recommendation"], {"APPROVE", "COMMENT"})
        pointer = pathlib.Path(self.tmp.name) / "state" / "last-code-review.json"
        self.assertTrue(pointer.exists())
        stored = pathlib.Path(json.loads(pointer.read_text())["path"])
        self.assertTrue(stored.exists())
        listed = self.run_lfg("code-review", "list")
        self.assertEqual(listed["count"], 1)

    def test_mcp_code_review_tool(self) -> None:
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_code_review", "arguments": {"action": "create", "objective": "MCP review"}}},
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        proc.stdout.close()
        payload = json.loads(replies[1]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"objective": "MCP review"', payload["stdout"])
        self.assertIn('"codeReview"', payload["stdout"])

    def test_analyze_create_list_persists_report(self) -> None:
        report = self.run_lfg("analyze", "create", "--focus", "plugin surface")
        self.assertEqual(report["focus"], "plugin surface")
        self.assertGreater(report["fileCount"], 0)
        self.assertIn("README.md", report["keyPaths"])
        pointer = pathlib.Path(self.tmp.name) / "state" / "last-analyze.json"
        self.assertTrue(pointer.exists())
        listed = self.run_lfg("analyze", "list")
        self.assertEqual(listed["count"], 1)

    def test_mcp_analyze_tool(self) -> None:
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_analyze", "arguments": {"action": "create", "focus": "MCP analysis"}}},
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        proc.stdout.close()
        payload = json.loads(replies[1]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"focus": "MCP analysis"', payload["stdout"])
        self.assertIn('"fileCount"', payload["stdout"])

    def test_ask_dry_run_records_request(self) -> None:
        req = self.run_lfg("ask", "create", "review architecture", "--provider", "codex", "--dry-run")
        self.assertEqual(req["provider"], "codex")
        self.assertTrue(req["dryRun"])
        self.assertEqual(req["command"][:2], ["codex", "exec"])
        pointer = pathlib.Path(self.tmp.name) / "state" / "last-ask.json"
        self.assertTrue(pointer.exists())
        listed = self.run_lfg("ask", "list")
        self.assertEqual(listed["count"], 1)

    def test_mcp_ask_tool(self) -> None:
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_ask", "arguments": {"prompt": "MCP ask", "provider": "claude", "dryRun": True}}},
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        proc.stdout.close()
        payload = json.loads(replies[1]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"provider": "claude"', payload["stdout"])
        self.assertIn('"dryRun": true', payload["stdout"])

    def test_notifications_set_show_persists_config(self) -> None:
        result = self.run_lfg("configure-notifications", "set", "--channel", "console", "--target", "stdout", "--enabled")
        self.assertTrue(result["ok"])
        self.assertTrue(result["config"]["enabled"])
        self.assertTrue(result["config"]["dryRunOnly"])
        shown = self.run_lfg("configure-notifications", "show")
        self.assertEqual(shown["config"]["channel"], "console")
        self.assertEqual(shown["config"]["target"], "stdout")

    def test_mcp_notifications_tool(self) -> None:
        proc = subprocess.Popen(
            ["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True
        )
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_notifications", "arguments": {"action": "set", "channel": "console", "target": "stdout", "enabled": True}}},
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close(); proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill(); proc.wait(timeout=5)
        proc.stdout.close()
        payload = json.loads(replies[1]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"enabled": true', payload["stdout"])
        self.assertIn('"dryRunOnly": true', payload["stdout"])

    def test_design_add_list_persists_decision(self) -> None:
        rec = self.run_lfg("design", "add", "Team backend", "Use tmux windows", "--rationale", "durable coordination")
        self.assertEqual(rec["title"], "Team backend")
        self.assertEqual(rec["decision"], "Use tmux windows")
        self.assertTrue((pathlib.Path(self.tmp.name) / "state" / "last-design.json").exists())
        listed = self.run_lfg("design", "list")
        self.assertEqual(listed["count"], 1)
        self.assertEqual(listed["decisions"][0]["rationale"], "durable coordination")

    def test_mcp_design_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_design", "arguments": {"action": "add", "title": "MCP design", "decision": "Persist decisions", "rationale": "traceability"}}},
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close(); proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill(); proc.wait(timeout=5)
        proc.stdout.close()
        payload = json.loads(replies[1]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"title": "MCP design"', payload["stdout"])
        self.assertIn('"decision": "Persist decisions"', payload["stdout"])

    def test_deep_interview_create_answer_show(self) -> None:
        rec = self.run_lfg("deep-interview", "create", "Team requirements", "--id", "smoke-interview")
        self.assertEqual(rec["status"], "open")
        self.assertEqual(len(rec["questions"]), 3)
        answered = self.run_lfg("deep-interview", "answer", "--id", "smoke-interview", "--question", "1", "Launch tmux team")
        self.assertEqual(answered["questions"][0]["answer"], "Launch tmux team")
        shown = self.run_lfg("deep-interview", "show", "--id", "smoke-interview")
        self.assertEqual(shown["id"], "smoke-interview")
        self.assertTrue((pathlib.Path(self.tmp.name) / "state" / "current-interview.json").exists())

    def test_mcp_deep_interview_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_deep_interview", "arguments": {"action": "create", "id": "mcp-interview", "topic": "MCP intake"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_deep_interview", "arguments": {"action": "answer", "id": "mcp-interview", "question": 1, "answer": "Verified outcome"}}},
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close(); proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill(); proc.wait(timeout=5)
        proc.stdout.close()
        create_payload = json.loads(replies[1]["result"]["content"][0]["text"])
        answer_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(create_payload["returncode"], 0)
        self.assertEqual(answer_payload["returncode"], 0)
        self.assertIn('"id": "mcp-interview"', create_payload["stdout"])
        self.assertIn('"answer": "Verified outcome"', answer_payload["stdout"])

    def test_autoresearch_create_source_show(self) -> None:
        rec = self.run_lfg("autoresearch", "create", "How should team mode work?", "--id", "smoke-research")
        self.assertEqual(rec["status"], "open")
        self.assertEqual(rec["sources"], [])
        sourced = self.run_lfg("autoresearch", "add-source", "https://github.com/Yeachan-Heo/oh-my-codex", "--id", "smoke-research", "--note", "reference workflow")
        self.assertEqual(sourced["sources"][0]["note"], "reference workflow")
        shown = self.run_lfg("autoresearch", "show", "--id", "smoke-research")
        self.assertEqual(shown["id"], "smoke-research")
        self.assertTrue((pathlib.Path(self.tmp.name) / "state" / "current-research.json").exists())

    def test_mcp_autoresearch_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_autoresearch", "arguments": {"action": "create", "id": "mcp-research", "question": "MCP research"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_autoresearch", "arguments": {"action": "add-source", "id": "mcp-research", "url": "https://example.com", "note": "example"}}},
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close(); proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill(); proc.wait(timeout=5)
        proc.stdout.close()
        create_payload = json.loads(replies[1]["result"]["content"][0]["text"])
        source_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(create_payload["returncode"], 0)
        self.assertEqual(source_payload["returncode"], 0)
        self.assertIn('"id": "mcp-research"', create_payload["stdout"])
        self.assertIn('"note": "example"', source_payload["stdout"])

    def test_cleanup_create_list_persists_report(self) -> None:
        report = self.run_lfg("ai-slop-cleaner", "create", "--scope", "README.md", "--verification", "self-test")
        self.assertEqual(report["scope"], ["README.md"])
        self.assertEqual(report["behaviorLock"], "self-test")
        self.assertEqual(report["status"], "planned")
        self.assertTrue((pathlib.Path(self.tmp.name) / "state" / "last-cleanup.json").exists())
        listed = self.run_lfg("ai-slop-cleaner", "list")
        self.assertEqual(listed["count"], 1)

    def test_mcp_cleanup_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_cleanup", "arguments": {"action": "create", "scope": "README.md", "verification": "self-test"}}},
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close(); proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill(); proc.wait(timeout=5)
        proc.stdout.close()
        payload = json.loads(replies[1]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"behaviorLock": "self-test"', payload["stdout"])
        self.assertIn('"status": "planned"', payload["stdout"])

    def test_worker_ack_result_status(self) -> None:
        ack = self.run_lfg("worker", "ack", "worker-1", "fix tests")
        self.assertEqual(ack["status"], "ack")
        result = self.run_lfg("worker", "result", "worker-1", "tests pass", "--status", "complete")
        self.assertEqual(result["status"], "complete")
        shown = self.run_lfg("worker", "status", "worker-1")
        self.assertEqual(shown["result"], "tests pass")

    def test_mcp_worker_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_worker", "arguments": {"action": "ack", "worker": "mcp-worker", "task": "verify"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_worker", "arguments": {"action": "result", "worker": "mcp-worker", "result": "ok", "status": "complete"}}},
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close(); proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill(); proc.wait(timeout=5)
        proc.stdout.close()
        ack_payload = json.loads(replies[1]["result"]["content"][0]["text"])
        result_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(ack_payload["returncode"], 0)
        self.assertEqual(result_payload["returncode"], 0)
        self.assertIn('"worker": "mcp-worker"', ack_payload["stdout"])
        self.assertIn('"status": "complete"', result_payload["stdout"])

    def test_ralph_create_step_show(self) -> None:
        rec = self.run_lfg("ralph", "create", "iterate until tests pass", "--id", "smoke-ralph", "--max-iterations", "2")
        self.assertEqual(rec["iteration"], 0)
        stepped = self.run_lfg("ralph", "step", "--id", "smoke-ralph", "--status", "complete", "--evidence", "tests pass")
        self.assertEqual(stepped["iteration"], 1)
        self.assertEqual(stepped["status"], "complete")
        shown = self.run_lfg("ralph", "show", "--id", "smoke-ralph")
        self.assertEqual(shown["events"][-1]["evidence"], "tests pass")

    def test_mcp_ralph_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_ralph", "arguments": {"action": "create", "id": "mcp-ralph", "objective": "MCP loop", "maxIterations": 2}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_ralph", "arguments": {"action": "step", "id": "mcp-ralph", "status": "complete", "evidence": "ok"}}},
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in messages]
        proc.stdin.close(); proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill(); proc.wait(timeout=5)
        proc.stdout.close()
        create_payload = json.loads(replies[1]["result"]["content"][0]["text"])
        step_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(create_payload["returncode"], 0)
        self.assertEqual(step_payload["returncode"], 0)
        self.assertIn('"id": "mcp-ralph"', create_payload["stdout"])
        self.assertIn('"status": "complete"', step_payload["stdout"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
