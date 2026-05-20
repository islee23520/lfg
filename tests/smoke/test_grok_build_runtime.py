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
FIXTURES = REPO / "tests" / "fixtures"


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


    def test_omo_agent_registry_cli(self) -> None:
        registry = self.run_lfg("agents", "list")
        self.assertTrue(registry["ok"], registry)
        contract = json.loads((FIXTURES / "omo-agent-registry-contract.json").read_text(encoding="utf-8"))
        ids = [agent["id"] for agent in registry["agents"]]
        self.assertEqual(ids[:4], contract["primary_order"])
        self.assertTrue(set(contract["target_ids"]).issubset(ids), ids)
        self.assertEqual(ids, contract["full_inventory_ids"])
        self.assertEqual(registry["count"], len(contract["full_inventory_ids"]))
        self.assertIn("deep", registry["categoryModelProfiles"])
        for profile in registry["categoryModelProfiles"].values():
            self.assertEqual(profile["provider"], "xai")
        for agent in registry["agents"]:
            self.assertEqual(agent["modelProfile"]["provider"], "xai")
            for key in {"id", "family", "role", "mode", "modelProfile", "reasoningLevel", "promptSource", "tools", "blockedTools", "enabled", "teamEligibility"}:
                self.assertIn(key, agent)

        sisyphus = self.run_lfg("agents", "inspect", "sisyphus")
        self.assertTrue(sisyphus["ok"], sisyphus)
        self.assertEqual(sisyphus["agent"]["id"], "sisyphus")
        self.assertEqual(sisyphus["agent"]["family"], "orchestrator")
        self.assertEqual(sisyphus["agent"]["modelProfile"]["provider"], "xai")
        self.assertEqual(sisyphus["resolvedModelProfile"]["provider"], "xai")

        deep = self.run_lfg("agents", "inspect", "hephaestus", "--category", "deep")
        self.assertTrue(deep["ok"], deep)
        self.assertEqual(deep["resolvedModelProfile"], {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "xhigh"})

        override = self.run_lfg("agents", "inspect", "sisyphus", "--model", "grok-custom", "--reasoning", "medium")
        self.assertTrue(override["ok"], override)
        self.assertEqual(override["resolvedModelProfile"]["provider"], "xai")
        self.assertEqual(override["resolvedModelProfile"]["model"], "grok-custom")
        self.assertEqual(override["resolvedModelProfile"]["reasoning"], "medium")

        codex = self.run_lfg("agents", "inspect", "sisyphus", "--provider", "codex")
        self.assertTrue(codex["ok"], codex)
        self.assertEqual(codex["resolvedModelProfile"]["provider"], "codex")
        self.assertEqual(codex["resolvedModelProfile"]["model"], "openai-codex")

        copilot = self.run_lfg("agents", "inspect", "sisyphus", "--provider", "copilot")
        self.assertTrue(copilot["ok"], copilot)
        self.assertEqual(copilot["resolvedModelProfile"]["provider"], "copilot")
        self.assertEqual(copilot["resolvedModelProfile"]["model"], "github-copilot")

        zai = self.run_lfg("agents", "inspect", "sisyphus", "--provider", "zai")
        self.assertTrue(zai["ok"], zai)
        self.assertEqual(zai["resolvedModelProfile"]["provider"], "zai")
        self.assertEqual(zai["resolvedModelProfile"]["model"], "zai-coding-plan")

        rejected = self.run_lfg("agents", "inspect", "sisyphus", "--provider", "claude")
        self.assertFalse(rejected["ok"], rejected)
        self.assertIn("unsupported model provider", rejected["error"])

    def test_team_member_eligibility_contract(self) -> None:
        contract = json.loads((FIXTURES / "omo-team-eligibility.json").read_text(encoding="utf-8"))

        hephaestus = self.run_lfg("team", "create", "1:hephaestus", "conditional member smoke", "--providers", "noop", "--dry-run")
        self.assertTrue(hephaestus["ok"], hephaestus)
        self.assertEqual(hephaestus["members"][0]["teamEligibility"], "conditional")

        for agent_id in contract["hard_reject_team_members"]:
            proc = subprocess.run(
                [str(LFG), "--json", "team", "create", f"1:{agent_id}", "hard reject smoke", "--providers", "noop", "--dry-run"],
                cwd=str(REPO),
                env=self.env,
                text=True,
                capture_output=True,
                timeout=20,
                check=True,
            )
            payload = json.loads(proc.stdout)
            self.assertFalse(payload["ok"], payload)
            self.assertEqual(payload["error"], "team member eligibility rejected")
            self.assertEqual(payload["issues"][0]["agent"], agent_id)
            self.assertEqual(payload["issues"][0]["teamEligibility"], "hard-reject")
            self.assertIn(agent_id, payload["hardRejectedTeamMembers"])


    def test_spawn_envelope_requires_grok_oracle_review(self) -> None:
        spawn = self.run_lfg("spawn", "sisyphus-junior", "--category", "quick", "--task", "noop spawn smoke", "--provider", "codex")
        self.assertTrue(spawn["ok"], spawn)
        self.assertEqual(spawn["status"], "fallback_manual_gate")
        self.assertEqual(spawn["model_profile"]["provider"], "codex")
        self.assertEqual(spawn["model_profile"]["model"], "openai-codex")
        self.assertTrue(spawn["manual_gate_required"])
        self.assertEqual(spawn["oracleReview"], {
            "required": True,
            "provider": "openai",
            "model": "openai/gpt-5.5",
            "variant": "high",
            "fallback_models": [
                {"model": "github-copilot/gpt-5.5", "variant": "high"},
                {"model": "google/gemini-3.1-pro-preview", "variant": "high"},
                {"model": "zai-coding-plan/glm-5.1"},
            ],
            "role": "oracle",
            "strict": True,
            "mode": "local-smoke",
            "status": "passed",
        })


    def test_models_and_auth_login_commands(self) -> None:
        models = self.run_lfg("models")
        self.assertTrue(models["ok"], models)
        self.assertEqual(models["defaultProvider"], "openai")
        self.assertEqual(models["providers"]["openai"]["model"], "openai/gpt-5.5")
        self.assertEqual(models["secretStorage"], "env-name-only")
        self.assertIn("deep", models["categoryModelProfiles"])

        logged_in = self.run_lfg("auth", "login", "openai", "--id", "openai-main", "--env", "OPENAI_API_KEY", "--model", "openai/gpt-5.5")
        self.assertTrue(logged_in["ok"], logged_in)
        self.assertTrue(logged_in["auth"]["login"])
        self.assertFalse(logged_in["auth"]["secretStored"])
        self.assertEqual(logged_in["provider"]["id"], "openai-main")
        self.assertEqual(logged_in["provider"]["kind"], "openai")

        filtered = self.run_lfg("models", "--provider", "openai")
        self.assertTrue(filtered["providers"]["openai"]["configured"], filtered)
        self.assertEqual(filtered["providers"]["openai"]["id"], "openai-main")

        selected = subprocess.run(
            [str(LFG), "--json", "auth", "login"],
            cwd=str(REPO),
            env=self.env,
            text=True,
            input="1\n",
            capture_output=True,
            check=True,
            timeout=20,
        )
        selected_obj = json.loads(selected.stdout)
        self.assertIn("LFG auth login", selected.stderr)
        self.assertEqual(selected_obj["provider"]["id"], "openai-main")
        self.assertEqual(selected_obj["auth"]["provider"], "openai")

    def test_provider_add_and_setup_install_plugin(self) -> None:
        added = self.run_lfg("provider", "add", "--id", "zai-main", "--kind", "zai", "--env", "ZAI_API_KEY", "--model", "glm-4.6")
        self.assertTrue(added["ok"], added)
        self.assertEqual(added["provider"]["id"], "zai-main")
        self.assertEqual(added["provider"]["kind"], "zai")
        self.assertEqual(added["provider"]["env"], "ZAI_API_KEY")
        self.assertFalse(added["provider"]["secretStored"])
        provider_state = pathlib.Path(self.tmp.name) / "state" / "providers.json"
        self.assertTrue(provider_state.exists())

        interactive = subprocess.run(
            [str(LFG), "--json", "provider", "add"],
            cwd=str(REPO),
            env=self.env,
            text=True,
            input="interactive-zai\nzai\nZAI_API_KEY\nglm-4.6\n",
            capture_output=True,
            check=True,
            timeout=20,
        )
        interactive_obj = json.loads(interactive.stdout)
        self.assertEqual(interactive_obj["provider"]["id"], "interactive-zai")
        self.assertIn("LFG provider setup", interactive.stderr)

        listed = self.run_lfg("provider", "list")
        self.assertEqual(listed["count"], 2)
        self.assertEqual({p["id"] for p in listed["providers"]}, {"zai-main", "interactive-zai"})
        shown = self.run_lfg("provider", "show", "zai-main")
        self.assertEqual(shown["provider"]["model"], "glm-4.6")

        setup = self.run_lfg("setup")
        self.assertTrue(setup["ok"], setup)
        self.assertTrue(setup["installed"], setup)
        plugin_dest = pathlib.Path(self.tmp.name) / ".grok" / "plugins" / "lfg"
        self.assertEqual(pathlib.Path(setup["plugin"]["dest"]), plugin_dest)
        self.assertTrue((plugin_dest / ".grok-plugin" / "plugin.json").exists())
        self.assertEqual(setup["providers"]["count"], 2)
        self.assertTrue((pathlib.Path(self.tmp.name) / "state" / "setup.json").exists())

    def test_setup_wizard_non_interactive_provider_flags(self) -> None:
        setup = self.run_lfg("setup", "--no-tui", "--openai", "yes", "--zai", "yes", "--copilot", "no", "--google", "no", "--codex", "no")
        self.assertTrue(setup["ok"], setup)
        self.assertEqual(setup["setupWizard"]["mode"], "non-interactive")
        self.assertEqual(setup["setupWizard"]["configuredProviderIds"], ["openai-main", "zai-main"])
        self.assertEqual(setup["providers"]["count"], 2)

        providers = self.run_lfg("provider", "list")
        self.assertEqual({p["id"] for p in providers["providers"]}, {"openai-main", "zai-main"})
        self.assertTrue(all(not p["secretStored"] for p in providers["providers"]))

    def test_setup_wizard_interactive_provider_prompts(self) -> None:
        interactive = subprocess.run(
            [str(LFG), "--json", "setup", "--interactive"],
            cwd=str(REPO),
            env=self.env,
            text=True,
            input="y\nn\nn\ny\nn\n",
            capture_output=True,
            check=True,
            timeout=20,
        )
        setup = json.loads(interactive.stdout)
        self.assertIn("LFG OMO-style setup wizard", interactive.stderr)
        self.assertEqual(setup["setupWizard"]["mode"], "interactive")
        self.assertEqual(setup["setupWizard"]["configuredProviderIds"], ["openai-main", "copilot-main"])
        self.assertEqual(setup["providers"]["count"], 2)

    def test_status_and_catalog(self) -> None:
        status = self.run_lfg("status")
        self.assertTrue(status["ok"])
        self.assertEqual(status["version"], "0.3.0")
        self.assertEqual(status["catalogSkills"], 17)

        catalog = self.run_lfg("catalog")
        names = {skill["name"] for skill in catalog["skills"]}
        self.assertIn("hyperplan", names)
        self.assertIn("review-work", names)

    def test_omo_skill_surfaces_have_catalog_entries_without_plugin_docs(self) -> None:
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
        self.assertIn("lfg-inside-tmux-status=ok", roadmap)
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
        expected = [
            "agent-browser",
            "ai-slop-remover",
            "dev-browser",
            "frontend-ui-ux",
            "get-unpublished-changes",
            "git-master",
            "github-triage",
            "hyperplan",
            "omomomo",
            "playwright",
            "pre-publish-review",
            "publish",
            "remove-deadcode",
            "review-work",
            "team-mode",
            "work-with-pr",
        ]
        self.assertEqual(skill_names, expected)
        catalog_names = [skill["name"] for skill in json.loads((PLUGIN / "catalog" / "omo-skill-map.json").read_text(encoding="utf-8"))["skills"]]
        self.assertEqual(catalog_names, [*expected[:8], "lfg", *expected[8:]])
        self.assertFalse((PLUGIN / "docs").exists(), "obsolete plugin-local docs were removed")

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

        self.assertFalse((REPO / "scripts").exists(), "top-level scripts/ is obsolete")
        self.assertFalse((REPO / "Cargo.toml").exists(), "root Cargo.toml is obsolete")
        self.assertFalse((REPO / "Cargo.lock").exists(), "root Cargo.lock is obsolete")
        self.assertFalse((REPO / "src").exists(), "root src/ is obsolete")
        self.assertTrue((REPO / "tests" / "smoke" / "test_grok_build_runtime.py").exists())
        self.assertTrue((REPO / "tests" / "AGENTS.md").exists())

        install_smoke = PLUGIN / "bin" / "grok-install-smoke.sh"
        self.assertTrue(os.access(install_smoke, os.X_OK))
        script = install_smoke.read_text(encoding="utf-8")
        self.assertIn("rsync -a --delete", script)
        self.assertIn("inspect --json", script)
        self.assertIn("assert len(skills) == 17", script)
        self.assertIn("grok-install-smoke=ok skills=17", script)

        runtime = (PLUGIN / "bin" / "lfg.py").read_text(encoding="utf-8")
        self.assertIn("def attach_backend_from_tmux_pane", runtime)
        self.assertIn("split-window", runtime)

        selftest = (PLUGIN / "bin" / "self-test.sh").read_text(encoding="utf-8")
        for marker in [
            "manifest-and-file-checks=ok",
            "marketplace-metadata=ok",
            "release-notes=ok",
            "marketplace-source=ok",
            "mcp-stdio-isolation=ok",
            "mcp-stderr-isolated=ok",
            "state-schema-versioning=ok",
            "state-schema-doctor=ok",
            "team-dry-run=ok",
            "team-tmux-lifecycle=ok",
            "runtime-smoke-coverage=100%",
            "python3 -m unittest tests.smoke.test_grok_build_runtime -v",
        ]:
            self.assertIn(marker, selftest)

        readme = (REPO / "README.md").read_text(encoding="utf-8")
        self.assertNotIn("cp -R plugins/lfg ~/.grok/plugins/lfg", readme)
        self.assertIn("docs/SMOKE.md", readme)
        self.assertIn("/team providers", readme)
        self.assertIn("/team preflight", readme)
        self.assertIn("lfg team preflight", readme)
        self.assertIn("noop", readme)
        self.assertIn("Python-first plugin runtime", readme)

        release_tag_doc = (REPO / "docs" / "RELEASE_TAGS.md").read_text(encoding="utf-8")
        self.assertIn("lfg-v0.3.0-p1", release_tag_doc)

        hook_doc = (REPO / "docs" / "HOOK_EVIDENCE.md").read_text(encoding="utf-8")
        self.assertIn("scripts/lfg-audit-hook.sh", hook_doc)
        self.assertIn("lfg hook-bridge install", hook_doc)
        self.assertIn("grok_build_hook_bridge", hook_doc)

        smoke_doc = (REPO / "docs" / "SMOKE.md").read_text(encoding="utf-8")
        for marker in [
            "plugins/lfg/bin/self-test.sh",
            "plugins/lfg/bin/grok-install-smoke.sh",
            "runtime-smoke-coverage=100%",
            "lfg --json doctor",
            "mcp-stdio-isolation=ok",
            "state-schema-doctor=ok",
            "team-dry-run=ok",
            "team-tmux-lifecycle=ok",
            "release-notes=ok",
            "marketplace-source=ok",
        ]:
            self.assertIn(marker, smoke_doc)

        marketplace_install_doc = (REPO / "docs" / "MARKETPLACE_INSTALL.md").read_text(encoding="utf-8")
        self.assertIn("https://raw.githubusercontent.com/islee23520/lfg/main/.grok/plugins/marketplace.json", marketplace_install_doc)
        self.assertIn("https://raw.githubusercontent.com/islee23520/lfg/p1/.grok/plugins/marketplace.json", marketplace_install_doc)

        release_notes_doc = (REPO / "docs" / "MARKETPLACE_RELEASE_NOTES.md").read_text(encoding="utf-8")
        self.assertIn("islee23520/lfg", release_notes_doc)
        self.assertIn("lfg 0.3.0", release_notes_doc)
        self.assertIn("/plugins", release_notes_doc)

        release_checklist = (REPO / "docs" / "RELEASE_CHECKLIST.md").read_text(encoding="utf-8")
        for marker in [
            "runtime-smoke-coverage=100%",
            "manifest-and-file-checks=ok",
            "marketplace-metadata=ok",
            "release-notes=ok",
            "marketplace-source=ok",
            "mcp-stdio-isolation=ok",
            "state-schema-versioning=ok",
            "state-schema-doctor=ok",
            "team-dry-run=ok",
            "team-tmux-lifecycle=ok",
            "/team providers",
            "/team preflight",
            "grok_build_team.preflight",
            "islee23520/lfg",
            "grok_marketplace",
            "agents_marketplace",
        ]:
            self.assertIn(marker, release_checklist)

        active_docs = [
            REPO / "README.md",
            REPO / "AGENTS.md",
            REPO / "docs" / "SMOKE.md",
            REPO / "docs" / "RELEASE_CHECKLIST.md",
            REPO / "docs" / "TEST_RULES.md",
            REPO / "docs" / "ARCHITECTURE.md",
            REPO / "docs" / "HOW-IT-WORKS.md",
            REPO / "docs" / "agent-system" / "omo-runtime-implementation-plan.md",
            *sorted((REPO / "docs" / "wiki").glob("*.md")),
        ]
        for doc in active_docs:
            text = doc.read_text(encoding="utf-8")
            self.assertNotIn("scripts/verify-", text, str(doc))
            self.assertNotIn("Cargo.toml", text, str(doc))
            self.assertNotIn("Cargo.lock", text, str(doc))
            self.assertNotIn("cargo test", text, str(doc))

    def test_test_rules_doc_contract(self) -> None:
        rules = (REPO / "docs" / "TEST_RULES.md").read_text(encoding="utf-8")
        required_markers = [
            "# Test rules",
            "TR-001",
            "TR-002",
            "TR-003",
            "TR-004",
            "TR-005",
            "TR-006",
            "TR-007",
            "TR-008",
            "Dependency-free unit/smoke tests",
            "Repo-native integration tests",
            "Environment/manual gates",
            "tests/smoke/test_grok_build_runtime.py",
            "plugins/lfg/bin/self-test.sh",
            "Python-first plugin runtime",
            "lfg --json doctor",
        ]
        for marker in required_markers:
            self.assertIn(marker, rules)

    def test_marketplace_metadata_points_to_plugin_package(self) -> None:
        for rel in [".grok/plugins/marketplace.json", ".agents/plugins/marketplace.json"]:
            data = json.loads((REPO / rel).read_text(encoding="utf-8"))
            self.assertEqual(data["name"], "islee23520")
            self.assertEqual(len(data["plugins"]), 1)
            plugin = data["plugins"][0]
            self.assertEqual(plugin["name"], "lfg")
            self.assertEqual(plugin["source"]["source"], "git-subdir")
            self.assertEqual(plugin["source"]["url"], "https://github.com/islee23520/lfg.git")
            self.assertEqual(plugin["source"]["path"], "plugins/lfg")
            self.assertEqual(plugin["metadata"]["packageName"], "islee23520/lfg")
            self.assertEqual(plugin["metadata"]["reference"], "https://github.com/code-yeongyu/oh-my-openagent")


    def test_lfg_default_execs_grok_cli(self) -> None:
        fake_bin = pathlib.Path(self.tmp.name) / "bin"
        fake_bin.mkdir()
        fake_grok = fake_bin / "grok"
        fake_grok.write_text(
            """#!/usr/bin/env bash
if [[ "${1:-}" == "update" && "${2:-}" == "--check" ]]; then exit 0; fi
printf 'fake-grok-launched args=%s\n' "$*"
""",
            encoding="utf-8",
        )
        fake_grok.chmod(0o755)
        env = dict(self.env)
        env["PATH"] = f"{fake_bin}{os.pathsep}{env.get('PATH', '')}"

        proc = subprocess.run([str(LFG)], cwd=str(REPO), env=env, text=True, capture_output=True, check=True, timeout=20)
        self.assertIn("fake-grok-launched", proc.stdout)

        runtime = subprocess.run([str(LFG), "--json", "status"], cwd=str(REPO), env=self.env, text=True, capture_output=True, check=True, timeout=20)
        launched = json.loads(runtime.stdout)
        self.assertTrue(launched["ok"])
        self.assertEqual(launched["launcher"], "lfg")
        self.assertEqual(launched["version"], "0.3.0")
        self.assertNotIn("attachCommand", launched)

    def test_lfg_default_asks_before_grok_update_and_restart(self) -> None:
        fake_bin = pathlib.Path(self.tmp.name) / "bin-update"
        fake_bin.mkdir()
        log = pathlib.Path(self.tmp.name) / "grok-update.log"
        fake_grok = fake_bin / "grok"
        fake_grok.write_text(
            f"""#!/usr/bin/env bash
log={str(log)!r}
case "${{1:-}}" in
  --version) printf 'grok 1.0.0\n' ;;
  update)
    if [[ "${{2:-}}" == "--check" ]]; then printf 'Update available: 1.0.0 -> 1.1.0\n'; exit 0; fi
    printf 'update\n' >> "$log"
    printf 'updated grok\n'
    ;;
  *) printf 'launch\n' >> "$log"; printf 'fake-grok-launched\n' ;;
esac
""",
            encoding="utf-8",
        )
        fake_grok.chmod(0o755)
        env = dict(self.env)
        env["PATH"] = f"{fake_bin}{os.pathsep}{env.get('PATH', '')}"

        yes_proc = subprocess.run(
            [str(LFG)],
            cwd=str(REPO),
            env={**env, "LFG_GROK_UPDATE_CONFIRM": "y"},
            text=True,
            capture_output=True,
            check=True,
            timeout=20,
        )
        self.assertIn("fake-grok-launched", yes_proc.stdout)
        self.assertEqual(log.read_text(encoding="utf-8"), "update\nlaunch\n")

        log.write_text("", encoding="utf-8")
        no_proc = subprocess.run(
            [str(LFG)],
            cwd=str(REPO),
            env={**env, "LFG_GROK_UPDATE_CONFIRM": "n"},
            text=True,
            capture_output=True,
            check=True,
            timeout=20,
        )
        self.assertIn("fake-grok-launched", no_proc.stdout)
        self.assertIn("Grok update skipped", no_proc.stderr)
        self.assertEqual(log.read_text(encoding="utf-8"), "launch\n")

    def test_ulw_alias_matches_lfg_runtime_launcher(self) -> None:
        proc = subprocess.run([str(ULW), "--json"], cwd=str(REPO), env=self.env, text=True, capture_output=True, check=True, timeout=20)
        launched = json.loads(proc.stdout)
        self.assertTrue(launched["ok"])
        self.assertEqual(launched["status"], "ready")
        self.assertEqual(launched["launcher"], "ulw")
        self.assertEqual(launched["mode"], "lfg-runtime")
        self.assertNotIn("attachCommand", launched)
        status = subprocess.run([str(ULW), "--json", "status"], cwd=str(REPO), env=self.env, text=True, capture_output=True, check=True, timeout=20)
        self.assertTrue(json.loads(status.stdout)["ok"])

    def test_attach_backend_from_tmux_pane_respects_triggering_pane(self) -> None:
        module = load_grok_build_module()
        calls: list[list[str]] = []
        original_subprocess_run = module.subprocess.run
        original_tmux = os.environ.get("TMUX")
        original_tmux_pane = os.environ.get("TMUX_PANE")
        try:
            def fake_run(argv, **kwargs):
                calls.append(list(argv))
                return subprocess.CompletedProcess(argv, 0, "", "")

            module.subprocess.run = fake_run
            os.environ["TMUX"] = "/tmp/tmux-test/default,1,0"
            os.environ["TMUX_PANE"] = "%42"

            result = module.attach_backend_from_tmux_pane({"name": "lfg-backend", "status": "running"}, REPO)

            self.assertTrue(result["attached"])
            self.assertEqual(result["attachMethod"], "split-window")
            self.assertEqual(result["triggerPane"], "%42")
            self.assertIn(["tmux", "split-window", "-h", "-t", "%42", "-c", str(REPO), "env -u TMUX tmux attach-session -t lfg-backend"], calls)
            self.assertFalse(any(call[:2] == ["tmux", "switch-client"] for call in calls))
        finally:
            module.subprocess.run = original_subprocess_run
            if original_tmux is None:
                os.environ.pop("TMUX", None)
            else:
                os.environ["TMUX"] = original_tmux
            if original_tmux_pane is None:
                os.environ.pop("TMUX_PANE", None)
            else:
                os.environ["TMUX_PANE"] = original_tmux_pane

    def test_attach_backend_from_tmux_pane_recovers_current_pane_when_env_pane_is_malformed(self) -> None:
        module = load_grok_build_module()
        calls: list[list[str]] = []
        original_subprocess_run = module.subprocess.run
        original_tmux = os.environ.get("TMUX")
        original_tmux_pane = os.environ.get("TMUX_PANE")
        try:
            def fake_run(argv, **kwargs):
                calls.append(list(argv))
                if list(argv)[:3] == ["tmux", "display-message", "-p"]:
                    return subprocess.CompletedProcess(argv, 0, "%77\n", "")
                return subprocess.CompletedProcess(argv, 0, "", "")

            module.subprocess.run = fake_run
            os.environ["TMUX"] = "/tmp/tmux-test/default,1,0"
            os.environ["TMUX_PANE"] = "../../bad"

            result = module.attach_backend_from_tmux_pane({"name": "lfg-backend", "status": "running"}, REPO)

            self.assertTrue(result["attached"])
            self.assertEqual(result["triggerPane"], "%77")
            self.assertIn(["tmux", "split-window", "-h", "-t", "%77", "-c", str(REPO), "env -u TMUX tmux attach-session -t lfg-backend"], calls)
            self.assertFalse(any("switch-client" in call for call in calls))
        finally:
            module.subprocess.run = original_subprocess_run
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
        self.assertEqual([m["provider"] for m in team["members"]], ["grok", "subagent", "grok"])
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
            self.assertTrue(
                "invalid team name" in proc.stderr or "invalid choice" in proc.stderr,
                args,
            )

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


    def test_mcp_exposes_omo_agent_registry(self) -> None:
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
                "params": {"name": "grok_build_agents", "arguments": {"action": "list"}},
            },
            {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/call",
                "params": {"name": "grok_build_agents", "arguments": {"action": "inspect", "agent": "atlas"}},
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

        tools = replies[1]["result"]["tools"]
        tool_names = {tool["name"] for tool in tools}
        self.assertIn("grok_build_agents", tool_names)
        self.assertEqual(sum(1 for tool in tools if tool["name"] == "grok_build_agents"), 1)
        agents_schema = next(tool["inputSchema"] for tool in tools if tool["name"] == "grok_build_agents")
        for key in {"category", "provider", "model", "reasoning"}:
            self.assertIn(key, agents_schema["properties"])
        listing = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(listing["returncode"], 0)
        self.assertIn('"sisyphus-junior"', listing["stdout"])
        atlas = json.loads(replies[3]["result"]["content"][0]["text"])
        self.assertEqual(atlas["returncode"], 0)
        self.assertIn('"id": "atlas"', atlas["stdout"])

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
                "params": {"name": "grok_build_agents", "arguments": {"action": "inspect", "agent": "hephaestus", "category": "deep"}},
            },
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "grok_build_agents", "arguments": {"action": "inspect", "agent": "sisyphus", "provider": "zai"}},
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

        deep = json.loads(json.loads(replies[1]["result"]["content"][0]["text"])["stdout"])
        self.assertEqual(deep["resolvedModelProfile"], {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "xhigh"})
        zai = json.loads(json.loads(replies[2]["result"]["content"][0]["text"])["stdout"])
        self.assertTrue(zai["ok"], zai)
        self.assertEqual(zai["resolvedModelProfile"]["provider"], "zai")
        self.assertEqual(zai["resolvedModelProfile"]["model"], "zai-coding-plan")

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
            {
                "jsonrpc": "2.0",
                "id": 5,
                "method": "tools/call",
                "params": {"name": "grok_build_auth", "arguments": {"action": "login", "provider": "xai", "id": "mcp-xai", "env": "XAI_API_KEY"}},
            },
            {
                "jsonrpc": "2.0",
                "id": 6,
                "method": "tools/call",
                "params": {"name": "grok_build_models", "arguments": {"provider": "xai"}},
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
        for name in {"grok_build_catalog", "grok_build_runtime", "grok_build_team", "grok_build_slash", "grok_build_hook_bridge", "grok_build_models", "grok_build_auth"}:
            self.assertIn(name, tool_names)
        payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"status": "planned"', payload["stdout"])
        providers_payload = json.loads(replies[3]["result"]["content"][0]["text"])
        self.assertEqual(providers_payload["returncode"], 0)
        self.assertIn('"smokeSafe": "noop"', providers_payload["stdout"])
        auth_payload = json.loads(replies[4]["result"]["content"][0]["text"])
        self.assertEqual(auth_payload["returncode"], 0)
        auth_stdout = json.loads(auth_payload["stdout"])
        self.assertFalse(auth_stdout["auth"]["secretStored"])
        models_payload = json.loads(replies[5]["result"]["content"][0]["text"])
        self.assertEqual(models_payload["returncode"], 0)
        models_stdout = json.loads(models_payload["stdout"])
        self.assertEqual(models_stdout["secretStorage"], "env-name-only")
        self.assertTrue(models_stdout["providers"]["xai"]["configured"], models_stdout)

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
        self.assertTrue(module.provider_command("copilot", "hello").startswith("copilot "))
        self.assertIn("--provider zai --dry-run", module.provider_command("zai", "hello"))
        self.assertIn("noop provider ready", module.provider_command("noop", "hello"))
        matrix = module.team_provider_matrix()
        providers = {row["provider"] for row in matrix}
        expected = {"hermes", "claude", "codex", "gemini", "copilot", "zai", "opencode", "grok", "subagent", "noop"}
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
        note = self.run_lfg("wiki", "add", "Team decision", "Use explicit tmux team lifecycle", "--tags", "team,architecture")
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
        plan = self.run_lfg("omx-setup", "install-plan", "--marketplace", "islee23520/lfg")
        self.assertEqual(plan["status"], "planned")
        shown = self.run_lfg("omx-setup", "show")
        self.assertEqual(shown["marketplace"], "islee23520/lfg")

    def test_mcp_omx_setup_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_omx_setup", "arguments": {"action": "install-plan", "marketplace": "islee23520/lfg"}}},
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
        self.assertIn('islee23520/lfg', show_payload["stdout"])

    def test_skill_list_search_catalog(self) -> None:
        listed = self.run_lfg("skill", "list")
        self.assertEqual(listed["count"], 17)
        names = {skill["name"] for skill in listed["skills"]}
        self.assertIn("hyperplan", names)
        found = self.run_lfg("skill", "search", "hyperplan")
        self.assertGreaterEqual(found["count"], 1)
        self.assertIn("hyperplan", {skill["name"] for skill in found["matches"]})

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
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_skill", "arguments": {"action": "search", "query": "hyperplan"}}},
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
        self.assertIn('"name": "hyperplan"', payload["stdout"])

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

        zai = self.run_lfg("ask", "create", "review architecture", "--provider", "zai", "--dry-run")
        self.assertEqual(zai["provider"], "zai")
        self.assertEqual(zai["adapter"], "zai-http")
        self.assertTrue(zai["dryRun"])
        self.assertEqual(zai["result"]["transport"], "http")
        self.assertTrue(zai["result"]["dryRun"])
        self.assertFalse(zai["result"]["config"]["keyConfigured"])
        self.assertEqual(zai["result"]["config"]["apiKeyEnv"], "ZAI_API_KEY|ZHIPU_API_KEY")
        self.assertIn("/chat/completions", zai["result"]["request"]["endpoint"])
        pointer = pathlib.Path(self.tmp.name) / "state" / "last-ask.json"
        self.assertTrue(pointer.exists())
        listed = self.run_lfg("ask", "list")
        self.assertEqual(listed["count"], 2)

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
        sourced = self.run_lfg("autoresearch", "add-source", "https://github.com/code-yeongyu/oh-my-openagent", "--id", "smoke-research", "--note", "reference workflow")
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

    AGENTS_DIR = PLUGIN / "src" / "agents"
    GROK_BUILD = PLUGIN / "bin" / "lfg.py"
    HARNESS = PLUGIN / "hooks" / "scripts" / "lfg-goal-harness.py"

    def _load_agent(self, filename: str) -> dict:
        return json.loads((self.AGENTS_DIR / filename).read_text(encoding="utf-8"))

    def test_lina_prompt_primary_identity(self) -> None:
        agent = self._load_agent("legacy/lina-orchestrator.json")
        base = agent["prompt_overrides"]["base"]
        self.assertIn("You are Lina", base)
        self.assertNotIn("but in your deepest identity you are Sisyphus", base)

    def test_gonow_prompt_primary_identity(self) -> None:
        agent = self._load_agent("legacy/gonow-worker.json")
        base = agent["prompt_overrides"]["base"]
        self.assertIn("You are GoNow", base)
        self.assertNotIn("but in your deepest identity you are Hephaestus", base)

    def test_iz_prompt_primary_identity(self) -> None:
        agent = self._load_agent("legacy/iz-architect.json")
        base = agent["prompt_overrides"]["base"]
        deep = agent["prompt_overrides"]["deep"]
        self.assertIn("You are IZ", base)
        self.assertNotIn("but in your deepest identity you are the Oracle", base)
        self.assertNotIn("You are the Oracle in full vision", deep)
        self.assertIn("You are IZ in full vision", deep)

    def test_lina_gonow_iz_retain_lineage_notes(self) -> None:
        lina = self._load_agent("legacy/lina-orchestrator.json")
        gonow = self._load_agent("legacy/gonow-worker.json")
        iz = self._load_agent("legacy/iz-architect.json")
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
        self.assertIsNotNone(agent, "grok legacy agent definition should exist under src/agents/legacy/")


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
