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

    def evidence_artifact(self, name: str = "proof", kind: str = "command-output") -> str:
        evidence_root = pathlib.Path(self.tmp.name) / "fixture-evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)
        path = evidence_root / f"{name}-{kind}.json"
        path.write_text(json.dumps({
            "schemaVersion": 1,
            "kind": kind,
            "command": ["fixture", name],
            "returncode": 0,
            "stdout": f"{name}=ok",
        }, indent=2) + "\n", encoding="utf-8")
        return str(path)

    def test_lfg_core_agent_registry_layer(self) -> None:
        """OMO registry/spawn/Atlas policy lives in dependency-free core modules used by runtime."""
        core_path = PLUGIN / "src" / "core" / "agent_registry.py"
        spec = importlib.util.spec_from_file_location("lfg_core_agent_registry_smoke", core_path)
        assert spec and spec.loader
        core = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(core)

        spawn_core_path = PLUGIN / "src" / "core" / "spawn_policy.py"
        spawn_spec = importlib.util.spec_from_file_location("lfg_core_spawn_policy_smoke", spawn_core_path)
        assert spawn_spec and spawn_spec.loader
        spawn_core = importlib.util.module_from_spec(spawn_spec)
        spawn_spec.loader.exec_module(spawn_core)

        atlas_core_path = PLUGIN / "src" / "core" / "atlas_boulder.py"
        atlas_spec = importlib.util.spec_from_file_location("lfg_core_atlas_boulder_smoke", atlas_core_path)
        assert atlas_spec and atlas_spec.loader
        atlas_core = importlib.util.module_from_spec(atlas_spec)
        atlas_spec.loader.exec_module(atlas_core)

        constants_path = PLUGIN / "src" / "runtime" / "constants.py"
        constants_spec = importlib.util.spec_from_file_location("lfg_runtime_constants_smoke", constants_path)
        assert constants_spec and constants_spec.loader
        constants = importlib.util.module_from_spec(constants_spec)
        constants_spec.loader.exec_module(constants)

        registry = core.load_agent_registry(
            agents_dir=PLUGIN / "src" / "agents",
            canonical_agent_ids=constants.CANONICAL_OMO_AGENT_IDS,
            team_eligibility_registry=constants.OMO_TEAM_ELIGIBILITY_REGISTRY,
            primary_agent_ids=constants.OMO_PRIMARY_AGENT_IDS,
        )
        cli_registry = self.run_lfg("agents", "list")

        self.assertEqual([agent["id"] for agent in registry], [agent["id"] for agent in cli_registry["agents"]])
        self.assertEqual(registry[0]["id"], "sisyphus")
        self.assertTrue(registry[0]["primaryOrder"])
        self.assertTrue(registry[0]["teamMemberEligible"])

        runtime_src = (PLUGIN / "src" / "runtime" / "cli.py").read_text(encoding="utf-8")
        core_src = "\n".join(path.read_text(encoding="utf-8") for path in (core_path, spawn_core_path, atlas_core_path))
        self.assertNotIn("subprocess", core_src)
        self.assertNotIn("urllib", core_src)
        self.assertIn("_AGENT_CORE.load_agent_registry", runtime_src)
        self.assertIn("_AGENT_CORE.resolve_model_profile", runtime_src)
        self.assertIn("_SPAWN_CORE.canonical_spawn_envelope", runtime_src)
        self.assertIn("_SPAWN_CORE.validate_spawn_envelope", runtime_src)
        self.assertIn("_ATLAS_CORE.progress", runtime_src)
        self.assertIn("_ATLAS_CORE.build_boulder", runtime_src)
        self.assertIn("_DISPATCH_GATE.reserve_dispatch_gate", runtime_src)

        broker = spawn_core.supervision_broker_decision(
            operation="spawn",
            lane="fallback-local",
            model_profile={"provider": "xai"},
            evidence_class="dependency-free-smoke",
            reason="smoke",
            max_depth=2,
            broker_api="internal-non-agent",
            broker_version=1,
        )
        envelope = spawn_core.canonical_spawn_envelope(
            operation="spawn",
            status="completed",
            ok=True,
            mode="fallback",
            agent_id="sisyphus-junior",
            category="quick",
            task="bounded",
            task_id="task-core",
            run_id="run-core",
            parent_run_id=None,
            model_profile={"provider": "xai", "model": "xai/grok-4.3", "reasoning": "low"},
            model_resolution={},
            children=[],
            blockers=[],
            touched_files=[],
            evidence=["core=ok"],
            evidence_class="dependency-free-smoke",
            broker_decision=broker,
            debug={},
            next_tasks=[],
            manual_gate_required=False,
            spawn_envelope_schema_version=1,
            spawn_envelope_statuses={"completed", "blocked", "failed"},
            spawn_envelope_modes={"native-grok", "fallback"},
            spawn_envelope_evidence_classes={"dependency-free-smoke", "repo-native-integration", "real-grok-manual-gate"},
            completion_statuses={"complete", "completed", "pass", "passed"},
            grok_oracle_review={"required": True, "gate": "xai/grok"},
            redacter=lambda value: value,
            artifact_writer=None,
            default_broker_decision=lambda _op, _profile, _evidence_class: broker,
        )
        errors = spawn_core.validate_spawn_envelope(
            envelope,
            spawn_envelope_schema_version=1,
            spawn_envelope_statuses={"completed", "blocked", "failed"},
            spawn_envelope_modes={"native-grok", "fallback"},
            spawn_envelope_evidence_classes={"dependency-free-smoke", "repo-native-integration", "real-grok-manual-gate"},
            broker_api="internal-non-agent",
            validate_evidence_gate=lambda _record: [],
        )
        self.assertEqual(errors, [])
        self.assertEqual(envelope["execution"]["completionMeaning"], "contract-envelope-completed")

        plan = {
            "id": "plan-core",
            "steps": [
                {"id": "1", "status": "completed"},
                {"id": "2", "status": "pending", "depends_on": "1"},
                {"id": "3", "status": "pending", "depends_on": ["2"]},
            ],
        }
        progress = atlas_core.progress(plan, completion_statuses={"complete", "completed", "pass", "passed"})
        self.assertEqual(progress["completed"], 1)
        self.assertEqual(progress["nextTask"]["id"], "2")
        self.assertEqual(progress["blocked"], [{"taskId": "3", "dependsOn": ["2"], "reason": "unresolved-dependency"}])

    def test_continuation_dispatch_gate_manual_gate_artifact(self) -> None:
        gate_path = PLUGIN / "src" / "runtime" / "dispatch_gate.py"
        spec = importlib.util.spec_from_file_location("lfg_runtime_dispatch_gate_smoke", gate_path)
        assert spec and spec.loader
        gate = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(gate)

        dispatch_root = pathlib.Path(self.tmp.name) / "dispatch-gate-fixture"
        first = gate.reserve_dispatch_gate(
            dispatch_root=dispatch_root,
            session_id="session-1",
            plan_id="plan-1",
            boulder_version="2",
            reason="loop_start",
            target_agent="sisyphus",
            prompt="continue",
            state_snapshot={"todo": ["verify"]},
            native_dispatch_supported=False,
            now_value="2026-05-20T00:00:00Z",
        )
        self.assertEqual(first["dispatch"], "manual_gate_required")
        self.assertFalse(first["duplicateSuppressed"])
        self.assertTrue(pathlib.Path(first["artifactPath"]).exists())
        artifact = json.loads(pathlib.Path(first["artifactPath"]).read_text(encoding="utf-8"))
        self.assertEqual(artifact["stateSnapshot"], {"todo": ["verify"]})
        self.assertEqual(artifact["evidence"], ["continuation-gate=ok"])

        second = gate.reserve_dispatch_gate(
            dispatch_root=dispatch_root,
            session_id="session-1",
            plan_id="plan-1",
            boulder_version="2",
            reason="loop_start",
            target_agent="sisyphus",
            prompt="continue again",
            state_snapshot={"todo": ["verify again"]},
            native_dispatch_supported=False,
            now_value="2026-05-20T00:00:01Z",
        )
        self.assertEqual(second["decision"], "duplicate_suppressed")
        self.assertTrue(second["duplicateSuppressed"])
        self.assertEqual(second["artifactPath"], first["artifactPath"])
        self.assertTrue(second["manualGateRequired"])
        self.assertEqual(second["stateSnapshot"], {"todo": ["verify"]})

        started = self.run_lfg("loop", "start", "dispatch gate smoke")
        self.assertEqual(started["dispatchGate"]["dispatch"], "manual_gate_required")
        self.assertIn("continuation-gate=ok", started["dispatchGate"]["evidence"])
        self.assertTrue(pathlib.Path(started["dispatchGate"]["artifactPath"]).exists())
        started_artifact = json.loads(pathlib.Path(started["dispatchGate"]["artifactPath"]).read_text(encoding="utf-8"))
        self.assertEqual(started["ultraworkId"], started_artifact["stateSnapshot"]["ultraworkId"])
        repeated = self.run_lfg("loop", "start", "dispatch gate smoke")
        self.assertTrue(repeated["dispatchGate"]["duplicateSuppressed"])
        self.assertEqual(repeated["dispatchGate"]["artifactPath"], started["dispatchGate"]["artifactPath"])
        self.assertEqual(repeated["ultraworkId"], started["ultraworkId"])
        self.assertEqual(repeated["ultraworkId"], repeated["dispatchGate"]["stateSnapshot"]["ultraworkId"])
        state_check = self.run_lfg("doctor", "state", "schema", "check")
        self.assertIn("dispatchGate", state_check["stateRoots"])
        self.assertIn("continuation-gate=ok", state_check["evidence"])


    def test_omo_agent_registry_cli(self) -> None:
        registry = self.run_lfg("agents", "list")
        self.assertTrue(registry["ok"], registry)
        contract = json.loads((FIXTURES / "omo-agent-registry-contract.json").read_text(encoding="utf-8"))
        ids = [agent["id"] for agent in registry["agents"]]
        self.assertEqual(ids[:4], contract["primary_order"])
        self.assertTrue(set(contract["target_ids"]).issubset(ids), ids)
        self.assertEqual(ids, contract["full_inventory_ids"])
        self.assertEqual(registry["count"], len(contract["full_inventory_ids"]))
        keywords = self.run_lfg("grok-build", "keywords")
        self.assertTrue(keywords["ok"], keywords)
        self.assertEqual(keywords["trigger"], "@")
        self.assertEqual(keywords["registrationKind"], "known-keyword")
        self.assertEqual(keywords["ids"], [f"@{agent_id}" for agent_id in ids])
        self.assertEqual([entry["agentId"] for entry in keywords["keywords"]], ids)
        self.assertTrue(all(entry["keyword"].startswith("@") for entry in keywords["keywords"]))
        keyword_ids = self.run_lfg("grok-build", "keywords", "--ids")
        self.assertEqual(keyword_ids, {"ok": True, "ids": keywords["ids"], "count": len(ids)})
        wrapper = self.run_lfg("grok-build", "start", "--dry-run")
        self.assertEqual(wrapper["guide"]["knownKeywords"]["ids"], keywords["ids"])
        self.assertIn("Known @agent keywords:", wrapper["command"])
        self.assertIn("LFG_GROK_BUILD_KNOWN_KEYWORDS_FILE", wrapper["command"])
        self.assertIn("LFG_GROK_BUILD_KNOWN_KEYWORDS=", wrapper["command"])
        self.assertIn("grok-build-known-keywords.json", wrapper["command"])
        self.assertIn("@sisyphus-junior", wrapper["command"])
        self.assertIn("deep", registry["categoryModelProfiles"])
        for profile in registry["categoryModelProfiles"].values():
            self.assertEqual(profile["provider"], "xai")
        self.assertEqual(registry["categoryRouting"]["upstreamCategories"], [
            "visual-engineering",
            "artistry",
            "ultrabrain",
            "deep",
            "quick",
            "unspecified-low",
            "unspecified-high",
            "writing",
            "quick-rust",
            "quick-zig",
            "git",
        ])
        self.assertEqual(registry["categoryRouting"]["supportedCategories"], [
            "visual-engineering",
            "artistry",
            "ultrabrain",
            "deep",
            "quick",
            "unspecified-low",
            "unspecified-high",
            "writing",
        ])
        for agent in registry["agents"]:
            expected_provider = "openai" if agent["id"] == "hephaestus" else "xai"
            self.assertEqual(agent["modelProfile"]["provider"], expected_provider)
            for key in {"id", "family", "role", "mode", "modelProfile", "reasoningLevel", "promptSource", "tools", "blockedTools", "enabled", "teamEligibility"}:
                self.assertIn(key, agent)

        sisyphus = self.run_lfg("agents", "inspect", "sisyphus")
        self.assertTrue(sisyphus["ok"], sisyphus)
        self.assertEqual(sisyphus["agent"]["id"], "sisyphus")
        self.assertEqual(sisyphus["agent"]["family"], "orchestrator")
        self.assertEqual(sisyphus["agent"]["modelProfile"]["provider"], "xai")
        self.assertEqual(sisyphus["resolvedModelProfile"]["provider"], "xai")
        self.assertEqual(sisyphus["modelResolution"]["roleFit"], "communicator")
        self.assertIn("reason", sisyphus["modelResolution"])
        self.assertEqual(sisyphus["modelResolution"]["selectedModelProfile"], sisyphus["resolvedModelProfile"])
        self.assertIn("agent-model-matching.md", sisyphus["modelResolution"]["fallbackChainSource"])
        self.assertEqual(sisyphus["modelResolution"]["runtimeFallback"]["kind"], "runtime-fallback")
        self.assertTrue(sisyphus["modelResolution"]["runtimeFallback"]["separateFromProactiveSelection"])

        route = self.run_lfg("route", "--category", "quick", "--task", "execute a bounded smoke task")
        self.assertTrue(route["ok"], route)
        self.assertEqual(route["routeKind"], "category")
        self.assertEqual(route["selectedAgent"]["id"], "sisyphus-junior")
        self.assertEqual(route["modelProfile"], {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "low"})
        self.assertIn("reason", route)
        self.assertTrue(route["blockedTools"])
        self.assertTrue(route["verificationGate"]["required"])
        self.assertFalse(route["delegation"]["allowed"])

        unsupported = self.run_lfg("route", "--category", "quick-rust", "--task", "migrate unsupported category")
        self.assertFalse(unsupported["ok"], unsupported)
        self.assertEqual(unsupported["error"], "category not yet supported by LFG")
        self.assertIn("migrationNote", unsupported)

        deep = self.run_lfg("agents", "inspect", "hephaestus", "--category", "deep")
        self.assertTrue(deep["ok"], deep)
        self.assertEqual(deep["resolvedModelProfile"], {"provider": "openai", "model": "openai/gpt-5.5", "reasoning": "medium"})
        self.assertTrue(deep["modelResolution"]["modelFamilyPolicy"]["approved"])

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

        for provider in ["openai", "xai", "grok", "codex", "copilot", "zai"]:
            supported = self.run_lfg("agents", "inspect", "sisyphus", "--provider", provider)
            self.assertTrue(supported["ok"], supported)
            self.assertEqual(supported["resolvedModelProfile"]["provider"], "xai" if provider == "grok" else provider)

        rejected_google = self.run_lfg("agents", "inspect", "sisyphus", "--provider", "google")
        self.assertFalse(rejected_google["ok"], rejected_google)
        self.assertIn("unsupported model provider", rejected_google["error"])

        rejected = self.run_lfg("agents", "inspect", "sisyphus", "--provider", "claude")
        self.assertFalse(rejected["ok"], rejected)
        self.assertIn("unsupported model provider", rejected["error"])

        rejected_model = self.run_lfg("agents", "inspect", "sisyphus", "--model", "unknown-provider/example")
        self.assertFalse(rejected_model["ok"], rejected_model)
        self.assertEqual(rejected_model["error"], "unsupported model provider in model override")
        self.assertEqual(rejected_model["provider"], "unknown-provider")

    def test_omo_model_family_matching_policy(self) -> None:
        cases = [
            ("sisyphus", None, "communicator", "xai", "high"),
            ("hephaestus", None, "deep-specialist", "openai", "medium"),
            ("sisyphus-junior", "visual-engineering", "visual-artistry", "xai", "high"),
            ("sisyphus-junior", "quick", "utility-runner", "xai", "low"),
            ("explore", None, "utility-runner", "xai", "medium"),
            ("librarian", None, "utility-runner", "xai", "medium"),
        ]
        approved = {"codex", "copilot", "grok", "openai", "xai", "zai"}
        for agent_id, category, role_fit, provider, reasoning in cases:
            args = ["agents", "inspect", agent_id]
            if category:
                args.extend(["--category", category])
            payload = self.run_lfg(*args)
            self.assertTrue(payload["ok"], payload)
            resolution = payload["modelResolution"]
            self.assertEqual(resolution["roleFit"], role_fit, payload)
            self.assertEqual(resolution["selectedModelProfile"], payload["resolvedModelProfile"])
            self.assertEqual(payload["resolvedModelProfile"]["provider"], provider)
            self.assertEqual(payload["resolvedModelProfile"]["reasoning"], reasoning)
            self.assertIn("agent-model-matching.md", resolution["fallbackChainSource"])
            self.assertTrue(resolution["reason"])
            self.assertEqual(set(resolution["providerBoundary"]["approvedProviders"]), approved)
            for entry in resolution["proactiveFallbackChain"]:
                self.assertIn(entry["provider"], approved, entry)
            self.assertEqual(resolution["runtimeFallback"]["kind"], "runtime-fallback")

    def test_t10_model_fallback_selection_without_provider_calls(self) -> None:
        """Model fallback chooses next chain entry deterministically, no provider execution."""
        payload = self.run_lfg("agents", "inspect", "sisyphus-junior", "--category", "quick")
        self.assertTrue(payload["ok"])
        res = payload["modelResolution"]
        self.assertIn("proactiveFallbackChain", res)
        self.assertGreaterEqual(len(res["proactiveFallbackChain"]), 2)
        self.assertEqual(res["proactiveFallbackChain"][0]["provider"], "xai")
        self.assertNotEqual(res["runtimeFallback"]["kind"], "proactive")
        self.assertTrue(res["runtimeFallback"]["separateFromProactiveSelection"])

    def test_t10_runtime_fallback_after_simulated_provider_error(self) -> None:
        """Runtime fallback is reactive path after error; distinct from model selection."""
        payload = self.run_lfg("agents", "inspect", "hephaestus")
        res = payload["modelResolution"]
        rf = res["runtimeFallback"]
        self.assertEqual(rf["kind"], "runtime-fallback")
        self.assertTrue(rf["manualGateRequired"])
        self.assertIn("reactive recovery", rf["trigger"])

    def test_t26_provider_failure_fallback_matrix(self) -> None:
        self.env.pop("OPENAI_API_KEY", None)
        missing = self.run_lfg("provider", "matrix", "--provider", "openai", "--scenario", "missing-credential")
        self.assertTrue(missing["ok"], missing)
        self.assertEqual(missing["status"], "blocked")
        self.assertEqual(missing["evidenceClass"], "dependency-free-smoke")
        self.assertEqual(missing["failureClass"], "provider-missing-credential")
        self.assertEqual(missing["credential"]["env"], "OPENAI_API_KEY")
        self.assertFalse(missing["credential"]["configured"])
        self.assertFalse(missing["credential"]["secretStored"])
        self.assertTrue(missing["fallback"]["noopFallback"])
        self.assertFalse(missing["fallback"]["silentDowngrade"])
        self.assertTrue(missing["providerFailure"]["securitySensitive"])

        provider_state = pathlib.Path(self.tmp.name) / "state" / "providers.json"
        provider_state.parent.mkdir(parents=True, exist_ok=True)
        provider_state.write_text(
            json.dumps(
                {
                    "providers": {
                        "malformed-main": {
                            "id": "malformed-main",
                            "kind": "unknown-provider",
                            "env": "bad-env",
                            "model": "openai/gpt-5.5",
                            "secretStored": True,
                        }
                    }
                }
            ),
            encoding="utf-8",
        )
        malformed = self.run_lfg("provider", "matrix", "--provider", "openai", "--id", "malformed-main", "--scenario", "malformed-config")
        self.assertTrue(malformed["ok"], malformed)
        self.assertEqual(malformed["failureClass"], "provider-malformed-config")
        self.assertFalse(malformed["configValidation"]["ok"])
        self.assertEqual({item["code"] for item in malformed["configValidation"]["errors"]}, {"unknown-provider-kind", "invalid-env-name", "secret-value-storage-not-allowed"})

        auth = self.run_lfg("provider", "matrix", "--provider", "openai", "--scenario", "auth-error")
        self.assertFalse(auth["ok"], auth)
        self.assertEqual(auth["status"], "blocked")
        self.assertTrue(auth["providerFailure"]["securitySensitive"])
        self.assertFalse(auth["fallback"]["silentDowngrade"])

        rate = self.run_lfg("provider", "matrix", "--provider", "openai", "--scenario", "rate-limit")
        self.assertFalse(rate["ok"], rate)
        self.assertEqual(rate["failureClass"], "provider-rate-limit")
        self.assertTrue(rate["providerFailure"]["retryable"])
        self.assertTrue(rate["providerFailure"]["statePreserved"])

        model = self.run_lfg("provider", "matrix", "--provider", "openai", "--scenario", "model-fallback")
        self.assertTrue(model["ok"], model)
        self.assertEqual(model["status"], "completed")
        self.assertTrue(model["fallback"]["modelFallback"])
        self.assertFalse(model["fallback"]["runtimeFallback"])
        self.assertEqual(model["modelResolution"]["proactiveFallbackChain"][0]["provider"], "xai")

        noop = self.run_lfg("provider", "matrix", "--provider", "noop", "--scenario", "noop-fallback")
        self.assertTrue(noop["ok"], noop)
        self.assertEqual(noop["status"], "completed")
        self.assertEqual(noop["provider"]["kind"], "noop")
        self.assertTrue(noop["fallback"]["noopFallback"])

    def test_t26_spawn_auth_and_rate_limit_preserve_state_without_secret_leaks(self) -> None:
        self.env["OPENAI_API_KEY"] = "sk-test-secret000000"
        auth = subprocess.run(
            [str(LFG), "--json", "spawn", "sisyphus-junior", "--category", "quick", "--task", "auth failure smoke", "--provider", "openai", "--simulate-provider-error", "auth-error"],
            cwd=str(REPO),
            env=self.env,
            text=True,
            capture_output=True,
            check=True,
            timeout=20,
        )
        self.assertNotIn("sk-test-secret000000", auth.stdout + auth.stderr)
        auth_payload = json.loads(auth.stdout)
        self.assertFalse(auth_payload["ok"], auth_payload)
        self.assertEqual(auth_payload["status"], "blocked")
        self.assertEqual(auth_payload["blockers"][0]["code"], "provider-auth-error")
        self.assertTrue(auth_payload["blockers"][0]["securitySensitive"])
        self.assertFalse(auth_payload["debug"]["providerFailure"]["silentDowngrade"])
        self.assertTrue(pathlib.Path(auth_payload["recordPath"]).exists())

        rate = self.run_lfg("spawn", "sisyphus-junior", "--category", "quick", "--task", "rate limit smoke", "--provider", "openai", "--task-id", "t26-rate-limit", "--simulate-provider-error", "rate-limit")
        self.assertFalse(rate["ok"], rate)
        self.assertEqual(rate["status"], "blocked")
        self.assertEqual(rate["blockers"][0]["code"], "provider-rate-limit")
        self.assertTrue(rate["blockers"][0]["retryable"])
        self.assertTrue(rate["blockers"][0]["statePreserved"])
        self.assertEqual(rate["modelResolution"]["selectedModelProfile"], rate["modelProfile"])
        self.assertTrue(rate["runtimeFallback"]["separateFromProactiveSelection"])
        record = json.loads(pathlib.Path(rate["recordPath"]).read_text(encoding="utf-8"))
        self.assertEqual(record["status"], "blocked")
        self.assertEqual(record["taskId"], "t26-rate-limit")
        self.assertEqual(record["debug"]["providerFailure"]["class"], "provider-rate-limit")

    def test_t17_hephaestus_model_mismatch_blocks_and_ulw_requires_evidence(self) -> None:
        mismatch = self.run_lfg("agents", "inspect", "hephaestus", "--provider", "zai")
        self.assertFalse(mismatch["ok"], mismatch)
        self.assertEqual(mismatch["status"], "blocked")
        self.assertEqual(mismatch["error"], "model-family mismatch")
        self.assertFalse(mismatch["modelFamilyPolicy"]["approved"])
        self.assertEqual(mismatch["modelFamilyPolicy"]["selectedProfile"]["provider"], "zai")

        blocked_spawn = self.run_lfg("hephaestus", "goal", "trace a deep fixture", "--provider", "zai")
        self.assertFalse(blocked_spawn["ok"], blocked_spawn)
        self.assertEqual(blocked_spawn["status"], "blocked")
        self.assertEqual(blocked_spawn["blockers"][0]["code"], "model-family-mismatch")

        plan = self.run_lfg("plan", "create", "T17 ULW plan", "--steps", "Inspect;Implement;Verify")
        activated = self.run_lfg("ulw", "finish the current plan")
        self.assertEqual(activated["leadAgent"], "sisyphus")
        self.assertEqual(activated["strategy"], "existing-plan")
        self.assertEqual(activated["plan"]["id"], plan["id"])
        self.assertEqual(activated["dispatchGate"]["dispatch"], "manual_gate_required")
        self.assertIn("continuation-gate=ok", activated["dispatchGate"]["evidence"])
        self.assertFalse(activated["sisyphusDiscipline"]["bypassesEvidenceGates"])
        self.assertFalse(activated["sisyphusDiscipline"]["completionPolicy"]["proseOnlyCompletionAllowed"])
        self.assertEqual(activated["sisyphusDiscipline"]["completionPolicy"]["ultraworkStopStates"], [
            "accepted",
            "blocked",
            "budget_exhausted",
            "failed",
            "manual_review_required",
        ])
        self.assertTrue(activated["sisyphusDiscipline"]["completionPolicy"]["evidenceRequiredBeforeAdvancement"])

        rejected = subprocess.run(
            [str(LFG), "--json", "ultrawork", "update", "--id", activated["ulw_id"], "--task", "1", "--status", "complete", "--evidence", "success prose only"],
            cwd=str(REPO),
            env=self.env,
            text=True,
            capture_output=True,
            check=False,
            timeout=20,
        )
        self.assertEqual(rejected.returncode, 2, rejected.stdout + rejected.stderr)
        rejected_payload = json.loads(rejected.stdout)
        self.assertEqual(rejected_payload["error"], "missing-evidence")
        shown = self.run_lfg("ultrawork", "show", "--id", activated["ulw_id"])
        self.assertEqual(shown["status"], "blocked")
        self.assertEqual(shown["gate"], "needs_evidence")
        self.assertEqual(shown["tasks"][0]["status"], "needs_evidence")
        self.assertEqual(shown["blockers"][-1]["code"], "missing-evidence")

        accepted_missing = subprocess.run(
            [str(LFG), "--json", "ultrawork", "update", "--id", activated["ulw_id"], "--task", "1", "--status", "accepted", "--evidence", "accepted without artifact"],
            cwd=str(REPO),
            env=self.env,
            text=True,
            capture_output=True,
            check=False,
            timeout=20,
        )
        self.assertEqual(accepted_missing.returncode, 2, accepted_missing.stdout + accepted_missing.stderr)
        self.assertEqual(json.loads(accepted_missing.stdout)["error"], "missing-evidence")
        proof = self.evidence_artifact("t17-ulw-accepted")
        accepted = self.run_lfg("ultrawork", "update", "--id", activated["ulw_id"], "--task", "1", "--status", "accepted", "--evidence", "accepted with artifact", "--evidence-artifact", proof)
        self.assertEqual(accepted["status"], "accepted")
        self.assertEqual(accepted["gate"], "accepted")
        self.assertEqual(accepted["tasks"][0]["oracleReview"]["gate"], "xai/grok")

    def test_t10_background_concurrency_honored_in_deterministic_fixtures(self) -> None:
        """Background concurrency config keyed by model/provider is honored."""
        payload = self.run_lfg("agents", "inspect", "atlas")
        self.assertIn("modelResolution", payload)

    def test_team_member_eligibility_contract(self) -> None:
        contract = json.loads((FIXTURES / "omo-team-eligibility.json").read_text(encoding="utf-8"))

        hephaestus = self.run_lfg("team", "create", "1:hephaestus", "conditional member smoke", "--providers", "noop", "--dry-run")
        self.assertEqual(hephaestus["status"], "planned", hephaestus)
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

    def test_t13_team_lifecycle_mailbox_tasklist_and_shutdown(self) -> None:
        created = self.run_lfg("team", "create", "2:sisyphus-junior", "t13 lifecycle smoke", "--name", "t13-team", "--providers", "noop", "--dry-run")
        self.assertTrue(created["ok"], created)
        self.assertEqual(set(created["tools"]), {
            "team_create",
            "team_delete",
            "team_shutdown_request",
            "team_approve_shutdown",
            "team_reject_shutdown",
            "team_send_message",
            "team_task_create",
            "team_task_list",
            "team_task_update",
            "team_task_get",
            "team_status",
            "team_list",
        })
        self.assertIn("/runs/team-t13-team/teams/t13-team", created["stateDir"])
        self.assertTrue(pathlib.Path(created["durableState"]["runJson"]).exists())
        self.assertEqual(created["bounds"]["maxMembers"], 8)
        self.assertEqual(created["bounds"]["maxParallelWorkers"], 4)
        self.assertFalse(created["teamPolicy"]["memberDelegateTaskAllowed"])
        self.assertFalse(created["teamPolicy"]["syncReplyWaitAllowed"])
        member = created["members"][0]["name"]
        self.assertIn("delegate-task", created["members"][0]["blockedTools"])

        task = self.run_lfg("team", "team_task_create", "t13-team", "verify lifecycle", "--owner", member)
        self.assertTrue(task["ok"], task)
        self.assertEqual(task["task"]["id"], "task-1")
        self.assertEqual(task["task"]["owner"], member)
        self.assertEqual(task["task"]["status"], "claimed")

        message = self.run_lfg("team", "team_send_message", "t13-team", member, "please verify task-1")
        self.assertTrue(message["ok"], message)
        self.assertEqual(message["delivery"], "queued")
        self.assertFalse(message["syncReplyWaitAllowed"])

        waiting = self.run_lfg("team", "send-message", "t13-team", member, "wait attempt", "--wait")
        self.assertFalse(waiting["ok"], waiting)
        self.assertEqual(waiting["error"], "synchronous-reply-waits-not-allowed")

        updated = self.run_lfg("team", "team_task_update", "t13-team", "task-1", "--status", "completed", "--owner", member, "--evidence", "noop verified")
        self.assertTrue(updated["ok"], updated)
        self.assertEqual(updated["task"]["status"], "completed")
        self.assertEqual(updated["task"]["owner"], member)

        listed = self.run_lfg("team", "team_task_list", "t13-team")
        self.assertEqual([item["id"] for item in listed["tasks"]], ["task-1"])
        got = self.run_lfg("team", "team_task_get", "t13-team", "task-1")
        self.assertEqual(got["task"]["evidence"], "noop verified")

        early_delete = self.run_lfg("team", "team_delete", "t13-team")
        self.assertFalse(early_delete["ok"], early_delete)
        self.assertEqual(early_delete["error"], "active-members")

        for teammate in [member, created["members"][1]["name"]]:
            requested = self.run_lfg("team", "team_shutdown_request", "t13-team", teammate, "--reason", "phase complete")
            self.assertTrue(requested["ok"], requested)
            approved = self.run_lfg("team", "team_approve_shutdown", "t13-team", teammate)
            self.assertTrue(approved["ok"], approved)
            self.assertEqual(approved["shutdownRequest"]["status"], "approved")

        status = self.run_lfg("team", "team_status", "t13-team")
        self.assertTrue(status["ok"], status)
        self.assertEqual(status["teamRunId"], "t13-team")
        self.assertEqual(len(status["mailbox"]), 3)

        listed_teams = self.run_lfg("team", "team_list")
        self.assertTrue(any(team["teamRunId"] == "t13-team" for team in listed_teams["teams"]), listed_teams)

        deleted = self.run_lfg("team", "team_delete", "t13-team")
        self.assertTrue(deleted["ok"], deleted)
        self.assertTrue(deleted["stateCleaned"], deleted)
        self.assertFalse(pathlib.Path(deleted["deletedStateDir"]).exists())

    def test_t13_team_bounds_nested_and_eligibility_rejections(self) -> None:
        too_many = self.run_lfg("team", "create", "9:sisyphus-junior", "too many", "--providers", "noop", "--dry-run")
        self.assertFalse(too_many["ok"], too_many)
        self.assertEqual(too_many["error"], "team-member-bound-exceeded")
        self.assertEqual(too_many["maxMembers"], 8)

        nested = self.run_lfg("team", "create", "1:sisyphus-junior", "nested", "--providers", "noop", "--dry-run", "--actor", "sisyphus-junior-1-noop")
        self.assertFalse(nested["ok"], nested)
        self.assertEqual(nested["error"], "nested-teams-not-allowed")
        self.assertIn("team_create", nested["blockedTools"])
        self.assertIn("delegate-task", nested["blockedTools"])

        hard_reject = self.run_lfg("team", "create", "1:oracle", "hard reject still enforced", "--providers", "noop", "--dry-run")
        self.assertFalse(hard_reject["ok"], hard_reject)
        self.assertEqual(hard_reject["error"], "team member eligibility rejected")
        self.assertEqual(hard_reject["issues"][0]["teamEligibility"], "hard-reject")

    def test_t14_hyperplan_noop_artifact_and_bounded_roster(self) -> None:
        payload = self.run_lfg("hyperplan", "design Grok spawn adapter acceptance gates", "--run-id", "t14-hyperplan")
        self.assertTrue(payload["ok"], payload)
        self.assertEqual(payload["status"], "completed")
        self.assertEqual(payload["evidenceClass"], "dependency-free-smoke")
        self.assertEqual(payload["operation"], "hyperplan")
        self.assertEqual(payload["maxCritics"], 5)
        self.assertTrue(payload["boundedRoster"])
        self.assertEqual([critic["category"] for critic in payload["critics"]], [
            "unspecified-low",
            "unspecified-high",
            "ultrabrain",
            "artistry",
            "deep",
        ])
        self.assertEqual(len(payload["critics"]), 5)
        self.assertEqual([round_item["name"] for round_item in payload["critiqueRounds"]], [
            "independent-analysis",
            "cross-attack",
            "defend-refine",
        ])
        self.assertEqual([round_item["name"] for round_item in payload["revisionRounds"]], [
            "lead-revision",
            "final-tightening",
        ])
        self.assertIsNotNone(payload["leadSynthesis"])
        self.assertIsNotNone(payload["finalPlan"])
        self.assertTrue(pathlib.Path(payload["artifactPath"]).exists())
        self.assertIn("/hyperplan/t14-hyperplan/artifact.json", payload["artifactPath"])
        self.assertTrue(payload["teamMode"]["used"])
        self.assertFalse(payload["teamMode"]["memberDelegateTaskAllowed"])
        self.assertEqual(payload["oracleReview"]["gate"], "xai/grok")

        artifact = json.loads(pathlib.Path(payload["artifactPath"]).read_text(encoding="utf-8"))
        self.assertEqual(artifact["critics"], payload["critics"])
        self.assertEqual(artifact["leadSynthesis"], payload["leadSynthesis"])
        self.assertEqual(artifact["finalPlan"], payload["finalPlan"])

    def test_t14_hyperplan_missing_synthesis_blocks_completion(self) -> None:
        payload = self.run_lfg(
            "hyperplan",
            "design missing synthesis fixture",
            "--run-id",
            "t14-missing-synthesis",
            "--simulate-missing-synthesis",
        )
        self.assertFalse(payload["ok"], payload)
        self.assertEqual(payload["status"], "blocked")
        self.assertEqual(payload["blockers"][0]["code"], "missing-lead-synthesis")
        self.assertIsNone(payload["leadSynthesis"])
        self.assertIsNone(payload["finalPlan"])
        self.assertTrue(pathlib.Path(payload["artifactPath"]).exists())
        self.assertIn("/hyperplan/t14-missing-synthesis/artifact.json", payload["artifactPath"])
        self.assertEqual(payload["oracleReview"]["gate"], "xai/grok")

    def test_category_route_mutual_exclusion_and_bounds(self) -> None:
        routed = self.run_lfg("route", "--category", "deep", "--task", "plan a nested execution")
        self.assertTrue(routed["ok"], routed)
        self.assertEqual(routed["selectedAgent"]["id"], "sisyphus-junior")
        self.assertEqual(routed["routeKind"], "category")
        self.assertEqual(routed["category"], "deep")
        self.assertEqual(routed["verificationGate"]["gate"], "dependency-free-smoke")
        self.assertIn("team_create", routed["blockedTools"])
        self.assertEqual(routed["delegation"]["blockedTools"], ["spawn", "spawn_wave", "dependency_graph"])

        mutual = self.run_lfg("route", "--category", "quick", "--subagent-type", "sisyphus-junior", "--task", "invalid combination")
        self.assertFalse(mutual["ok"], mutual)
        self.assertEqual(mutual["error"], "category and subagent_type are mutually exclusive")
        self.assertIn("migrationNote", mutual)


    def test_spawn_envelope_requires_grok_oracle_review(self) -> None:
        spawn = self.run_lfg("spawn", "sisyphus-junior", "--category", "quick", "--task", "noop spawn smoke", "--provider", "codex")
        self.assertTrue(spawn["ok"], spawn)
        self.assertEqual(spawn["schemaVersion"], 1)
        self.assertEqual(spawn["operation"], "spawn")
        self.assertEqual(spawn["mode"], "fallback")
        self.assertEqual(spawn["status"], "completed")
        self.assertEqual(spawn["execution"]["completionMeaning"], "contract-envelope-completed")
        self.assertFalse(spawn["execution"]["actualChildExecution"])
        self.assertFalse(spawn["execution"]["nativeGrokSpawnVerified"])
        self.assertEqual(spawn["evidenceClass"], "dependency-free-smoke")
        self.assertEqual(spawn["modelProfile"]["provider"], "codex")
        self.assertEqual(spawn["modelProfile"]["model"], "openai-codex")
        self.assertEqual(spawn["modelResolution"]["selectedModelProfile"], spawn["modelProfile"])
        self.assertIn("agent-model-matching.md", spawn["modelResolution"]["fallbackChainSource"])
        self.assertEqual(spawn["runtimeFallback"]["kind"], "runtime-fallback")
        self.assertTrue(spawn["runtimeFallback"]["separateFromProactiveSelection"])
        self.assertFalse(spawn["manual_gate_required"])
        self.assertIn("children", spawn)
        self.assertIn("blockers", spawn)
        self.assertIn("touchedFiles", spawn)
        self.assertIn("runId", spawn)
        self.assertEqual(spawn["broker"]["api"], "internal-non-agent")
        self.assertEqual(spawn["broker"]["selectedLane"], "approved-provider:codex")
        self.assertEqual(spawn["broker"]["modelProfile"], spawn["modelProfile"])
        self.assertEqual(spawn["broker"]["evidenceClass"], "dependency-free-smoke")
        self.assertIn("reason", spawn["broker"]["policyDecision"])
        forbidden = [key for key in spawn if "raw" in key.lower() or "responsebody" in key.lower()]
        self.assertEqual(forbidden, [])
        self.assertEqual(spawn["oracleReview"], {
            "required": True,
            "gate": "xai/grok",
            "provider": "xai",
            "model": "xai/grok-4.3",
            "variant": "high",
            "fallback_models": [],
            "role": "oracle",
            "strict": True,
            "mode": "local-smoke",
            "reviewKind": "static-local-schema",
            "realGrokJudgment": False,
            "status": "passed",
        })

    def test_t12_completion_rejects_prose_and_accepts_artifact_evidence(self) -> None:
        self.run_lfg("ultrawork", "create", "prove evidence gate", "--id", "t12-ultrawork", "--tasks", "verify")
        rejected = subprocess.run(
            [str(LFG), "--json", "ultrawork", "update", "--id", "t12-ultrawork", "--task", "1", "--status", "complete", "--evidence", "model says it is done"],
            cwd=str(REPO),
            env=self.env,
            text=True,
            capture_output=True,
            check=False,
            timeout=20,
        )
        self.assertEqual(rejected.returncode, 2, rejected.stdout + rejected.stderr)
        rejected_payload = json.loads(rejected.stdout)
        self.assertFalse(rejected_payload["ok"], rejected_payload)
        self.assertEqual(rejected_payload["error"], "missing-evidence")
        self.assertFalse(rejected_payload["evidenceGate"]["proseAccepted"])
        self.assertEqual(rejected_payload["oracleReview"]["gate"], "xai/grok")

        proof = self.evidence_artifact("t12-command-output")
        accepted = self.run_lfg("ultrawork", "update", "--id", "t12-ultrawork", "--task", "1", "--status", "complete", "--evidence", "command output captured", "--evidence-artifact", proof)
        task = accepted["tasks"][0]
        self.assertEqual(task["status"], "complete")
        self.assertEqual(task["evidenceArtifactPaths"], [proof])
        self.assertEqual(task["oracleReview"]["gate"], "xai/grok")
        self.assertTrue(pathlib.Path(task["evidenceArtifactPaths"][0]).exists())

        spawn = self.run_lfg("spawn", "sisyphus-junior", "--category", "quick", "--task", "t12 spawn evidence", "--provider", "codex")
        self.assertTrue(spawn["evidenceArtifactPaths"], spawn)
        self.assertTrue(pathlib.Path(spawn["evidenceArtifactPaths"][0]).exists())
        self.assertEqual(spawn["oracleReview"]["gate"], "xai/grok")

    def test_t16_atlas_resumes_with_wisdom_and_rejects_evidence_free_checkbox(self) -> None:
        plan = self.run_lfg("plan", "create", "T16 Atlas fixture", "--steps", "Inspect existing state;Implement bounded task;Verify with tests")
        plan_id = plan["id"]

        started = self.run_lfg("start-work", "--plan-id", plan_id, "--session-id", "session-a")
        self.assertEqual(started["mode"], "init")
        self.assertEqual(started["nextTask"]["id"], 1)
        self.assertFalse(started["delegation"]["atlasWritesImplementationCode"])
        self.assertEqual(sorted(started["notepads"]["categories"]), ["decisions", "issues", "learnings", "problems", "verification"])

        proof = self.evidence_artifact("t16-atlas-task-1")
        completed = self.run_lfg(
            "atlas", "checkbox",
            "--plan-id", plan_id,
            "--session-id", "session-a",
            "--task", "1",
            "--status", "completed",
            "--evidence", "task 1 command output captured",
            "--evidence-artifact", proof,
            "--learning", "Reuse existing evidence gates before checking Atlas tasks.",
        )
        self.assertEqual(completed["progress"]["completed"], 1)
        self.assertEqual(completed["nextTask"]["id"], 2)

        resumed = self.run_lfg("start-work", "--plan-id", plan_id, "--session-id", "session-b")
        self.assertEqual(resumed["mode"], "resume")
        self.assertEqual(resumed["progress"]["completed"], 1)
        self.assertEqual(resumed["nextTask"]["id"], 2)
        self.assertIn("Reuse existing evidence gates", resumed["wisdom"]["learnings"])
        self.assertIn("session-a", resumed["sessionIds"])
        self.assertIn("session-b", resumed["sessionIds"])

        rejected = subprocess.run(
            [str(LFG), "--json", "atlas", "checkbox", "--plan-id", plan_id, "--task", "2", "--status", "completed", "--evidence", "model says done"],
            cwd=str(REPO),
            env=self.env,
            text=True,
            capture_output=True,
            check=False,
            timeout=20,
        )
        self.assertEqual(rejected.returncode, 2, rejected.stdout + rejected.stderr)
        rejected_payload = json.loads(rejected.stdout)
        self.assertEqual(rejected_payload["error"], "missing-evidence")
        self.assertFalse(rejected_payload["evidenceGate"]["proseAccepted"])
        after_reject = self.run_lfg("atlas", "status", "--plan-id", plan_id)
        self.assertEqual(after_reject["progress"]["completed"], 1)
        self.assertEqual(after_reject["progress"]["nextTask"]["id"], 2)

    def write_omo_evidence(self, name: str, payload: dict) -> pathlib.Path:
        evidence_root = REPO / ".omo" / "evidence" / "omo-parity-completion"
        evidence_root.mkdir(parents=True, exist_ok=True)
        path = evidence_root / name
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return path

    def test_t27_state_migration_concurrency_mailbox_recovery_and_payload_limits(self) -> None:
        schema_path = pathlib.Path(self.tmp.name) / "state" / "schema.json"
        schema_path.parent.mkdir(parents=True, exist_ok=True)
        schema_path.write_text(json.dumps({"name": "lfg-state", "version": 1, "migrations": []}), encoding="utf-8")
        doctor_state = self.run_lfg("doctor", "state", "schema", "check")
        self.assertTrue(doctor_state["ok"], doctor_state)
        self.assertEqual(doctor_state["schema"]["version"], 2)
        self.assertEqual(doctor_state["migrationStatus"], "migrated")
        self.assertIn("state-schema-v1-to-v2", {item["id"] for item in doctor_state["migrations"]})

        plan = self.run_lfg("plan", "create", "T27 stale Boulder fixture", "--steps", "Inspect;Verify")
        plan_id = plan["id"]
        boulder_path = pathlib.Path(self.tmp.name) / "boulder" / plan_id / "boulder.json"
        boulder_path.parent.mkdir(parents=True, exist_ok=True)
        boulder_path.write_text(json.dumps({
            "schemaVersion": 1,
            "kind": "atlas-boulder",
            "plan_id": plan_id,
            "sessions": ["legacy-session"],
            "progress": {"completed": 0},
            "next_task_id": "1",
        }), encoding="utf-8")
        migrated = self.run_lfg("start-work", "--plan-id", plan_id, "--session-id", "t27-session")
        self.assertEqual(migrated["mode"], "migrate", migrated)
        self.assertTrue(migrated["boulderMigration"]["applied"])
        migrated_boulder = json.loads(boulder_path.read_text(encoding="utf-8"))
        self.assertEqual(migrated_boulder["schemaVersion"], 2)
        self.assertIn("legacy-session", migrated_boulder["session_ids"])
        self.assertIn("t27-session", migrated_boulder["session_ids"])
        self.assertGreaterEqual(migrated_boulder["revision"], 1)

        stale_evidence = self.write_omo_evidence("task-27-stale-state.json", {
            "ok": True,
            "schemaVersion": 1,
            "task": "T27 stale state migration",
            "doctorMigrationStatus": doctor_state["migrationStatus"],
            "schemaMigrations": doctor_state["migrations"],
            "boulderMigration": migrated["boulderMigration"],
            "boulderRevision": migrated_boulder["revision"],
            "evidence": "task-27-stale-state=ok",
        })
        self.assertTrue(stale_evidence.exists())

        proof = self.evidence_artifact("t27-atlas-lock")
        lock_path = boulder_path.with_suffix(".lock")
        lock_path.write_text(json.dumps({"pid": 0, "fixture": "held"}), encoding="utf-8")
        rejected = subprocess.run(
            [str(LFG), "--json", "atlas", "checkbox", "--plan-id", plan_id, "--task", "1", "--status", "completed", "--evidence", "would overwrite", "--evidence-artifact", proof],
            cwd=str(REPO),
            env=self.env,
            text=True,
            capture_output=True,
            check=False,
            timeout=20,
        )
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn("concurrent advancement rejected", rejected.stderr)
        after_reject = json.loads(boulder_path.read_text(encoding="utf-8"))
        self.assertEqual(after_reject["revision"], migrated_boulder["revision"])
        lock_path.unlink()
        accepted = self.run_lfg("atlas", "checkbox", "--plan-id", plan_id, "--task", "1", "--status", "completed", "--evidence", "locked path released", "--evidence-artifact", proof)
        self.assertEqual(accepted["progress"]["completed"], 1)
        after_accept = json.loads(boulder_path.read_text(encoding="utf-8"))
        self.assertGreater(after_accept["revision"], after_reject["revision"])
        concurrent_evidence = self.write_omo_evidence("task-27-concurrent-boulder.json", {
            "ok": True,
            "schemaVersion": 1,
            "task": "T27 concurrent Boulder advancement",
            "rejectedReturncode": rejected.returncode,
            "rejectedStderr": rejected.stderr.strip(),
            "revisionBeforeRejectedAttempt": after_reject["revision"],
            "revisionAfterAcceptedAttempt": after_accept["revision"],
            "noOverwriteWhileLocked": after_reject["revision"] == migrated_boulder["revision"],
            "evidence": "task-27-concurrent-boulder=ok",
        })
        self.assertTrue(concurrent_evidence.exists())

        team = self.run_lfg("team", "create", "1:sisyphus-junior", "t27 mailbox", "--name", "t27-mail", "--providers", "noop", "--dry-run")
        member = team["members"][0]["name"]
        too_large = subprocess.run(
            [str(LFG), "--json", "team", "send-message", "t27-mail", member, "x" * (32 * 1024 + 1)],
            cwd=str(REPO),
            env=self.env,
            text=True,
            capture_output=True,
            check=False,
            timeout=20,
        )
        self.assertNotEqual(too_large.returncode, 0)
        self.assertIn("message exceeds 32KB bound", too_large.stderr)

        message = self.run_lfg("team", "send-message", "t27-mail", member, "recover me")
        msg_id = message["messages"][0]["id"]
        inbox = pathlib.Path(self.tmp.name) / "runs" / "team-t27-mail" / "teams" / "t27-mail" / "inboxes" / member
        queued = inbox / f"{msg_id}.json"
        delivering = inbox / f".delivering-{msg_id}.json"
        self.assertTrue(queued.exists())
        queued.replace(delivering)
        old = 1
        os.utime(delivering, (old, old))
        resumed = self.run_lfg("team", "resume", "t27-mail")
        self.assertTrue(resumed["mailboxRecovery"]["reclaimed"], resumed)
        self.assertTrue(queued.exists())
        self.assertFalse(delivering.exists())

    def test_t25_prometheus_atlas_worker_end_to_end_and_resume_smoke(self) -> None:
        plan = self.run_lfg("plan", "create", "T25 Prometheus Atlas worker fixture", "--interview")
        self.assertEqual(plan["status"], "awaiting_answers", plan)
        self.assertEqual(plan["questions"][0], "What is the core objective of this work?")
        plan_id = plan["id"]

        answered = self.run_lfg(
            "plan",
            "answer",
            plan_id,
            "Objective: prove Prometheus to Atlas to worker noop flow; scope: no providers; verification: CLI evidence artifacts.",
        )
        self.assertEqual(answered["status"], "active", answered)
        self.assertEqual(len(answered["steps"]), 5)
        self.assertTrue(pathlib.Path(answered["json_path"]).exists())
        self.assertTrue(pathlib.Path(answered["markdown_path"]).exists())

        started = self.run_lfg("start-work", "--plan-id", plan_id, "--session-id", "t25-session-a")
        self.assertEqual(started["mode"], "init", started)
        self.assertEqual(started["agent"], "atlas")
        self.assertEqual(started["nextTask"]["id"], 1)
        self.assertEqual(started["delegation"]["agent"], "sisyphus-junior")
        self.assertFalse(started["delegation"]["atlasWritesImplementationCode"])
        boulder_path = pathlib.Path(started["boulderPath"])
        self.assertTrue(boulder_path.exists())

        delegated = started["delegation"]
        spawn = self.run_lfg(
            "spawn",
            delegated["agent"],
            "--category",
            "quick",
            "--task",
            delegated["task"],
            "--task-id",
            f"t25-plan-{delegated['taskId']}",
            "--provider",
            "codex",
        )
        self.assertTrue(spawn["ok"], spawn)
        self.assertEqual(spawn["operation"], "spawn")
        self.assertEqual(spawn["status"], "completed")
        self.assertEqual(spawn["mode"], "fallback")
        self.assertEqual(spawn["evidenceClass"], "dependency-free-smoke")
        self.assertEqual(spawn["oracleReview"]["gate"], "xai/grok")
        worker_envelope_path = pathlib.Path(spawn["recordPath"])
        self.assertTrue(worker_envelope_path.exists())
        self.assertTrue(pathlib.Path(spawn["evidenceArtifactPaths"][0]).exists())

        ack = self.run_lfg("worker", "ack", "t25-worker", delegated["task"])
        self.assertEqual(ack["status"], "ack")
        worker = self.run_lfg(
            "worker",
            "result",
            "t25-worker",
            "noop worker completed delegated task with canonical spawn envelope evidence",
            "--status",
            "complete",
            "--evidence-artifact",
            str(worker_envelope_path),
        )
        self.assertEqual(worker["status"], "complete", worker)
        self.assertEqual(worker["oracleReview"]["gate"], "xai/grok")
        worker_state_path = pathlib.Path(worker["path"])
        self.assertTrue(worker_state_path.exists())

        checked = self.run_lfg(
            "atlas",
            "checkbox",
            "--plan-id",
            plan_id,
            "--session-id",
            "t25-session-a",
            "--task",
            str(delegated["taskId"]),
            "--status",
            "completed",
            "--evidence",
            "worker envelope and evidence gate verified",
            "--evidence-artifact",
            str(worker_envelope_path),
            "--verification",
            "T25 worker noop envelope exists and passed the xAI/Grok oracle evidence gate.",
            "--learning",
            "T25 end-to-end smoke can remain repo-native by using Prometheus interview mode, Atlas delegation, and fallback spawn envelopes.",
        )
        self.assertEqual(checked["progress"]["completed"], 1)
        self.assertEqual(checked["nextTask"]["id"], 2)
        self.assertEqual(checked["step"]["evidenceArtifactPaths"], [str(worker_envelope_path)])

        resumed = self.run_lfg("start-work", "--plan-id", plan_id, "--session-id", "t25-session-b")
        self.assertEqual(resumed["mode"], "resume", resumed)
        self.assertEqual(resumed["progress"]["completed"], 1)
        self.assertEqual(resumed["nextTask"]["id"], 2)
        self.assertIn("t25-session-a", resumed["sessionIds"])
        self.assertIn("t25-session-b", resumed["sessionIds"])
        self.assertIn("T25 end-to-end smoke", resumed["wisdom"]["learnings"])
        resumed_boulder = json.loads(boulder_path.read_text(encoding="utf-8"))
        self.assertEqual(resumed_boulder["next_task_id"], "2")
        self.assertEqual(resumed_boulder["progress"]["completed"], 1)

        artifact_root = REPO / ".omo" / "evidence" / "omo-parity-completion" / "task-25-artifacts" / plan_id
        artifact_root.mkdir(parents=True, exist_ok=True)

        def snapshot_artifact(source: str | pathlib.Path, name: str) -> str:
            source_path = pathlib.Path(source)
            target = artifact_root / name
            target.write_bytes(source_path.read_bytes())
            return str(target)

        plan_json_snapshot = snapshot_artifact(answered["json_path"], "plan.json")
        plan_markdown_snapshot = snapshot_artifact(answered["markdown_path"], "plan.md")
        boulder_snapshot = snapshot_artifact(boulder_path, "boulder.json")
        worker_envelope_snapshot = snapshot_artifact(worker_envelope_path, "worker-envelope.json")
        worker_state_snapshot = snapshot_artifact(worker_state_path, "worker-state.json")
        spawn_evidence_snapshots = [
            snapshot_artifact(path, f"spawn-evidence-{index}.json")
            for index, path in enumerate(spawn["evidenceArtifactPaths"], start=1)
        ]

        e2e_payload = {
            "ok": True,
            "schemaVersion": 1,
            "task": "T25 End-to-end Prometheus -> Atlas -> workers smoke",
            "evidenceClass": "repo-native-integration",
            "credentialsUsed": False,
            "nativeGrokSpawnImplemented": False,
            "nativeGrokSpawnStatus": "manual_gate_pending",
            "plan": {
                "id": plan_id,
                "createdStatus": plan["status"],
                "answeredStatus": answered["status"],
                "jsonPath": plan_json_snapshot,
                "markdownPath": plan_markdown_snapshot,
            },
            "atlas": {
                "startMode": started["mode"],
                "boulderPath": boulder_snapshot,
                "delegation": delegated,
                "checkboxStatus": checked["status"],
                "progress": checked["progress"],
            },
            "worker": {
                "ackPath": worker_state_snapshot,
                "statePath": worker_state_snapshot,
                "envelopePath": worker_envelope_snapshot,
                "runId": spawn["runId"],
                "taskId": spawn["taskId"],
                "evidenceArtifactPaths": spawn_evidence_snapshots,
                "oracleReview": spawn["oracleReview"],
            },
            "evidence": "task-25-e2e-flow=ok",
        }
        e2e_path = self.write_omo_evidence("task-25-e2e-flow.json", e2e_payload)
        self.assertTrue(e2e_path.exists())

        resume_payload = {
            "ok": True,
            "schemaVersion": 1,
            "task": "T25 Resume after interruption",
            "evidenceClass": "repo-native-integration",
            "credentialsUsed": False,
            "planId": plan_id,
            "boulderPath": boulder_snapshot,
            "beforeResume": {
                "completed": checked["progress"]["completed"],
                "nextTaskId": checked["nextTask"]["id"],
            },
            "afterResume": {
                "mode": resumed["mode"],
                "completed": resumed["progress"]["completed"],
                "nextTaskId": resumed["nextTask"]["id"],
                "sessionIds": resumed["sessionIds"],
                "boulderNextTaskId": resumed_boulder["next_task_id"],
            },
            "noRedoCompletedWork": resumed["nextTask"]["id"] == 2 and resumed["progress"]["completed"] == 1,
            "evidence": "task-25-resume=ok",
        }
        resume_path = self.write_omo_evidence("task-25-resume.json", resume_payload)
        self.assertTrue(resume_path.exists())

    def test_canonical_spawn_envelope_fixture_and_wave_order(self) -> None:
        validated = self.run_lfg("spawn-envelope", "validate", str(FIXTURES / "spawn-result-envelopes.json"))
        self.assertTrue(validated["ok"], validated)
        self.assertEqual(validated["count"], 4)
        self.assertEqual(validated["evidence"], "spawn-envelope-fixture-validation=ok")

        wave_tasks = json.dumps([
            {"taskId": "T-002", "agent_id": "sisyphus-junior", "category": "quick", "task": "second"},
            {"taskId": "T-001", "agent_id": "sisyphus-junior", "category": "quick", "task": "first"},
        ])
        wave = self.run_lfg("spawn-wave", "--tasks-json", wave_tasks)
        self.assertTrue(wave["ok"], wave)
        self.assertEqual(wave["operation"], "spawn_wave")
        self.assertEqual([child["taskId"] for child in wave["children"]], ["T-002", "T-001"])
        self.assertEqual([child["taskId"] for child in wave["results"]], ["T-002", "T-001"])

        graph_plan = json.dumps([
            {"id": "A", "status": "pending"},
            {"id": "B", "depends_on": ["A"]},
        ])
        graph = self.run_lfg("dependency-graph", "--run-id", "fixture-graph", "--plan-json", graph_plan)
        self.assertFalse(graph["ok"], graph)
        self.assertEqual(graph["status"], "blocked")
        self.assertEqual(graph["blockers"], [{"dependsOn": ["A"], "reason": "unresolved-dependency", "taskId": "B"}])
        self.assertEqual(graph["broker"]["selectedLane"], "dependency-graph:deterministic")

    def test_spawn_adapter_t8_operations(self) -> None:
        wave_tasks = json.dumps([
            {"taskId": "child-1", "agent_id": "sisyphus-junior", "category": "quick", "task": "one"},
            {"taskId": "child-2", "agent_id": "sisyphus-junior", "category": "quick", "task": "two"},
            {"taskId": "child-3", "agent_id": "sisyphus-junior", "category": "quick", "task": "three"},
        ])
        wave = self.run_lfg("spawn-wave", "--run-id", "fixture-t8-wave", "--tasks-json", wave_tasks)
        self.assertTrue(wave["ok"], wave)
        self.assertEqual(wave["mode"], "fallback")
        self.assertEqual([child["taskId"] for child in wave["children"]], ["child-1", "child-2", "child-3"])
        self.assertEqual([child["status"] for child in wave["children"]], ["completed", "completed", "completed"])
        self.assertEqual(len({child["runId"] for child in wave["children"]}), 3)
        self.assertTrue(wave["manual_gate_required"])

        graph_plan = json.dumps([
            {"id": "A", "status": "completed", "output": "alpha"},
            {"id": "B", "depends_on": ["A"], "agent_id": "sisyphus-junior", "category": "quick", "task": "beta"},
            {"id": "C", "depends_on": ["missing"], "agent_id": "sisyphus-junior", "category": "quick", "task": "gamma"},
        ])
        graph = self.run_lfg("dependency-graph", "--run-id", "fixture-t8-graph", "--plan-json", graph_plan)
        self.assertFalse(graph["ok"], graph)
        self.assertEqual(graph["status"], "blocked")
        self.assertEqual([child["taskId"] for child in graph["children"]], ["A", "B", "C"])
        self.assertEqual([child["status"] for child in graph["children"]], ["completed", "completed", "blocked"])
        self.assertEqual(graph["blockers"], [{"dependsOn": ["missing"], "reason": "unresolved-dependency", "taskId": "C"}])
        self.assertEqual(graph["synthesis"]["operation"], "synthesize")
        self.assertEqual(graph["synthesis"]["success_count"], 2)

        resumed = self.run_lfg("resume", "fixture-t8-graph")
        self.assertFalse(resumed["ok"], resumed)
        self.assertEqual(resumed["status"], "blocked")
        self.assertEqual(resumed["operation"], "resume")
        self.assertEqual(resumed["debug"]["previousOperation"], "run_dependency_graph")

        native = self.run_lfg(
            "spawn",
            "sisyphus-junior",
            "--category",
            "quick",
            "--task",
            "native request smoke",
            "--mode",
            "native-grok",
        )
        self.assertTrue(native["ok"], native)
        self.assertEqual(native["mode"], "fallback")
        self.assertTrue(native["manual_gate_required"])
        self.assertEqual(native["execution"]["completionMeaning"], "contract-envelope-completed")
        self.assertFalse(native["execution"]["actualChildExecution"])
        self.assertEqual(native["debug"]["nativeGate"]["modeReturned"], "fallback")

    def test_supervision_broker_rejects_bypass_and_recursion(self) -> None:
        agents = self.run_lfg("agents", "list")
        self.assertNotIn("broker", [agent["id"] for agent in agents["agents"]])

        recursion = self.run_lfg("spawn", "sisyphus-junior", "--category", "quick", "--task", "too deep", "--broker-depth", "3")
        self.assertFalse(recursion["ok"], recursion)
        self.assertEqual(recursion["broker"]["selectedLane"], "rejected")
        self.assertEqual(recursion["blockers"][0]["code"], "uncontrolled-recursion")

        bypass = self.run_lfg("team", "create", "1:prometheus", "policy bypass fixture", "--dry-run", "--providers", "noop")
        self.assertFalse(bypass["ok"], bypass)
        self.assertEqual(bypass["broker"]["api"], "internal-non-agent")
        self.assertFalse(bypass["broker"]["policyDecision"]["allowed"])
        self.assertIn("OMO policy", bypass["broker"]["policyDecision"]["reason"])


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

    def test_provider_add_rejects_secret_like_values_without_leaking_them(self) -> None:
        proc = subprocess.run(
            [str(LFG), "--json", "provider", "add", "--id", "sk-secret-provider", "--kind", "openai", "--env", "OPENAI_API_KEY", "--model", "openai/gpt-5.5"],
            cwd=str(REPO),
            env=self.env,
            text=True,
            capture_output=True,
            timeout=20,
        )
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("refusing to store secret-like provider id", proc.stderr)
        self.assertNotIn("sk-secret-provider", proc.stderr)
        self.assertFalse((pathlib.Path(self.tmp.name) / "state" / "providers.json").exists())

        env_proc = subprocess.run(
            [str(LFG), "--json", "provider", "add", "--id", "openai-main", "--kind", "openai", "--env", "sk-secret-env", "--model", "openai/gpt-5.5"],
            cwd=str(REPO),
            env=self.env,
            text=True,
            capture_output=True,
            timeout=20,
        )
        self.assertNotEqual(env_proc.returncode, 0)
        self.assertIn("invalid env var name: [REDACTED]", env_proc.stderr)
        self.assertNotIn("sk-secret-env", env_proc.stderr)

    def test_provider_list_redacts_contaminated_state(self) -> None:
        provider_state = pathlib.Path(self.tmp.name) / "state" / "providers.json"
        provider_state.parent.mkdir(parents=True, exist_ok=True)
        provider_state.write_text(
            json.dumps(
                {
                    "providers": {
                        "openai-main": {
                            "id": "openai-main",
                            "kind": "openai",
                            "env": "OPENAI_API_KEY",
                            "model": "openai/gpt-5.5",
                            "transport": "http",
                            "secretStored": False,
                            "apiKey": "sk-secret-value",
                            "refreshToken": "ghp_1234567890abcdef",
                        }
                    }
                }
            ),
            encoding="utf-8",
        )
        listed = self.run_lfg("provider", "list")
        self.assertEqual(listed["count"], 1)
        provider = listed["providers"][0]
        self.assertEqual(provider["id"], "openai-main")
        self.assertNotIn("apiKey", provider)
        self.assertNotIn("refreshToken", provider)
        self.assertEqual(provider["env"], "OPENAI_API_KEY")

    def test_setup_wizard_non_interactive_provider_flags(self) -> None:
        setup = self.run_lfg("setup", "--no-tui", "--openai", "yes", "--zai", "yes", "--copilot", "no", "--codex", "no")
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
            input="y\nn\ny\nn\n",
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
        self.assertEqual(status["version"], "0.0.1")
        self.assertEqual(status["catalogSkills"], 21)

        catalog = self.run_lfg("catalog")
        names = {skill["name"] for skill in catalog["skills"]}
        self.assertIn("hyperplan", names)
        self.assertIn("review-work", names)

    def test_doctor_state_schema_check_and_provider_metadata(self) -> None:
        doctor_state = self.run_lfg("doctor", "state", "schema", "check")
        self.assertTrue(doctor_state["ok"], doctor_state)
        self.assertEqual(doctor_state["status"], "pass")
        self.assertEqual(doctor_state["schema"]["version"], 2)
        self.assertIn("state-schema-versioning=ok", doctor_state["evidence"])
        self.assertIn("state-schema-doctor=ok", doctor_state["evidence"])

        providers = self.run_lfg("provider", "list")
        self.assertTrue(providers["ok"], providers)
        self.assertEqual(providers["status"], "ok")
        self.assertIn("providers", providers)

        models = self.run_lfg("models")
        self.assertTrue(models["ok"], models)
        self.assertEqual(models["status"], "ok")

    def test_omo_skill_surfaces_have_catalog_entries_with_compat_docs(self) -> None:
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
        self.assertIn("manifest-and-file-checks=ok", roadmap)
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
        skill_names = {path.name for path in (PLUGIN / "skills").iterdir() if path.is_dir() and path.name != "lfg"}
        catalog_names = [skill["name"] for skill in json.loads((PLUGIN / "catalog" / "omo-skill-map.json").read_text(encoding="utf-8"))["skills"]]
        expected_catalog_names = [
            "agent-browser",
            "ai-slop-remover",
            "cancel",
            "dev-browser",
            "doctor",
            "frontend-ui-ux",
            "git-master",
            "hyperplan",
            "lfg",
            "plan",
            "playwright",
            "provider",
            "ralph",
            "review-work",
            "setup",
            "start-work",
            "team",
            "team-mode",
            "ulw",
            "work-with-pr",
            "worker",
        ]
        self.assertEqual(catalog_names, expected_catalog_names)
        self.assertTrue(set(expected_catalog_names) - {"lfg"} <= skill_names)
        for removed in {"ai-slop-cleaner", "omx-setup", "ultrawork"}:
            self.assertNotIn(removed, skill_names)
            self.assertNotIn(removed, catalog_names)
        for active_doc in [
            REPO / "ROADMAP.md",
            REPO / "docs" / "HOW-IT-WORKS.md",
            REPO / "docs" / "agent-system" / "README.md",
            REPO / "docs" / "agent-system" / "hyperplan-teams.md",
            REPO / "docs" / "agent-system" / "categories.md",
            REPO / "docs" / "agent-system" / "omo-parity-comparison.md",
            REPO / "docs" / "wiki" / "Verification.md",
            REPO / "docs" / "wiki" / "Release-Process.md",
            REPO / "lfg.egg-info" / "PKG-INFO",
        ]:
            text = active_doc.read_text(encoding="utf-8")
            self.assertNotIn("/omx-setup", text, str(active_doc))
            self.assertNotIn("grok_build_omx_setup", text, str(active_doc))
            self.assertNotIn("iz,gonow,grok", text, str(active_doc))
            self.assertNotIn("skills=17", text, str(active_doc))
            self.assertNotIn("self-test.sh", text, str(active_doc))
            self.assertNotIn("grok-install-smoke.sh", text, str(active_doc))
            self.assertNotIn("~/.grok/plugins/grok-build/omo/", text, str(active_doc))
            self.assertNotIn("All agents run on Grok models (`xai/grok-4.3`)", text, str(active_doc))
            self.assertNotIn('"agent": "iz"', text, str(active_doc))
            self.assertNotIn('"agent": "grok"', text, str(active_doc))
            self.assertNotIn('"agent": "gonow"', text, str(active_doc))
            self.assertNotIn("plugins/lfg/src/agents/legacy/", text, str(active_doc))
        for rel in [
            "docs/features/ai-slop-cleaner-runtime.md",
            "docs/features/ultrawork-runtime.md",
        ]:
            self.assertTrue((PLUGIN / rel).exists(), rel)

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

        self.assertEqual(replies[0]["result"]["serverInfo"]["version"], "0.0.1")
        tool_names = {tool["name"] for tool in replies[1]["result"]["tools"]}
        expected = {
            "analyze",
            "ask",
            "autopilot",
            "autoresearch",
            "autoresearch_goal",
            "cancel",
            "catalog",
            "cleanup",
            "code_review",
            "deep_interview",
            "design",
            "doctor",
            "goal",
            "hook_bridge",
            "hud",
            "notifications",
            "setup",
            "performance_goal",
            "pipeline",
            "plan",
            "ralph",
            "ralplan",
            "runtime",
            "skill",
            "slash",
            "team",
            "ultraqa",
            "ultrawork",
            "ultragoal",
            "visual_ralph",
            "wiki",
            "worker",
        }
        self.assertEqual(expected - tool_names, set())
        self.assertFalse(any(name.startswith("grok_build_") for name in tool_names))



    def test_ci_and_install_smoke_contracts(self) -> None:
        workflow = (REPO / ".github/workflows/smoke.yml").read_text(encoding="utf-8")
        self.assertIn("python3 plugins/lfg/bin/self-test.py", workflow)
        self.assertIn("actions/checkout@v5", workflow)
        self.assertIn("sudo apt-get install -y tmux", workflow)
        self.assertIn("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24", workflow)

        self.assertFalse((REPO / "scripts").exists(), "top-level scripts/ is obsolete")
        self.assertFalse((REPO / "Cargo.toml").exists(), "root Cargo.toml is obsolete")
        self.assertFalse((REPO / "Cargo.lock").exists(), "root Cargo.lock is obsolete")
        self.assertFalse((REPO / "src").exists(), "root src/ is obsolete")
        self.assertTrue((REPO / "tests" / "smoke" / "test_grok_build_runtime.py").exists())
        self.assertTrue((REPO / "tests" / "AGENTS.md").exists())

        install_smoke = PLUGIN / "bin" / "grok-install-smoke.py"
        self.assertTrue(os.access(install_smoke, os.X_OK))
        script = install_smoke.read_text(encoding="utf-8")
        self.assertIn("shutil.copytree", script)
        self.assertIn('"inspect", "--json"', script)
        self.assertIn("assert len(skills) == 21", script)
        self.assertIn("grok-install-smoke=ok skills=21", script)

        gateway = (PLUGIN / "bin" / "lfg.py").read_text(encoding="utf-8")
        self.assertIn('RUNTIME = ROOT / "src" / "runtime" / "cli.py"', gateway)
        runtime = (PLUGIN / "src" / "runtime" / "cli.py").read_text(encoding="utf-8")
        self.assertIn("def attach_backend_from_tmux_pane", runtime)
        self.assertIn("split-window", runtime)

        selftest = (PLUGIN / "bin" / "self-test.py").read_text(encoding="utf-8")
        for marker in [
            "manifest-and-file-checks=ok",
            "marketplace-metadata=ok",
            "release-notes=ok",
            "marketplace-source=ok",
            "mcp-stdio-isolation=ok",
            "mcp-stderr-isolated=ok",
            "todo-continuation=ok",
            "hook-bridge-pytest=ok",
            "state-schema-versioning=ok",
            "state-schema-doctor=ok",
            "team-dry-run=ok",
            "team-tmux-lifecycle=ok",
            "runtime-smoke-coverage=100%",
            '"python3", "-m", "pytest", "tests/smoke/test_hook_bridge_pytest.py", "-q"',
            '"python3", "-m", "unittest", "tests.smoke.test_grok_build_runtime", "-v"',
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
        self.assertIn("lfg-v0.4.0", release_tag_doc)

        hook_doc = (REPO / "docs" / "HOOK_EVIDENCE.md").read_text(encoding="utf-8")
        self.assertIn("src/hooks/audit_hook.sh", hook_doc)
        self.assertIn("lfg hook-bridge install", hook_doc)
        self.assertIn("grok_build_hook_bridge", hook_doc)
        self.assertIn("[SYSTEM REMINDER - TODO CONTINUATION]", hook_doc)
        self.assertIn("Prometheus markdown-only", hook_doc)
        self.assertIn("state resumption", hook_doc)

        smoke_doc = (REPO / "docs" / "SMOKE.md").read_text(encoding="utf-8")
        for marker in [
            "plugins/lfg/bin/self-test.py",
            "plugins/lfg/bin/grok-install-smoke.py",
            "runtime-smoke-coverage=100%",
            "lfg --json doctor",
            "mcp-stdio-isolation=ok",
            "hook-bridge-pytest=ok",
            "todo-continuation=ok",
            "state-schema-doctor=ok",
            "team-dry-run=ok",
            "team-tmux-lifecycle=ok",
            "release-notes=ok",
            "marketplace-source=ok",
        ]:
            self.assertIn(marker, smoke_doc)

        marketplace_install_doc = (REPO / "docs" / "MARKETPLACE_INSTALL.md").read_text(encoding="utf-8")
        self.assertIn("https://raw.githubusercontent.com/islee23520/lfg/main/.grok/plugins/marketplace.json", marketplace_install_doc)
        self.assertIn("https://raw.githubusercontent.com/islee23520/lfg/main/.grok/plugins/marketplace.json", marketplace_install_doc)

        release_notes_doc = (REPO / "docs" / "MARKETPLACE_RELEASE_NOTES.md").read_text(encoding="utf-8")
        self.assertIn("islee23520/lfg", release_notes_doc)
        self.assertIn("lfg 0.4.0", release_notes_doc)
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
            self.assertNotIn("skills=17", text, str(doc))

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
            "plugins/lfg/bin/self-test.py",
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


    def test_lfg_default_execs_grok_cli(self) -> None:
        fake_bin = pathlib.Path(self.tmp.name) / "bin"
        fake_bin.mkdir()
        fake_grok = fake_bin / "grok"
        fake_grok.write_text(
            """#!/usr/bin/env bash
if [[ "${1:-}" == "update" && "${2:-}" == "--check" ]]; then exit 0; fi
printf 'fake-grok-launched args=%s\n' "$*"
printf 'known-file=%s\n' "${LFG_GROK_BUILD_KNOWN_KEYWORDS_FILE:-}"
printf 'known-keywords=%s\n' "${LFG_GROK_BUILD_KNOWN_KEYWORDS:-}"
""",
            encoding="utf-8",
        )
        fake_grok.chmod(0o755)
        env = dict(self.env)
        env["PATH"] = f"{fake_bin}{os.pathsep}{env.get('PATH', '')}"

        proc = subprocess.run([str(LFG)], cwd=str(REPO), env=env, text=True, capture_output=True, check=True, timeout=20)
        self.assertIn("fake-grok-launched", proc.stdout)
        self.assertIn("Known @agent keywords:", proc.stderr)
        self.assertIn("@sisyphus-junior", proc.stdout)
        keyword_file_line = next(line for line in proc.stdout.splitlines() if line.startswith("known-file="))
        keyword_file = pathlib.Path(keyword_file_line.removeprefix("known-file="))
        self.assertTrue(keyword_file.exists())
        keyword_payload = json.loads(keyword_file.read_text(encoding="utf-8"))
        self.assertEqual(keyword_payload["registrationKind"], "known-keyword")
        self.assertIn("@sisyphus-junior", keyword_payload["ids"])

        runtime = subprocess.run([str(LFG), "--json", "status"], cwd=str(REPO), env=self.env, text=True, capture_output=True, check=True, timeout=20)
        launched = json.loads(runtime.stdout)
        self.assertTrue(launched["ok"])
        self.assertEqual(launched["launcher"], "lfg")
        self.assertEqual(launched["version"], "0.0.1")
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
        for member in team["members"]:
            self.assertEqual(member["spawn_envelope"]["mode"], "fallback")
            self.assertEqual(member["spawn_envelope"]["evidenceClass"], "dependency-free-smoke")
            self.assertTrue(member["spawn_envelope"]["manual_gate_required"])
            self.assertEqual(member["spawn_envelope"]["oracleReview"]["gate"], "xai/grok")
            self.assertFalse(member["spawn_envelope"]["execution"]["actualChildExecution"])
            self.assertEqual(member["spawned_as_subagent_status"], "manual_gate_required_fallback")

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
        team = self.run_lfg("team", "create", "sisyphus,atlas,sisyphus-junior", "provider override", "--providers", "noop", "--dry-run")
        self.assertEqual([m["provider"] for m in team["members"]], ["noop", "noop", "noop"])
        self.assertTrue(all("noop provider ready" in m["command"] for m in team["members"]))

    def test_ultragoal_hyperplan_template_uses_canonical_omo_agents(self) -> None:
        spawned = self.run_lfg("ultragoal", "spawn", "canonical hyperplan", "--template", "hyperplan", "--id", "hyperplan-omo", "--dry-run")
        roles = [m["role"] for m in spawned["team"]["members"]]
        self.assertEqual(roles, ["sisyphus", "atlas", "sisyphus-junior"])
        self.assertNotIn("iz", roles)
        self.assertNotIn("gonow", roles)
        self.assertNotIn("grok", roles)

    def test_team_create_hyperplan_uses_canonical_omo_agents(self) -> None:
        team = self.run_lfg("team", "create", "hyperplan", "direct hyperplan", "--providers", "noop", "--dry-run")
        roles = [m["role"] for m in team["members"]]
        self.assertEqual(roles, ["sisyphus", "atlas", "sisyphus-junior"])
        self.assertEqual([m["provider"] for m in team["members"]], ["noop", "noop", "noop"])

    def test_mcp_omo_team_create_hyperplan_uses_canonical_omo_agents(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "omo_team_create", "arguments": {"objective": "mcp hyperplan", "dryRun": True, "providers": "noop"}}},
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
        team_payload = payload["data"] if "data" in payload else payload
        roles = [m["role"] for m in team_payload["members"]]
        self.assertEqual(roles, ["sisyphus", "atlas", "sisyphus-junior"])

    def test_rejects_unsafe_provider_and_team_name(self) -> None:
        bad_provider = subprocess.run(
            [str(LFG), "--json", "team", "create", "1:sisyphus", "bad provider", "--providers", "noop;touch /tmp/pwn", "--dry-run"],
            cwd=str(REPO),
            env=self.env,
            text=True,
            capture_output=True,
            timeout=20,
        )
        self.assertNotEqual(bad_provider.returncode, 0)
        self.assertIn("unknown provider", bad_provider.stderr)

        bad_name = subprocess.run(
            [str(LFG), "--json", "team", "create", "1:sisyphus", "bad name", "--name", "bad'name", "--providers", "noop", "--dry-run"],
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
                "params": {"name": "agents", "arguments": {"action": "list"}},
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
        self.assertIn("agents", tool_names)
        self.assertEqual(sum(1 for tool in tools if tool["name"] == "agents"), 1)
        agents_schema = next(tool["inputSchema"] for tool in tools if tool["name"] == "agents")
        for key in {"category", "provider", "model", "reasoning"}:
            self.assertIn(key, agents_schema["properties"])
        listing = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(listing["returncode"], 0)
        self.assertIn("sisyphus-junior", {agent["id"] for agent in listing["data"]["agents"]})
        atlas = json.loads(replies[3]["result"]["content"][0]["text"])
        self.assertEqual(atlas["returncode"], 0)
        self.assertEqual(atlas["data"]["agent"]["id"], "atlas")

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

        deep = json.loads(replies[1]["result"]["content"][0]["text"])["data"]
        self.assertEqual(deep["resolvedModelProfile"], {"provider": "openai", "model": "openai/gpt-5.5", "reasoning": "medium"})
        zai = json.loads(replies[2]["result"]["content"][0]["text"])["data"]
        self.assertTrue(zai["ok"], zai)
        self.assertEqual(zai["resolvedModelProfile"]["provider"], "zai")
        self.assertEqual(zai["resolvedModelProfile"]["model"], "zai-coding-plan")

    def test_mcp_omo_catalog_matches_cli_catalog(self) -> None:
        cli = self.run_lfg("agents", "list")
        proc = subprocess.Popen(
            ["python3", str(MCP)],
            cwd=str(REPO),
            env=self.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin and proc.stdout and proc.stderr
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "omo_agent_catalog", "arguments": {"filter": "all"}},
            },
        ]
        for msg in messages:
            proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        stdout_lines = [proc.stdout.readline() for _ in messages]
        replies = [json.loads(line) for line in stdout_lines]
        proc.stdin.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        stderr = proc.stderr.read()
        proc.stdout.close()
        proc.stderr.close()

        self.assertEqual(stderr, "")
        self.assertTrue(all(json.loads(line)["jsonrpc"] == "2.0" for line in stdout_lines))
        tool_names = {tool["name"] for tool in replies[1]["result"]["tools"]}
        for name in {"spawn", "provider", "boulder", "hyperplan", "atlas", "omo_ulw"}:
            self.assertIn(name, tool_names)
            self.assertEqual(sum(1 for tool in replies[1]["result"]["tools"] if tool["name"] == name), 1)
        mcp_catalog = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(mcp_catalog["returncode"], 0)
        self.assertEqual(
            sorted(agent["id"] for agent in mcp_catalog["agents"]),
            sorted(agent["id"] for agent in cli["agents"]),
        )
        self.assertEqual(mcp_catalog["data"]["count"], cli["count"])

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

        self.assertEqual(replies[0]["result"]["serverInfo"]["version"], "0.0.1")
        tool_names = {tool["name"] for tool in replies[1]["result"]["tools"]}
        for name in {"catalog", "runtime", "team", "slash", "hook_bridge", "models", "auth", "provider", "spawn", "boulder", "hyperplan", "atlas"}:
            self.assertIn(name, tool_names)
        payload = json.loads(replies[2]["result"]["content"][0]["text"])
        self.assertEqual(payload["returncode"], 0)
        self.assertIn('"status": "planned"', payload["stdout"])
        providers_payload = json.loads(replies[3]["result"]["content"][0]["text"])
        self.assertEqual(providers_payload["returncode"], 0)
        self.assertIn('"smokeSafe": "noop"', providers_payload["stdout"])
        auth_payload = json.loads(replies[4]["result"]["content"][0]["text"])
        self.assertEqual(auth_payload["returncode"], 0)
        self.assertFalse(auth_payload["data"]["auth"]["secretStored"])
        models_payload = json.loads(replies[5]["result"]["content"][0]["text"])
        self.assertEqual(models_payload["returncode"], 0)
        self.assertEqual(models_payload["data"]["secretStorage"], "env-name-only")
        self.assertTrue(models_payload["data"]["providers"]["xai"]["configured"], models_payload)

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
        for provider in ("grok", "subagent"):
            row = next(item for item in matrix if item["provider"] == provider)
            self.assertFalse(row["available"], row)
            self.assertEqual(row["status"], "manual-gated")
            self.assertTrue(row["manualGateRequired"])
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
        self.assertIn("audit_hook.sh", script)
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
        proof = self.evidence_artifact("ralplan-review")
        reviewed = self.run_lfg("ralplan", "review", "--id", "smoke-ralplan", "--verdict", "approve", "--reviewer", "architect", "--evidence", "looks safe", "--evidence-artifact", proof)
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
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_ralplan", "arguments": {"action": "review", "id": "mcp-ralplan", "verdict": "approve", "reviewer": "architect", "evidence": "ok", "evidenceArtifactPaths": [self.evidence_artifact("mcp-evidence")]} }},
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
        proof = self.evidence_artifact("goal-update")
        updated = self.run_lfg("goal", "update", "--id", "smoke-goal", "--status", "complete", "--note", "verified", "--evidence-artifact", proof)
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
                "params": {"name": "grok_build_goal", "arguments": {"action": "update", "id": "mcp-goal", "status": "complete", "note": "done", "evidenceArtifactPaths": [self.evidence_artifact("mcp-goal")]}},
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
        # exercises the new OMO-parity ultragoal surface
        ug = self.run_lfg("ultragoal", "create", "Smoke ultragoal parity", "--id", "smoke-ug", "--brief", "test brief", "--checklist", "a;b")
        self.assertEqual(ug["id"], "smoke-ug")
        self.assertTrue((pathlib.Path(self.tmp.name) / "ultragoal" / "smoke-ug" / "brief.md").exists())
        st = self.run_lfg("ultragoal", "status", "--id", "smoke-ug")
        self.assertEqual(st["goals"]["aggregateStatus"], "active")
        proof = self.evidence_artifact("ultragoal-checkpoint")
        cp = self.run_lfg("ultragoal", "checkpoint", "--id", "smoke-ug", "--status", "complete", "--evidence", "ai-slop + code-review APPROVE + tests", "--force-gate", "--evidence-artifact", proof)
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
        proof = self.evidence_artifact("performance-goal")
        measured = self.run_lfg("performance-goal", "measure", "--id", "smoke-perf", "--metric", "latency", "--baseline", "120", "--current", "80", "--target", "100", "--evidence", "bench ok", "--evidence-artifact", proof)
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
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_performance_goal", "arguments": {"action": "measure", "id": "mcp-perf", "metric": "latency", "baseline": 120, "current": 80, "target": 100, "evidence": "ok", "evidenceArtifactPaths": [self.evidence_artifact("mcp-evidence")]} }},
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
        proof = self.evidence_artifact("visual-ralph")
        verdict = self.run_lfg("visual-ralph", "verdict", "--id", "smoke-visual", "--score", "0.91", "--status", "pass", "--evidence", "pixel diff ok", "--evidence-artifact", proof)
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
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_visual_ralph", "arguments": {"action": "verdict", "id": "mcp-visual", "score": 0.91, "status": "pass", "evidence": "ok", "evidenceArtifactPaths": [self.evidence_artifact("mcp-evidence")]} }},
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
        proof = self.evidence_artifact("autoresearch-goal")
        critiqued = self.run_lfg("autoresearch-goal", "critique", "--id", "smoke-arg", "--verdict", "pass", "--critic", "professor", "--evidence", "sources verified", "--evidence-artifact", proof)
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
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_autoresearch_goal", "arguments": {"action": "critique", "id": "mcp-arg", "verdict": "pass", "critic": "professor", "evidence": "ok", "evidenceArtifactPaths": [self.evidence_artifact("mcp-evidence")]} }},
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


    def test_setup_check_plan_show(self) -> None:
        check = self.run_lfg("setup", "check")
        self.assertEqual(check["status"], "ok")
        self.assertTrue(check["checks"]["manifestExists"])
        plan = self.run_lfg("setup", "install-plan", "--marketplace", "islee23520/lfg")
        self.assertEqual(plan["status"], "planned")
        shown = self.run_lfg("setup", "show")
        self.assertEqual(shown["marketplace"], "islee23520/lfg")

    def test_mcp_setup_tool_rejects_legacy_omx_alias(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "setup", "arguments": {"action": "install-plan", "marketplace": "islee23520/lfg"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_omx_setup", "arguments": {"action": "show"}}},
            {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "omx_setup", "arguments": {"action": "show"}}},
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
        self.assertEqual(plan_payload["returncode"], 0)
        self.assertIn("error", replies[2])
        self.assertIn("error", replies[3])
        self.assertIn('"status": "planned"', plan_payload["stdout"])
        self.assertIn("grok_build_omx_setup", replies[2]["error"]["message"])
        self.assertIn("omx_setup", replies[3]["error"]["message"])

    def test_skill_list_search_catalog(self) -> None:
        listed = self.run_lfg("skill", "list")
        self.assertEqual(listed["count"], 21)
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
        proof = self.evidence_artifact("pipeline-update")
        updated = self.run_lfg("pipeline", "update", "--id", "smoke-pipeline", "--stage", "1", "--status", "complete", "--note", "planned", "--evidence-artifact", proof)
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
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_pipeline", "arguments": {"action": "update", "id": "mcp-pipeline", "stage": 1, "status": "complete", "evidenceArtifactPaths": [self.evidence_artifact("mcp-pipeline")]}}},
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
        proof = self.evidence_artifact("autopilot-advance")
        updated = self.run_lfg("autopilot", "advance", "--id", "smoke-autopilot", "--phase", "1", "--status", "complete", "--evidence", "plan ok", "--evidence-artifact", proof)
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
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_autopilot", "arguments": {"action": "advance", "id": "mcp-autopilot", "phase": 1, "status": "complete", "evidence": "ok", "evidenceArtifactPaths": [self.evidence_artifact("mcp-evidence")]} }},
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
        self.assertNotIn("response", zai["result"])
        self.assertIn("debug", zai["result"])
        self.assertFalse(zai["result"]["debug"]["rawResponseExposed"])
        pointer = pathlib.Path(self.tmp.name) / "state" / "last-ask.json"
        self.assertTrue(pointer.exists())
        listed = self.run_lfg("ask", "list")
        self.assertEqual(listed["count"], 2)

    def test_call_zai_redacts_raw_provider_response_from_public_shape(self) -> None:
        module = load_grok_build_module()
        original_urlopen = module.urllib.request.urlopen
        original_key = os.environ.get("ZAI_API_KEY")

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return json.dumps({
                    "id": "provider-response-id",
                    "choices": [{"message": {"content": "advisor text"}}],
                    "provider_specific": {"raw": True},
                }).encode("utf-8")

        try:
            os.environ["ZAI_API_KEY"] = "fixture-key"
            module.urllib.request.urlopen = lambda *_args, **_kwargs: FakeResponse()
            result = module.call_zai("review architecture", dry_run=False)
        finally:
            module.urllib.request.urlopen = original_urlopen
            if original_key is None:
                os.environ.pop("ZAI_API_KEY", None)
            else:
                os.environ["ZAI_API_KEY"] = original_key

        self.assertTrue(result["ok"], result)
        self.assertEqual(result["output"], "advisor text")
        self.assertNotIn("response", result)
        self.assertNotIn("provider_specific", result)
        self.assertFalse(result["debug"]["rawResponseExposed"])
        self.assertIn("providerResponseRedacted", result["debug"])

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
        proof = self.evidence_artifact("worker-result")
        result = self.run_lfg("worker", "result", "worker-1", "tests pass", "--status", "complete", "--evidence-artifact", proof)
        self.assertEqual(result["status"], "complete")
        shown = self.run_lfg("worker", "status", "worker-1")
        self.assertEqual(shown["result"], "tests pass")

    def test_mcp_worker_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_worker", "arguments": {"action": "ack", "worker": "mcp-worker", "task": "verify"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_worker", "arguments": {"action": "result", "worker": "mcp-worker", "result": "ok", "status": "complete", "evidenceArtifactPaths": [self.evidence_artifact("mcp-worker")]}}},
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
        proof = self.evidence_artifact("ralph-step")
        stepped = self.run_lfg("ralph", "step", "--id", "smoke-ralph", "--status", "complete", "--evidence", "tests pass", "--evidence-artifact", proof)
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
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_ralph", "arguments": {"action": "step", "id": "mcp-ralph", "status": "complete", "evidence": "ok", "evidenceArtifactPaths": [self.evidence_artifact("mcp-evidence")]} }},
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
        proof = self.evidence_artifact("smoke-ultrawork")
        updated = self.run_lfg("ultrawork", "update", "--id", "smoke-ultrawork", "--task", "1", "--status", "complete", "--evidence", "verified", "--evidence-artifact", proof)
        self.assertEqual(updated["tasks"][0]["status"], "complete")
        shown = self.run_lfg("ultrawork", "show", "--id", "smoke-ultrawork")
        self.assertEqual(shown["tasks"][0]["evidence"], "verified")

    def test_mcp_ultrawork_tool(self) -> None:
        proc = subprocess.Popen(["python3", str(MCP)], cwd=str(REPO), env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        assert proc.stdin and proc.stdout
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "grok_build_ultrawork", "arguments": {"action": "create", "id": "mcp-ultrawork", "objective": "MCP batch", "tasks": "a;b"}}},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_ultrawork", "arguments": {"action": "update", "id": "mcp-ultrawork", "task": 1, "status": "complete", "evidence": "ok", "evidenceArtifactPaths": [self.evidence_artifact("mcp-evidence")]} }},
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
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "grok_build_ultragoal", "arguments": {"action": "checkpoint", "id": "mcp-ultragoal", "status": "complete", "evidence": "forced smoke gate", "forceGate": True, "evidenceArtifactPaths": [self.evidence_artifact("mcp-ultragoal")]}}},
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
    AGENTS_DIR = PLUGIN / "src" / "agents"
    GROK_BUILD = PLUGIN / "bin" / "lfg.py"
    HARNESS = PLUGIN / "src" / "hooks" / "goal_harness.py"
    HARNESS_ROUTER = PLUGIN / "hooks" / "scripts" / "lfg-goal-harness.py"

    def test_legacy_agent_files_are_not_bundled(self) -> None:
        legacy = self.AGENTS_DIR / "legacy"
        self.assertFalse(legacy.exists(), "legacy agent mode should not be bundled under src/agents/legacy")

    def test_boulder_last_updated_by_is_sisyphus(self) -> None:
        src = (PLUGIN / "src" / "runtime" / "cli.py").read_text(encoding="utf-8")
        self.assertIn('"last_updated_by": "sisyphus"', src)
        self.assertNotIn('"last_updated_by": "lina"', src)
        self.assertNotIn('"last_updated_by": "boulder-state"', src)

    def test_harness_injection_uses_sisyphus(self) -> None:
        src = self.HARNESS.read_text(encoding="utf-8")
        self.assertIn("You are Sisyphus", src)
        self.assertNotIn("You are Lina", src)
        self.assertIn('"last_updated_by": "sisyphus"', src)
        self.assertIn('owner": "atlas | hephaestus | sisyphus"', src)
        self.assertNotIn('owner": "gonow | iz | lina"', src)
        self.assertNotIn("operating as Lina", src)

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
        result = self.mod.parse_team_spec("sisyphus,atlas,sisyphus-junior")
        self.assertEqual(result, [(1, "sisyphus"), (1, "atlas"), (1, "sisyphus-junior")])

    def test_parse_team_spec_named_with_count(self) -> None:
        result = self.mod.parse_team_spec("1:sisyphus,2:atlas,1:sisyphus-junior")
        self.assertEqual(result, [(1, "sisyphus"), (2, "atlas"), (1, "sisyphus-junior")])

    def test_parse_team_spec_generic(self) -> None:
        result = self.mod.parse_team_spec("3:executor")
        self.assertEqual(result, [(3, "executor")])

    def test_parse_team_spec_rejects_legacy_named_agents(self) -> None:
        for spec in ("iz,gonow,grok", "1:iz,2:gonow,1:grok", "lina"):
            with self.assertRaises(SystemExit):
                self.mod.parse_team_spec(spec)

    def test_bundled_agent_sisyphus_loads(self) -> None:
        agent = self.mod.load_agent_definition("sisyphus")
        self.assertIsNotNone(agent)
        self.assertEqual(agent["name"], "sisyphus")
        self.assertEqual(agent["family"], "orchestrator")

    def test_bundled_agent_hephaestus_loads(self) -> None:
        agent = self.mod.load_agent_definition("hephaestus")
        self.assertIsNotNone(agent)
        self.assertEqual(agent["name"], "hephaestus")
        self.assertEqual(agent["family"], "deep-worker")

    def test_bundled_agent_prometheus_loads(self) -> None:
        agent = self.mod.load_agent_definition("prometheus")
        self.assertIsNotNone(agent)
        self.assertEqual(agent["name"], "prometheus")
        self.assertEqual(agent["family"], "planner")

    def test_legacy_named_agents_do_not_load_from_plugin_bundle(self) -> None:
        for name in ("lina", "gonow", "iz", "grok"):
            self.assertIsNone(self.mod.load_agent_definition(name))


class HarnessRuntimeSmoke(unittest.TestCase):
    """Verify hook helper behavior without relying on grok_build import aliases."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.original_env = os.environ.copy()
        os.environ["GROK_PLUGIN_DATA"] = self.tmp.name
        self.module_name = "lfg_goal_harness_test"
        spec = importlib.util.spec_from_file_location(self.module_name, PLUGIN / "src" / "hooks" / "goal_harness.py")
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
        self.assertEqual(boulder["last_updated_by"], "sisyphus")
        self.assertEqual(boulder["status_summary"], "ok")

    def test_boulder_path_rejects_traversal(self) -> None:
        with self.assertRaises(ValueError):
            self.harness.boulder_path("../escape")

    def test_task_and_evidence_status_helpers_match_runtime(self) -> None:
        self.assertFalse(self.harness.task_is_pending({"status": "completed"}))
        self.assertFalse(self.harness.task_is_pending({"status": "done"}))
        self.assertTrue(self.harness.task_is_pending({"status": "in_progress"}))
        self.assertTrue(self.harness.message_is_evidence({"type": "evidence_submission"}))

    def test_todo_continuation_requires_incomplete_work_and_progress_evidence(self) -> None:
        snapshot = {
            "boulder": {
                "next_actions": [{"id": "NA-1", "goal": "finish task", "status": "in_progress"}],
                "recent_evidence": [{"ts": "2026-05-20T00:00:00Z", "path": "artifact.txt"}],
            },
            "active_runs": [],
        }
        first = self.harness.todo_continuation_reminder(snapshot, "PostToolUse")
        second = self.harness.todo_continuation_reminder(snapshot, "PostToolUse")
        self.assertIn("[SYSTEM REMINDER - TODO CONTINUATION]", first)
        self.assertIn("finish task", first)
        self.assertEqual(second, "")

        snapshot["boulder"]["recent_evidence"] = [{"ts": "2026-05-20T00:00:01Z", "path": "artifact-2.txt"}]
        self.assertIn("[SYSTEM REMINDER - TODO CONTINUATION]", self.harness.todo_continuation_reminder(snapshot, "PostToolUse"))

        completed = {
            "boulder": {
                "next_actions": [{"id": "NA-1", "goal": "finish task", "status": "completed"}],
                "recent_evidence": [{"ts": "2026-05-20T00:00:02Z", "path": "artifact.txt"}],
            },
            "active_runs": [],
        }
        self.assertEqual(self.harness.todo_continuation_reminder(completed, "PostToolUse"), "")

    def test_todo_continuation_suppresses_no_evidence_loop(self) -> None:
        snapshot = {
            "boulder": {"next_actions": [{"id": "NA-1", "goal": "finish task", "status": "pending"}]},
            "active_runs": [],
        }
        self.assertEqual(self.harness.todo_continuation_reminder(snapshot, "Stop"), "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
