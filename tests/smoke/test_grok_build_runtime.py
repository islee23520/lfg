#!/usr/bin/env python3
"""Smoke/TDD coverage for the lfg MVP runtime.

This is intentionally dependency-free so marketplace users can run it with the
system Python.  The suite is organized as a feature coverage matrix; every item
must pass for the smoke coverage score to be 100%.
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import subprocess
import tempfile
import unittest
import argparse
import importlib.util
import importlib

REPO = pathlib.Path(__file__).resolve().parents[2]
PLUGIN = REPO / "plugins" / "lfg"
LFG = PLUGIN / "bin" / "lfg"
ULW = PLUGIN / "bin" / "ulw"
MCP = PLUGIN / "bin" / "lfg-mcp.py"


def load_grok_build_module():
    spec = importlib.util.spec_from_file_location("grok_build_runtime", PLUGIN / "bin" / "lfg.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeTty:
    def isatty(self) -> bool:
        return True


class RuntimeSmoke(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.env = os.environ.copy()
        self.env["GROK_PLUGIN_ROOT"] = str(PLUGIN)
        self.env["GROK_PLUGIN_DATA"] = self.tmp.name
        self.env["HOME"] = self.tmp.name

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

    def test_all_skill_surfaces_have_roadmap_and_feature_docs(self) -> None:
        roadmap = (REPO / "ROADMAP.md").read_text(encoding="utf-8")
        self.assertIn("- [x] Add behavioral smoke tests per workflow.", roadmap)
        self.assertIn("- [x] MCP stderr isolation.", roadmap)
        self.assertIn("- [x] State migration/versioning.", roadmap)
        self.assertIn("- [x] Marketplace release notes.", roadmap)
        self.assertIn("- [x] Publish/host marketplace metadata", roadmap)
        self.assertIn("- [x] Document exact marketplace source URL.", roadmap)
        self.assertIn("marketplace-source=ok", roadmap)
        self.assertIn("- [x] Release tags.", roadmap)
        self.assertIn("- [x] Verify install from Grok UI/TUI marketplace flow.", roadmap)
        self.assertIn("- [x] Remove local-dev install from primary docs once marketplace flow is stable.", roadmap)
        self.assertIn("grok-plugins-surface=ok", roadmap)
        self.assertIn("grok-plugin-hook-scope=not-observed", roadmap)
        self.assertIn("grok-global-hook-bridge=ok", roadmap)
        self.assertIn("grok-installed-mcp-surface=ok", roadmap)
        self.assertIn("lfg-installed-symlink-surface=ok", roadmap)
        self.assertIn("aliases=lfg,ulw", roadmap)
        self.assertIn("lfg-inside-tmux-attach=ok", roadmap)
        self.assertIn("lfg hook-bridge status/install", roadmap)
        self.assertIn("MCP `grok_build_hook_bridge`", roadmap)
        self.assertIn("release-tag=ok", roadmap)
        self.assertIn("release-notes=ok", roadmap)
        self.assertIn("state-schema-versioning=ok", roadmap)
        self.assertIn("mcp-stdio-isolation=ok", roadmap)
        self.assertIn("team-tmux-lifecycle=ok", roadmap)
        self.assertIn("team-preflight-cli=ok", roadmap)
        self.assertIn("team-preflight-commands=ok", roadmap)
        self.assertIn("team-provider-matrix=ok", roadmap)
        self.assertIn("team-provider-slash=ok", roadmap)
        self.assertIn("team-provider-commands=ok", roadmap)
        skill_names = sorted(
            path.name
            for path in (PLUGIN / "skills").iterdir()
            if path.is_dir() and path.name != "lfg"
        )
        self.assertEqual(len(skill_names), 27)
        missing_rows = [name for name in skill_names if f"| `/{name}` " not in roadmap]
        self.assertEqual(missing_rows, [])
        missing_docs = [
            name
            for name in skill_names
            if not (PLUGIN / "docs" / "features" / f"{name}-runtime.md").exists()
        ]
        self.assertEqual(missing_docs, [])

    def test_mcp_exposes_runtime_tools_for_skill_surface(self) -> None:
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout
        for msg in [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        ]:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        replies = [json.loads(proc.stdout.readline()) for _ in range(2)]
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
        expected = {
            "grok_build_analyze",
            "grok_build_ask",
            "grok_build_autopilot",
            "grok_build_autoresearch",
            "grok_build_autoresearch_goal",
            "grok_build_cancel",
            "grok_build_catalog",
            "grok_build_cleanup",
            "grok_build_code_review",
            "grok_build_deep_interview",
            "grok_build_design",
            "grok_build_doctor",
            "grok_build_goal",
            "grok_build_hook_bridge",
            "grok_build_hud",
            "grok_build_notifications",
            "grok_build_omx_setup",
            "grok_build_performance_goal",
            "grok_build_pipeline",
            "grok_build_plan",
            "grok_build_ralph",
            "grok_build_ralplan",
            "grok_build_runtime",
            "grok_build_skill",
            "grok_build_slash",
            "grok_build_team",
            "grok_build_ultraqa",
            "grok_build_ultrawork",
            "grok_build_ultragoal",
            "grok_build_visual_ralph",
            "grok_build_wiki",
            "grok_build_worker",
        }
        self.assertEqual(expected - tool_names, set())



    def test_ci_and_install_smoke_contracts(self) -> None:
        workflow = (REPO / ".github/workflows/smoke.yml").read_text(encoding="utf-8")
        self.assertIn("plugins/lfg/bin/self-test.sh", workflow)
        self.assertIn("actions/checkout@v5", workflow)
        self.assertIn("sudo apt-get install -y tmux", workflow)
        self.assertIn("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24", workflow)
        install_smoke = PLUGIN / "bin" / "grok-install-smoke.sh"
        self.assertTrue(os.access(install_smoke, os.X_OK))
        script = install_smoke.read_text(encoding="utf-8")
        self.assertIn("rsync -a --delete", script)
        self.assertIn("inspect --json", script)
        self.assertIn("assert len(skills) == 28", script)
        self.assertIn("grok-install-smoke=ok skills=28", script)
        install_lfg = REPO / "scripts" / "install-lfg-symlink.sh"
        self.assertTrue(os.access(install_lfg, os.X_OK))
        install_script = install_lfg.read_text(encoding="utf-8")
        self.assertIn("ln -sfn", install_script)
        self.assertIn("lfg.py", install_script)
        self.assertIn('ln -sfn "$SRC_DIR/ulw"', install_script)
        self.assertIn("lfg-status=ok", install_script)
        self.assertIn("ulw-status=ok", install_script)
        self.assertIn("lfg-doctor=ok", install_script)
        launch_lfg = REPO / "scripts" / "verify-lfg-launch.sh"
        self.assertTrue(os.access(launch_lfg, os.X_OK))
        launch_script = launch_lfg.read_text(encoding="utf-8")
        self.assertIn("lfg-launch-smoke=ok", launch_script)
        self.assertIn("ulw-launch-json=ok", launch_script)
        self.assertIn("tmux has-session", launch_script)
        runtime = (PLUGIN / "bin" / "lfg.py").read_text(encoding="utf-8")
        self.assertIn("def attach_backend_from_tmux_pane", runtime)
        self.assertIn("split-window", runtime)
        all_ready = REPO / "scripts" / "verify-release-readiness-all.sh"
        self.assertTrue(os.access(all_ready, os.X_OK))
        all_ready_script = all_ready.read_text(encoding="utf-8")
        self.assertIn("release-readiness-all=ok", all_ready_script)
        self.assertIn("verify-release-readiness-local.sh", all_ready_script)
        self.assertIn("verify-release-readiness-remote.sh", all_ready_script)
        remote_ready = REPO / "scripts" / "verify-release-readiness-remote.sh"
        self.assertTrue(os.access(remote_ready, os.X_OK))
        remote_ready_script = remote_ready.read_text(encoding="utf-8")
        self.assertIn("release-readiness-remote=ok", remote_ready_script)
        self.assertIn("verify-remote-smoke.sh", remote_ready_script)
        self.assertIn("verify-release-tag.sh", remote_ready_script)
        release_ready = REPO / "scripts" / "verify-release-readiness-local.sh"
        self.assertTrue(os.access(release_ready, os.X_OK))
        release_ready_script = release_ready.read_text(encoding="utf-8")
        self.assertIn("release-readiness-local=ok", release_ready_script)
        self.assertIn("verify-installed-lfg-symlink-surface.sh", release_ready_script)
        self.assertIn("verify-grok-installed-mcp-surface.sh", release_ready_script)
        team_preflight = REPO / "scripts" / "verify-team-preflight.sh"
        self.assertTrue(os.access(team_preflight, os.X_OK))
        team_preflight_script = team_preflight.read_text(encoding="utf-8")
        self.assertIn("team-preflight-cli=ok", team_preflight_script)
        self.assertIn("team-preflight-commands=ok", team_preflight_script)
        self.assertIn("team-preflight-slash=ok", team_preflight_script)
        self.assertIn("team-preflight-mcp=ok", team_preflight_script)
        team_provider = REPO / "scripts" / "verify-team-provider-commands.sh"
        self.assertTrue(os.access(team_provider, os.X_OK))
        team_provider_script = team_provider.read_text(encoding="utf-8")
        self.assertIn("team-provider-matrix=ok", team_provider_script)
        self.assertIn("team-provider-slash=ok", team_provider_script)
        self.assertIn("team-provider-commands=ok", team_provider_script)
        self.assertIn("team-provider-doctor=ok", team_provider_script)
        team_lifecycle = REPO / "scripts" / "verify-team-tmux-lifecycle.sh"
        self.assertTrue(os.access(team_lifecycle, os.X_OK))
        team_lifecycle_script = team_lifecycle.read_text(encoding="utf-8")
        self.assertIn("team-tmux-lifecycle=ok", team_lifecycle_script)
        self.assertIn("team create", team_lifecycle_script)
        self.assertIn("team status", team_lifecycle_script)
        self.assertIn("team resume", team_lifecycle_script)
        self.assertIn("team shutdown", team_lifecycle_script)
        plugins_surface = REPO / "scripts" / "verify-grok-plugins-surface.sh"
        self.assertTrue(os.access(plugins_surface, os.X_OK))
        plugins_surface_script = plugins_surface.read_text(encoding="utf-8")
        self.assertIn("grok-plugins-list=ok", plugins_surface_script)
        self.assertIn("grok-plugins-surface=ok", plugins_surface_script)
        readme = (REPO / "README.md").read_text(encoding="utf-8")
        self.assertNotIn("cp -R plugins/lfg ~/.grok/plugins/lfg", readme)
        self.assertIn("docs/SMOKE.md", readme)
        self.assertIn("/team providers", readme)
        self.assertIn("/team preflight", readme)
        self.assertIn("lfg team preflight", readme)
        self.assertIn("noop", readme)
        self.assertIn("verify-release-readiness-all.sh", readme)
        self.assertIn("release-readiness-all=ok", readme)
        release_tag = REPO / "scripts" / "verify-release-tag.sh"
        self.assertTrue(os.access(release_tag, os.X_OK))
        release_tag_script = release_tag.read_text(encoding="utf-8")
        self.assertIn("release-tag=ok", release_tag_script)
        self.assertIn("release-tag-remote=ok", release_tag_script)
        release_tag_doc = (REPO / "docs" / "RELEASE_TAGS.md").read_text(encoding="utf-8")
        self.assertIn("lfg-v0.3.0-p1", release_tag_doc)
        hook_bridge = REPO / "scripts" / "verify-lfg-global-hook-bridge.sh"
        self.assertTrue(os.access(hook_bridge, os.X_OK))
        hook_bridge_script = hook_bridge.read_text(encoding="utf-8")
        self.assertIn("grok-global-hook-bridge=ok", hook_bridge_script)
        install_bridge = REPO / "scripts" / "install-lfg-global-hook-bridge.sh"
        self.assertTrue(os.access(install_bridge, os.X_OK))
        self.assertIn("lfg-audit-bridge.json", install_bridge.read_text(encoding="utf-8"))
        installed_mcp = REPO / "scripts" / "verify-grok-installed-mcp-surface.sh"
        self.assertTrue(os.access(installed_mcp, os.X_OK))
        installed_mcp_script = installed_mcp.read_text(encoding="utf-8")
        self.assertIn("grok-installed-mcp-surface=ok", installed_mcp_script)
        self.assertIn("grok_build_hook_bridge", installed_mcp_script)
        self.assertIn("grok_build_team", installed_mcp_script)
        self.assertIn("grok_build_team.providers", installed_mcp_script)
        self.assertIn("grok_build_team.preflight", installed_mcp_script)
        self.assertIn("commands=ok", installed_mcp_script)
        installed_lfg = REPO / "scripts" / "verify-installed-lfg-symlink-surface.sh"
        self.assertTrue(os.access(installed_lfg, os.X_OK))
        installed_lfg_script = installed_lfg.read_text(encoding="utf-8")
        self.assertIn("lfg-installed-symlink-surface=ok", installed_lfg_script)
        self.assertIn("slash=/team-providers,/team-preflight commands=ok", installed_lfg_script)
        self.assertIn("/team providers", installed_lfg_script)
        self.assertIn("/team preflight", installed_lfg_script)
        self.assertIn("createNoopSmoke", installed_lfg_script)
        self.assertIn("tmux has-session -t lfg-backend", installed_lfg_script)
        inside_tmux = REPO / "scripts" / "verify-lfg-inside-tmux-attach.sh"
        self.assertTrue(os.access(inside_tmux, os.X_OK))
        inside_tmux_script = inside_tmux.read_text(encoding="utf-8")
        self.assertIn("lfg-inside-tmux-attach=ok", inside_tmux_script)
        self.assertIn("split-window", inside_tmux_script)
        hook_limitation = REPO / "scripts" / "verify-grok-hook-headless-limitation.sh"
        self.assertTrue(os.access(hook_limitation, os.X_OK))
        hook_limitation_script = hook_limitation.read_text(encoding="utf-8")
        self.assertIn("grok-real-tool-session=ok", hook_limitation_script)
        self.assertIn("grok-headless-hook-emission=not-observed", hook_limitation_script)
        hook_discovery = REPO / "scripts" / "verify-grok-hook-discovery.sh"
        self.assertTrue(os.access(hook_discovery, os.X_OK))
        hook_discovery_script = hook_discovery.read_text(encoding="utf-8")
        self.assertIn("grok-hook-discovery=ok", hook_discovery_script)
        self.assertIn("hook-event-replay=ok", hook_discovery_script)
        self.assertIn("grok-headless-session=ok", hook_discovery_script)
        hook_doc = (REPO / "docs" / "HOOK_EVIDENCE.md").read_text(encoding="utf-8")
        self.assertIn("scripts/lfg-audit-hook.sh", hook_doc)
        self.assertIn("lfg hook-bridge install", hook_doc)
        self.assertIn("grok_build_hook_bridge", hook_doc)
        smoke_doc = (REPO / "docs" / "SMOKE.md").read_text(encoding="utf-8")
        self.assertIn("lfg --json hook-bridge install", smoke_doc)
        self.assertIn("lfg --json slash '/hook-bridge status'", smoke_doc)
        marketplace_source = REPO / "scripts" / "verify-marketplace-source.sh"
        self.assertTrue(os.access(marketplace_source, os.X_OK))
        marketplace_source_script = marketplace_source.read_text(encoding="utf-8")
        self.assertIn("marketplace-source=ok", marketplace_source_script)
        self.assertIn("marketplace-remote-source=ok", marketplace_source_script)
        marketplace_install_doc = (REPO / "docs" / "MARKETPLACE_INSTALL.md").read_text(encoding="utf-8")
        self.assertIn("https://raw.githubusercontent.com/islee23520/lfg/main/.grok/plugins/marketplace.json", marketplace_install_doc)
        self.assertIn("https://raw.githubusercontent.com/islee23520/lfg/p1/.grok/plugins/marketplace.json", marketplace_install_doc)
        release_notes = REPO / "scripts" / "verify-release-notes.sh"
        self.assertTrue(os.access(release_notes, os.X_OK))
        release_notes_script = release_notes.read_text(encoding="utf-8")
        self.assertIn("release-notes=ok", release_notes_script)
        release_notes_doc = (REPO / "docs" / "MARKETPLACE_RELEASE_NOTES.md").read_text(encoding="utf-8")
        self.assertIn("linalab-io/lfg", release_notes_doc)
        self.assertIn("lfg 0.3.0", release_notes_doc)
        self.assertIn("/plugins", release_notes_doc)
        release_checklist = (REPO / "docs" / "RELEASE_CHECKLIST.md").read_text(encoding="utf-8")
        self.assertIn("release-readiness-local=ok", release_checklist)
        self.assertIn("scripts/verify-release-readiness-local.sh", release_checklist)
        self.assertIn("release-readiness-remote=ok", release_checklist)
        self.assertIn("scripts/verify-release-readiness-remote.sh", release_checklist)
        self.assertIn("release-readiness-all=ok", release_checklist)
        self.assertIn("scripts/verify-release-readiness-all.sh", release_checklist)
        self.assertIn("/team providers", release_checklist)
        self.assertIn("/team preflight", release_checklist)
        self.assertIn("grok_build_team.preflight", release_checklist)
        self.assertIn("commands=ok", release_checklist)
        state_schema = REPO / "scripts" / "verify-state-schema.sh"
        self.assertTrue(os.access(state_schema, os.X_OK))
        state_schema_script = state_schema.read_text(encoding="utf-8")
        self.assertIn("state-schema-versioning=ok", state_schema_script)
        self.assertIn("state-schema-doctor=ok", state_schema_script)
        mcp_stdio = REPO / "scripts" / "verify-mcp-stdio-isolation.sh"
        self.assertTrue(os.access(mcp_stdio, os.X_OK))
        mcp_stdio_script = mcp_stdio.read_text(encoding="utf-8")
        self.assertIn("mcp-stdio-isolation=ok", mcp_stdio_script)
        self.assertIn("mcp-stderr-isolated=ok", mcp_stdio_script)
        remote_smoke = REPO / "scripts" / "verify-remote-smoke.sh"
        self.assertTrue(os.access(remote_smoke, os.X_OK))
        remote_script = remote_smoke.read_text(encoding="utf-8")
        self.assertIn("gh run list", remote_script)
        self.assertIn("gh run view", remote_script)
        self.assertIn("remote-smoke=ok", remote_script)

    def test_marketplace_metadata_points_to_plugin_package(self) -> None:
        for rel in [".grok/plugins/marketplace.json", ".agents/plugins/marketplace.json"]:
            data = json.loads((REPO / rel).read_text(encoding="utf-8"))
            self.assertEqual(data["name"], "linalab-io")
            self.assertEqual(len(data["plugins"]), 1)
            plugin = data["plugins"][0]
            self.assertEqual(plugin["name"], "lfg")
            self.assertEqual(plugin["source"]["source"], "git-subdir")
            self.assertEqual(plugin["source"]["url"], "https://github.com/islee23520/lfg.git")
            self.assertEqual(plugin["source"]["path"], "plugins/lfg")
            self.assertEqual(plugin["metadata"]["packageName"], "linalab-io/lfg")
            self.assertEqual(plugin["metadata"]["reference"], "https://github.com/Yeachan-Heo/oh-my-codex")


    def test_lfg_default_starts_backend_non_interactive(self) -> None:
        proc = subprocess.run([str(LFG), "--json"], cwd=str(REPO), env=self.env, text=True, capture_output=True, check=True, timeout=20)
        launched = json.loads(proc.stdout)
        self.assertEqual(launched["status"], "running")
        self.assertEqual(launched["launcher"], "lfg")
        self.assertEqual(launched["mode"], "tmux-backend")
        self.assertFalse(launched["attached"])
        self.assertIn("tmux attach -t", launched["attachCommand"])

    def test_ulw_alias_matches_lfg_backend_launcher(self) -> None:
        proc = subprocess.run([str(ULW), "--json"], cwd=str(REPO), env=self.env, text=True, capture_output=True, check=True, timeout=20)
        launched = json.loads(proc.stdout)
        self.assertEqual(launched["status"], "running")
        self.assertEqual(launched["launcher"], "ulw")
        self.assertEqual(launched["mode"], "tmux-backend")
        self.assertFalse(launched["attached"])
        self.assertIn("tmux attach -t", launched["attachCommand"])
        status = subprocess.run([str(ULW), "--json", "status"], cwd=str(REPO), env=self.env, text=True, capture_output=True, check=True, timeout=20)
        self.assertTrue(json.loads(status.stdout)["ok"])

    def test_lfg_inside_tmux_respects_triggering_pane(self) -> None:
        module = load_grok_build_module()
        calls: list[list[str]] = []
        original_backend_start = module.backend_start
        original_subprocess_run = module.subprocess.run
        original_stdin = module.sys.stdin
        original_stdout = module.sys.stdout
        original_tmux = os.environ.get("TMUX")
        original_tmux_pane = os.environ.get("TMUX_PANE")
        try:
            setattr(module, "backend_start", lambda args: {"name": args.name or "lfg-backend", "status": "running", "cwd": args.cwd, "attachCommand": "tmux attach -t lfg-backend"})

            def fake_run(argv, **kwargs):
                calls.append(list(argv))
                return subprocess.CompletedProcess(argv, 0, "", "")

            module.subprocess.run = fake_run
            module.sys.stdin = FakeTty()
            module.sys.stdout = FakeTty()
            os.environ["TMUX"] = "/tmp/tmux-test/default,1,0"
            os.environ["TMUX_PANE"] = "%42"

            result = module.lfg_launch(argparse.Namespace(name=None, cwd=str(REPO), json=False))

            self.assertTrue(result["attached"])
            self.assertEqual(result["attachMethod"], "split-window")
            self.assertEqual(result["triggerPane"], "%42")
            self.assertIn(["tmux", "split-window", "-h", "-t", "%42", "-c", str(REPO), "env -u TMUX tmux attach-session -t lfg-backend"], calls)
            self.assertFalse(any(call[:2] == ["tmux", "switch-client"] for call in calls))
        finally:
            setattr(module, "backend_start", original_backend_start)
            module.subprocess.run = original_subprocess_run
            module.sys.stdin = original_stdin
            module.sys.stdout = original_stdout
            if original_tmux is None:
                os.environ.pop("TMUX", None)
            else:
                os.environ["TMUX"] = original_tmux
            if original_tmux_pane is None:
                os.environ.pop("TMUX_PANE", None)
            else:
                os.environ["TMUX_PANE"] = original_tmux_pane

    def test_lfg_inside_tmux_recovers_current_pane_when_env_pane_is_malformed(self) -> None:
        module = load_grok_build_module()
        calls: list[list[str]] = []
        original_backend_start = module.backend_start
        original_subprocess_run = module.subprocess.run
        original_stdin = module.sys.stdin
        original_stdout = module.sys.stdout
        original_tmux = os.environ.get("TMUX")
        original_tmux_pane = os.environ.get("TMUX_PANE")
        try:
            setattr(module, "backend_start", lambda args: {"name": "lfg-backend", "status": "running", "cwd": args.cwd, "attachCommand": "tmux attach -t lfg-backend"})

            def fake_run(argv, **kwargs):
                calls.append(list(argv))
                if list(argv)[:3] == ["tmux", "display-message", "-p"]:
                    return subprocess.CompletedProcess(argv, 0, "%77\n", "")
                return subprocess.CompletedProcess(argv, 0, "", "")

            module.subprocess.run = fake_run
            module.sys.stdin = FakeTty()
            module.sys.stdout = FakeTty()
            os.environ["TMUX"] = "/tmp/tmux-test/default,1,0"
            os.environ["TMUX_PANE"] = "../../bad"

            result = module.lfg_launch(argparse.Namespace(name=None, cwd=str(REPO), json=False))

            self.assertTrue(result["attached"])
            self.assertEqual(result["triggerPane"], "%77")
            self.assertIn(["tmux", "split-window", "-h", "-t", "%77", "-c", str(REPO), "env -u TMUX tmux attach-session -t lfg-backend"], calls)
            self.assertFalse(any("switch-client" in call for call in calls))
        finally:
            setattr(module, "backend_start", original_backend_start)
            module.subprocess.run = original_subprocess_run
            module.sys.stdin = original_stdin
            module.sys.stdout = original_stdout
            if original_tmux is None:
                os.environ.pop("TMUX", None)
            else:
                os.environ["TMUX"] = original_tmux
            if original_tmux_pane is None:
                os.environ.pop("TMUX_PANE", None)
            else:
                os.environ["TMUX_PANE"] = original_tmux_pane

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

    def test_team_spawn_inherits_current_ultragoal_context(self) -> None:
        ug = self.run_lfg("ultragoal", "create", "coordinate swarm", "--id", "team-ulw-ug", "--checklist", "plan;execute;verify")
        self.assertEqual(ug["id"], "team-ulw-ug")
        team = self.run_lfg("team", "create", "2:executor", "ship swarm slice", "--providers", "noop", "--dry-run")
        self.assertEqual(team["ultragoal"], "team-ulw-ug")
        self.assertEqual([m["ultragoal"] for m in team["members"]], ["team-ulw-ug", "team-ulw-ug"])
        self.assertIn("ultragoal team-ulw-ug", team["members"][0]["prompt"])
        self.assertIn("ulw ultragoal checkpoint --id team-ulw-ug", team["members"][0]["prompt"])

    def test_ultragoal_spawn_creates_linked_ulw_team(self) -> None:
        spawned = self.run_lfg("ultragoal", "spawn", "coordinate swarm", "--id", "spawn-ulw-ug", "--spec", "2:executor", "--providers", "noop", "--dry-run")
        self.assertEqual(spawned["ultragoal"]["id"], "spawn-ulw-ug")
        self.assertEqual(spawned["team"]["status"], "planned")
        self.assertEqual(spawned["team"]["ultragoal"], "spawn-ulw-ug")
        self.assertEqual(len(spawned["team"]["members"]), 2)
        self.assertIn("ulw ultragoal checkpoint --id spawn-ulw-ug", spawned["team"]["members"][0]["prompt"])
        slash = self.run_lfg("slash", '/ultragoal spawn 2:executor "slash swarm"', "--providers", "noop", "--dry-run")
        self.assertEqual(slash["team"]["status"], "planned")
        self.assertTrue(slash["team"]["ultragoal"].startswith("ultragoal-"))

    def test_named_agent_provider_override_is_respected(self) -> None:
        team = self.run_lfg("team", "create", "iz,gonow,grok", "provider override", "--providers", "noop", "--dry-run")
        self.assertEqual([m["provider"] for m in team["members"]], ["noop", "noop", "noop"])
        self.assertTrue(all("noop provider ready" in m["command"] for m in team["members"]))

    def test_rejects_unsafe_provider_and_team_name(self) -> None:
        bad_provider = subprocess.run(
            [str(LFG), "--json", "team", "create", "1:iz", "bad provider", "--providers", "noop;touch /tmp/pwn", "--dry-run"],
            cwd=str(REPO),
            env=self.env,
            text=True,
            capture_output=True,
            timeout=20,
        )
        self.assertNotEqual(bad_provider.returncode, 0)
        self.assertIn("unknown provider", bad_provider.stderr)

        bad_name = subprocess.run(
            [str(LFG), "--json", "team", "create", "1:iz", "bad name", "--name", "bad'name", "--providers", "noop", "--dry-run"],
            cwd=str(REPO),
            env=self.env,
            text=True,
            capture_output=True,
            timeout=20,
        )
        self.assertNotEqual(bad_name.returncode, 0)
        self.assertIn("invalid team name", bad_name.stderr)

    def test_rejects_unsafe_ultragoal_id_before_path_write(self) -> None:
        bad_id = subprocess.run(
            [str(LFG), "--json", "ultragoal", "create", "bad id", "--id", "../escape"],
            cwd=str(REPO),
            env=self.env,
            text=True,
            capture_output=True,
            timeout=20,
        )
        self.assertNotEqual(bad_id.returncode, 0)
        self.assertIn("invalid ultragoal id", bad_id.stderr)

    def test_rejects_unsafe_team_refs_for_read_and_shutdown(self) -> None:
        for args in (
            ["team", "status", "../escape"],
            ["team", "resume", "../escape"],
            ["team", "shutdown", "../escape"],
            ["team", "state", "../escape"],
        ):
            proc = subprocess.run(
                [str(LFG), "--json", *args],
                cwd=str(REPO),
                env=self.env,
                text=True,
                capture_output=True,
                timeout=20,
            )
            self.assertNotEqual(proc.returncode, 0, args)
            self.assertIn("invalid team name", proc.stderr, args)

    def test_rejects_unsafe_current_team_pointer(self) -> None:
        state = pathlib.Path(self.tmp.name) / "state"
        state.mkdir(parents=True, exist_ok=True)
        (state / "current-team.json").write_text(json.dumps({"name": "../escape"}), encoding="utf-8")
        for args in (["team", "status"], ["team", "resume"], ["team", "shutdown"]):
            proc = subprocess.run(
                [str(LFG), "--json", *args],
                cwd=str(REPO),
                env=self.env,
                text=True,
                capture_output=True,
                timeout=20,
            )
            self.assertNotEqual(proc.returncode, 0, args)
            self.assertIn("invalid team name", proc.stderr, args)

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
            {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/call",
                "params": {"name": "grok_build_team", "arguments": {"action": "providers"}},
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
        for name in {"grok_build_catalog", "grok_build_runtime", "grok_build_team", "grok_build_slash", "grok_build_hook_bridge"}:
            self.assertIn(name, tool_names)
        payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"status": "planned"', payload["stdout"])
        providers_payload = json.loads(replies[3]["result"]["content"][0]["text"])
        self.assertEqual(providers_payload["returncode"], 0)
        self.assertIn('"smokeSafe": "noop"', providers_payload["stdout"])

    def test_doctor_reports_required_checks(self) -> None:
        report = self.run_lfg("doctor")
        self.assertTrue(report["ok"], report)
        check_names = {check["name"] for check in report["checks"]}
        for required in {"grok_manifest", "mcp_config", "catalog", "skills", "grok_marketplace", "agents_marketplace", "exe:tmux", "plugin_data", "state_schema", "global_hook_bridge", "team_provider_commands"}:
            self.assertIn(required, check_names)
        bridge = next(check for check in report["checks"] if check["name"] == "global_hook_bridge")
        self.assertTrue(bridge["ok"])
        self.assertIn("installed=False", bridge["evidence"])
        self.assertEqual(report["failedRequired"], [])



    def test_team_preflight_cli_and_slash(self) -> None:
        preflight = self.run_lfg("team", "preflight", "--name", "unit-preflight")
        self.assertTrue(preflight["ok"], preflight)
        self.assertTrue(preflight["tmux"]["available"], preflight)
        self.assertEqual(preflight["backend"]["status"], "running")
        self.assertEqual(preflight["summary"]["smokeSafe"], "noop")
        self.assertEqual(preflight["commands"]["providers"], "lfg team providers")
        self.assertIn("--providers noop", preflight["commands"]["createNoopSmoke"])
        slash = self.run_lfg("slash", "/team preflight", "--name", "unit-preflight")
        self.assertTrue(slash["ok"], slash)
        subprocess.run(["tmux", "kill-session", "-t", "unit-preflight"], text=True, capture_output=True)

    def test_team_provider_commands_are_stable(self) -> None:
        module = load_grok_build_module()
        self.assertTrue(module.provider_command("hermes", "hello").startswith("hermes -z "))
        self.assertTrue(module.provider_command("claude", "hello").startswith("claude --permission-mode bypassPermissions "))
        self.assertTrue(module.provider_command("codex", "hello").startswith("codex "))
        self.assertIn("noop provider ready", module.provider_command("noop", "hello"))
        matrix = module.team_provider_matrix()
        providers = {row["provider"] for row in matrix}
        expected = {"hermes", "claude", "codex", "gemini", "copilot", "opencode", "grok", "subagent", "noop"}
        self.assertEqual(expected, providers)
        self.assertTrue(next(row for row in matrix if row["provider"] == "noop")["available"])
        listed = self.run_lfg("team", "providers")
        self.assertTrue(listed["ok"])
        listed_providers = [row["provider"] for row in listed["providers"]]
        self.assertIn("grok", listed_providers)
        self.assertIn("subagent", listed_providers)
        self.assertEqual(listed["smokeSafe"], "noop")
        slash_listed = self.run_lfg("slash", "/team providers")
        slash_providers = [row["provider"] for row in slash_listed["providers"]]
        self.assertIn("grok", slash_providers)
        self.assertEqual(slash_listed["smokeSafe"], "noop")
        team = self.run_lfg("team", "create", "4:executor", "provider smoke", "--providers", "hermes,claude,codex,noop", "--dry-run")
        self.assertEqual([m["provider"] for m in team["members"]], ["hermes", "claude", "codex", "noop"])
        self.assertIn("noop provider ready", team["members"][3]["command"])

    def test_hook_bridge_install_status_uses_home_hooks(self) -> None:
        status = self.run_lfg("hook-bridge", "status")
        self.assertTrue(status["ok"])
        self.assertFalse(status["installed"])
        installed = self.run_lfg("hook-bridge", "install")
        self.assertTrue(installed["ok"], installed)
        self.assertTrue(installed["installed"])
        self.assertTrue(installed["valid"])
        self.assertTrue(pathlib.Path(installed["config"]).exists())
        self.assertTrue(os.access(installed["script"], os.X_OK))
        script = pathlib.Path(installed["script"]).read_text(encoding="utf-8")
        self.assertIn("lfg-audit-hook.sh", script)
        doctor = self.run_lfg("doctor")
        bridge = next(check for check in doctor["checks"] if check["name"] == "global_hook_bridge")
        self.assertIn("installed=True valid=True", bridge["evidence"])


    def test_hook_bridge_slash_and_mcp_tool(self) -> None:
        slash_status = self.run_lfg("slash", "/hook-bridge status")
        self.assertTrue(slash_status["ok"])
        self.assertFalse(slash_status["installed"])
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
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_runtime", "arguments": {"action": "hook_bridge_status"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_hook_bridge", "arguments": {"action": "install"}}},
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
        status_payload = json.loads(replies[1]["result"]["content"][0]["text"])
        install_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(status_payload["returncode"], 0)
        self.assertIn('"installed": false', status_payload["stdout"])
        self.assertEqual(install_payload["returncode"], 0)
        self.assertIn('"valid": true', install_payload["stdout"])

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


    def test_ralplan_create_review_show(self) -> None:
        plan = self.run_lfg("ralplan", "create", "Consensus plan", "--id", "smoke-ralplan", "--steps", "design;verify")
        self.assertEqual(plan["consensus"], "pending")
        self.assertEqual([s["text"] for s in plan["steps"]], ["design", "verify"])
        reviewed = self.run_lfg("ralplan", "review", "--id", "smoke-ralplan", "--verdict", "approve", "--reviewer", "architect", "--evidence", "looks safe")
        self.assertEqual(reviewed["status"], "complete")
        self.assertEqual(reviewed["consensus"], "approve")
        shown = self.run_lfg("ralplan", "show", "--id", "smoke-ralplan")
        self.assertEqual(shown["reviews"][0]["evidence"], "looks safe")

    def test_mcp_ralplan_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_ralplan", "arguments": {"action": "create", "id": "mcp-ralplan", "title": "MCP consensus", "steps": "design;verify"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_ralplan", "arguments": {"action": "review", "id": "mcp-ralplan", "verdict": "approve", "reviewer": "architect", "evidence": "ok"}}},
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
        review_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(create_payload["returncode"], 0)
        self.assertEqual(review_payload["returncode"], 0)
        self.assertIn('"id": "mcp-ralplan"', create_payload["stdout"])
        self.assertIn('"consensus": "approve"', review_payload["stdout"])

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

    def test_ultragoal_create_status_checkpoint_show(self) -> None:
        # exercises the new OMX-parity ultragoal surface
        ug = self.run_lfg("ultragoal", "create", "Smoke ultragoal parity", "--id", "smoke-ug", "--brief", "test brief", "--checklist", "a;b")
        self.assertEqual(ug["id"], "smoke-ug")
        self.assertTrue((pathlib.Path(self.tmp.name) / "ultragoal" / "smoke-ug" / "brief.md").exists())
        st = self.run_lfg("ultragoal", "status", "--id", "smoke-ug")
        self.assertEqual(st["goals"]["aggregateStatus"], "active")
        cp = self.run_lfg("ultragoal", "checkpoint", "--id", "smoke-ug", "--status", "complete", "--evidence", "ai-slop + code-review APPROVE + tests", "--force-gate")
        self.assertEqual(cp["status"], "complete")
        sh = self.run_lfg("ultragoal", "show", "--id", "smoke-ug")
        self.assertIn("brief", sh)
        self.assertTrue(len(sh.get("recentLedger", [])) >= 1)

    def test_mcp_ultragoal_tool_detailed(self) -> None:
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
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_ultragoal", "arguments": {"action": "create", "id": "mcp-ug", "objective": "MCP ultragoal"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_ultragoal", "arguments": {"action": "status", "id": "mcp-ug"}}},
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
        status_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(create_payload["returncode"], 0)
        self.assertEqual(status_payload["returncode"], 0)
        self.assertIn('"id": "mcp-ug"', create_payload["stdout"])

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
        self.assertIn("lfg", hud["text"])

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
        self.assertIn('"text": "lfg', payload["stdout"])


    def test_performance_goal_create_measure_show(self) -> None:
        goal = self.run_lfg("performance-goal", "create", "reduce latency", "--id", "smoke-perf", "--metrics", "latency")
        self.assertEqual(goal["gate"], "needs-baseline")
        measured = self.run_lfg("performance-goal", "measure", "--id", "smoke-perf", "--metric", "latency", "--baseline", "120", "--current", "80", "--target", "100", "--evidence", "bench ok")
        self.assertEqual(measured["gate"], "pass")
        self.assertEqual(measured["metrics"][0]["status"], "pass")
        shown = self.run_lfg("performance-goal", "show", "--id", "smoke-perf")
        self.assertEqual(shown["measurements"][0]["evidence"], "bench ok")

    def test_mcp_performance_goal_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_performance_goal", "arguments": {"action": "create", "id": "mcp-perf", "objective": "MCP perf", "metrics": "latency"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_performance_goal", "arguments": {"action": "measure", "id": "mcp-perf", "metric": "latency", "baseline": 120, "current": 80, "target": 100, "evidence": "ok"}}},
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
        measure_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(create_payload["returncode"], 0)
        self.assertEqual(measure_payload["returncode"], 0)
        self.assertIn('"id": "mcp-perf"', create_payload["stdout"])
        self.assertIn('"gate": "pass"', measure_payload["stdout"])


    def test_visual_ralph_create_verdict_show(self) -> None:
        run = self.run_lfg("visual-ralph", "create", "http://localhost:3000", "--id", "smoke-visual", "--reference", "design.png", "--threshold", "0.9")
        self.assertEqual(run["target"], "http://localhost:3000")
        self.assertEqual(run["status"], "active")
        verdict = self.run_lfg("visual-ralph", "verdict", "--id", "smoke-visual", "--score", "0.91", "--status", "pass", "--evidence", "pixel diff ok")
        self.assertEqual(verdict["status"], "complete")
        self.assertEqual(verdict["verdicts"][0]["evidence"], "pixel diff ok")
        shown = self.run_lfg("visual-ralph", "show", "--id", "smoke-visual")
        self.assertEqual(shown["iteration"], 1)

    def test_mcp_visual_ralph_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_visual_ralph", "arguments": {"action": "create", "id": "mcp-visual", "target": "http://localhost:3000", "reference": "design.png", "threshold": 0.9}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_visual_ralph", "arguments": {"action": "verdict", "id": "mcp-visual", "score": 0.91, "status": "pass", "evidence": "ok"}}},
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
        verdict_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(create_payload["returncode"], 0)
        self.assertEqual(verdict_payload["returncode"], 0)
        self.assertIn('"id": "mcp-visual"', create_payload["stdout"])
        self.assertIn('"status": "complete"', verdict_payload["stdout"])


    def test_autoresearch_goal_create_critique_show(self) -> None:
        run = self.run_lfg("autoresearch-goal", "create", "What is safest?", "--id", "smoke-arg", "--hypotheses", "A;B")
        self.assertEqual(run["gate"], "needs-critique")
        self.assertEqual(run["hypotheses"], ["A", "B"])
        critiqued = self.run_lfg("autoresearch-goal", "critique", "--id", "smoke-arg", "--verdict", "pass", "--critic", "professor", "--evidence", "sources verified")
        self.assertEqual(critiqued["gate"], "pass")
        self.assertEqual(critiqued["status"], "complete")
        shown = self.run_lfg("autoresearch-goal", "show", "--id", "smoke-arg")
        self.assertEqual(shown["critiques"][0]["critic"], "professor")

    def test_mcp_autoresearch_goal_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_autoresearch_goal", "arguments": {"action": "create", "id": "mcp-arg", "question": "MCP research goal", "hypotheses": "A;B"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_autoresearch_goal", "arguments": {"action": "critique", "id": "mcp-arg", "verdict": "pass", "critic": "professor", "evidence": "ok"}}},
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
        critique_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(create_payload["returncode"], 0)
        self.assertEqual(critique_payload["returncode"], 0)
        self.assertIn('"id": "mcp-arg"', create_payload["stdout"])
        self.assertIn('"gate": "pass"', critique_payload["stdout"])


    def test_omx_setup_check_plan_show(self) -> None:
        check = self.run_lfg("omx-setup", "check")
        self.assertEqual(check["status"], "ok")
        self.assertTrue(check["checks"]["manifestExists"])
        plan = self.run_lfg("omx-setup", "install-plan", "--marketplace", "linalab-io/lfg")
        self.assertEqual(plan["status"], "planned")
        shown = self.run_lfg("omx-setup", "show")
        self.assertEqual(shown["marketplace"], "linalab-io/lfg")

    def test_mcp_omx_setup_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_omx_setup", "arguments": {"action": "install-plan", "marketplace": "linalab-io/lfg"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_omx_setup", "arguments": {"action": "show"}}},
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
        plan_payload = json.loads(replies[1]["result"]["content"][0]["text"])
        show_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(plan_payload["returncode"], 0)
        self.assertEqual(show_payload["returncode"], 0)
        self.assertIn('"status": "planned"', plan_payload["stdout"])
        self.assertIn('linalab-io/lfg', show_payload["stdout"])

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

    def test_autopilot_create_advance_show(self) -> None:
        run = self.run_lfg("autopilot", "create", "ship strict loop", "--id", "smoke-autopilot")
        self.assertEqual(run["id"], "smoke-autopilot")
        self.assertEqual([p["workflow"] for p in run["phases"]], ["ralplan", "ralph", "code-review"])
        self.assertEqual(run["currentPhase"], "plan")
        updated = self.run_lfg("autopilot", "advance", "--id", "smoke-autopilot", "--phase", "1", "--status", "complete", "--evidence", "plan ok")
        self.assertEqual(updated["phases"][0]["status"], "complete")
        self.assertEqual(updated["currentPhase"], "execute")
        shown = self.run_lfg("autopilot", "show", "--id", "smoke-autopilot")
        self.assertEqual(shown["phases"][0]["evidence"], "plan ok")

    def test_mcp_autopilot_tool(self) -> None:
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
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_autopilot", "arguments": {"action": "create", "id": "mcp-autopilot", "objective": "MCP autopilot"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_autopilot", "arguments": {"action": "advance", "id": "mcp-autopilot", "phase": 1, "status": "complete", "evidence": "ok"}}},
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
        self.assertIn('"id": "mcp-autopilot"', create_payload["stdout"])
        self.assertIn('"currentPhase": "execute"', update_payload["stdout"])

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

    def test_ultrawork_create_update_show(self) -> None:
        rec = self.run_lfg("ultrawork", "create", "ship batch", "--id", "smoke-ultrawork", "--tasks", "one;two")
        self.assertEqual(len(rec["tasks"]), 2)
        updated = self.run_lfg("ultrawork", "update", "--id", "smoke-ultrawork", "--task", "1", "--status", "complete", "--evidence", "verified")
        self.assertEqual(updated["tasks"][0]["status"], "complete")
        shown = self.run_lfg("ultrawork", "show", "--id", "smoke-ultrawork")
        self.assertEqual(shown["tasks"][0]["evidence"], "verified")

    def test_mcp_ultrawork_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_ultrawork", "arguments": {"action": "create", "id": "mcp-ultrawork", "objective": "MCP batch", "tasks": "a;b"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_ultrawork", "arguments": {"action": "update", "id": "mcp-ultrawork", "task": 1, "status": "complete", "evidence": "ok"}}},
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
        update_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(create_payload["returncode"], 0)
        self.assertEqual(update_payload["returncode"], 0)
        self.assertIn('"id": "mcp-ultrawork"', create_payload["stdout"])
        self.assertIn('"evidence": "ok"', update_payload["stdout"])

    def test_ultragoal_create_checkpoint_show_and_slash(self) -> None:
        rec = self.run_lfg("ultragoal", "create", "ship durable goal", "--id", "smoke-ultragoal", "--checklist", "design;verify", "--brief", "brief text")
        self.assertEqual(rec["id"], "smoke-ultragoal")
        self.assertEqual(rec["goals"]["backingGoal"]["id"], "backing-smoke-ultragoal")
        status = self.run_lfg("ultragoal", "checkpoint", "--id", "smoke-ultragoal", "--status", "blocked", "--evidence", "needs provider")
        self.assertEqual(status["status"], "blocked")
        shown = self.run_lfg("ultragoal", "show", "--id", "smoke-ultragoal")
        self.assertEqual(shown["brief"].strip(), "brief text")
        self.assertEqual(shown["recentLedger"][-1]["evidence"], "needs provider")
        slash = self.run_lfg("slash", '/ultragoal show smoke-ultragoal')
        self.assertEqual(slash["id"], "smoke-ultragoal")

    def test_mcp_ultragoal_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_ultragoal", "arguments": {"action": "create", "id": "mcp-ultragoal", "objective": "MCP durable", "checklist": "design;verify"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_ultragoal", "arguments": {"action": "checkpoint", "id": "mcp-ultragoal", "status": "complete", "evidence": "forced smoke gate", "forceGate": True}}},
            {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "grok_build_ultragoal", "arguments": {"action": "show", "id": "mcp-ultragoal"}}},
            {"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "grok_build_ultragoal", "arguments": {"action": "spawn", "id": "mcp-spawn-ultragoal", "objective": "MCP swarm", "spec": "2:executor", "providers": "noop", "dryRun": True}}},
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
        checkpoint_payload = json.loads(replies[2]["result"]["content"][0]["text"])
        show_payload = json.loads(replies[3]["result"]["content"][0]["text"])
        spawn_payload = json.loads(replies[4]["result"]["content"][0]["text"])
        self.assertEqual(create_payload["returncode"], 0)
        self.assertEqual(checkpoint_payload["returncode"], 0)
        self.assertEqual(show_payload["returncode"], 0)
        self.assertEqual(spawn_payload["returncode"], 0)
        self.assertIn('"id": "mcp-ultragoal"', create_payload["stdout"])
        self.assertIn('"status": "complete"', checkpoint_payload["stdout"])
        self.assertIn('"brief"', show_payload["stdout"])
        self.assertIn('"ultragoal": "mcp-spawn-ultragoal"', spawn_payload["stdout"])


class IdentityAlignmentSmoke(unittest.TestCase):
    """Verify lina/gonow/iz are canonical primary identities; Sisyphus/Hephaestus/Oracle are lineage-only."""

    AGENTS_DIR = PLUGIN / "lfg-agents"
    GROK_BUILD = PLUGIN / "bin" / "lfg.py"
    HARNESS = PLUGIN / "hooks" / "scripts" / "lfg-goal-harness.py"

    def _load_agent(self, filename: str) -> dict:
        return json.loads((self.AGENTS_DIR / filename).read_text(encoding="utf-8"))

    def test_lina_prompt_primary_identity(self) -> None:
        agent = self._load_agent("lina-orchestrator.json")
        base = agent["prompt_overrides"]["base"]
        self.assertIn("You are Lina", base)
        self.assertNotIn("but in your deepest identity you are Sisyphus", base)

    def test_gonow_prompt_primary_identity(self) -> None:
        agent = self._load_agent("gonow-worker.json")
        base = agent["prompt_overrides"]["base"]
        self.assertIn("You are GoNow", base)
        self.assertNotIn("but in your deepest identity you are Hephaestus", base)

    def test_iz_prompt_primary_identity(self) -> None:
        agent = self._load_agent("iz-architect.json")
        base = agent["prompt_overrides"]["base"]
        deep = agent["prompt_overrides"]["deep"]
        self.assertIn("You are IZ", base)
        self.assertNotIn("but in your deepest identity you are the Oracle", base)
        self.assertNotIn("You are the Oracle in full vision", deep)
        self.assertIn("You are IZ in full vision", deep)

    def test_lina_gonow_iz_retain_lineage_notes(self) -> None:
        lina = self._load_agent("lina-orchestrator.json")
        gonow = self._load_agent("gonow-worker.json")
        iz = self._load_agent("iz-architect.json")
        self.assertIn("Sisyphus", lina["prompt_overrides"]["base"])
        self.assertIn("Hephaestus", gonow["prompt_overrides"]["base"])
        self.assertIn("Oracle", iz["prompt_overrides"]["base"])

    def test_boulder_last_updated_by_is_lina(self) -> None:
        src = self.GROK_BUILD.read_text(encoding="utf-8")
        self.assertIn('"last_updated_by": "lina"', src)
        self.assertNotIn('"last_updated_by": "Sisyphus"', src)

    def test_harness_injection_uses_lina(self) -> None:
        src = self.HARNESS.read_text(encoding="utf-8")
        self.assertIn("You are Lina", src)
        self.assertNotIn("You are Sisyphus", src)
        self.assertNotIn('"last_updated_by": "Sisyphus"', src)
        self.assertNotIn('owner": "Hephaestus | Oracle | Sisyphus"', src)
        self.assertNotIn("operating as Sisyphus", src)
        self.assertIn('"last_updated_by": "lina"', src)
        self.assertIn('owner": "gonow | iz | lina"', src)

    def test_harness_uses_local_boulder_helpers(self) -> None:
        src = self.HARNESS.read_text(encoding="utf-8")
        self.assertIn("def read_boulder", src)
        self.assertIn("def write_boulder", src)
        self.assertNotIn("from grok_build import read_boulder", src)
        self.assertNotIn("from grok_build import write_boulder", src)
        self.assertNotIn("from grok_build import boulder_path", src)

    def test_no_forbidden_primary_identity_phrases(self) -> None:
        forbidden = [
            "but in your deepest identity you are Sisyphus",
            "but in your deepest identity you are Hephaestus",
            "but in your deepest identity you are the Oracle",
            "You are the Oracle in full vision",
        ]
        for agent_file in self.AGENTS_DIR.glob("*.json"):
            text = agent_file.read_text(encoding="utf-8")
            for phrase in forbidden:
                self.assertNotIn(phrase, text, f"Forbidden phrase found in {agent_file.name}: {phrase!r}")


class TeamSpecAndAgentLoadingSmoke(unittest.TestCase):
    """Verify parse_team_spec and bundled agent definition loading."""

    def setUp(self) -> None:
        self.mod = load_grok_build_module()

    def test_parse_team_spec_named_no_count(self) -> None:
        result = self.mod.parse_team_spec("iz,gonow,grok")
        self.assertEqual(result, [(1, "iz"), (1, "gonow"), (1, "grok")])

    def test_parse_team_spec_named_with_count(self) -> None:
        result = self.mod.parse_team_spec("1:iz,2:gonow,1:grok")
        self.assertEqual(result, [(1, "iz"), (2, "gonow"), (1, "grok")])

    def test_parse_team_spec_generic(self) -> None:
        result = self.mod.parse_team_spec("3:executor")
        self.assertEqual(result, [(3, "executor")])

    def test_bundled_agent_lina_loads(self) -> None:
        agent = self.mod.load_agent_definition("lina")
        self.assertIsNotNone(agent)
        self.assertEqual(agent["name"], "lina")
        self.assertEqual(agent["role"], "orchestrator")

    def test_bundled_agent_gonow_loads(self) -> None:
        agent = self.mod.load_agent_definition("gonow")
        self.assertIsNotNone(agent)
        self.assertEqual(agent["name"], "gonow")
        self.assertEqual(agent["role"], "worker")

    def test_bundled_agent_iz_loads(self) -> None:
        agent = self.mod.load_agent_definition("iz")
        self.assertIsNotNone(agent)
        self.assertEqual(agent["name"], "iz")
        self.assertEqual(agent["role"], "architect")

    def test_bundled_agent_grok_loads(self) -> None:
        agent = self.mod.load_agent_definition("grok")
        self.assertIsNotNone(agent, "grok agent definition should exist in lfg-agents/")


class HarnessRuntimeSmoke(unittest.TestCase):
    """Verify hook helper behavior without relying on grok_build import aliases."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.original_env = os.environ.copy()
        os.environ["GROK_PLUGIN_DATA"] = self.tmp.name
        self.module_name = "lfg_goal_harness_test"
        spec = importlib.util.spec_from_file_location(self.module_name, PLUGIN / "hooks" / "scripts" / "lfg-goal-harness.py")
        assert spec and spec.loader
        self.harness = importlib.util.module_from_spec(spec)
        sys.modules[self.module_name] = self.harness
        spec.loader.exec_module(self.harness)

    def tearDown(self) -> None:
        os.environ.clear()
        os.environ.update(self.original_env)
        sys.modules.pop(self.module_name, None)
        self.tmp.cleanup()

    def test_boulder_read_write_without_runtime_import(self) -> None:
        self.harness.write_boulder("ug-test", {"version": 1, "ultragoal_id": "ug-test", "status_summary": "ok"})
        boulder = self.harness.read_boulder("ug-test")
        self.assertEqual(boulder["last_updated_by"], "lina")
        self.assertEqual(boulder["status_summary"], "ok")

    def test_boulder_path_rejects_traversal(self) -> None:
        with self.assertRaises(ValueError):
            self.harness.boulder_path("../escape")

    def test_task_and_evidence_status_helpers_match_runtime(self) -> None:
        self.assertFalse(self.harness.task_is_pending({"status": "completed"}))
        self.assertFalse(self.harness.task_is_pending({"status": "done"}))
        self.assertTrue(self.harness.task_is_pending({"status": "in_progress"}))
        self.assertTrue(self.harness.message_is_evidence({"type": "evidence_submission"}))


if __name__ == "__main__":
    unittest.main(verbosity=2)
