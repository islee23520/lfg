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


if __name__ == "__main__":
    unittest.main(verbosity=2)
