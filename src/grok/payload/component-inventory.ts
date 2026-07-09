import { writeFile } from "node:fs/promises"
import { join } from "node:path"

export const COMPONENT_INVENTORY_FILE = "lfg-component-inventory.json" as const
export const UPSTREAM_OMO_NAME = "oh-my-openagent" as const
export const UPSTREAM_OMO_VERSION = "4.13.0" as const
export const UPSTREAM_OMO_TAG = "v4.13.0" as const
export const UPSTREAM_OMO_RELEASE_URL = "https://github.com/code-yeongyu/oh-my-openagent/releases/tag/v4.13.0" as const

export const COMPONENTS = [
  { id: "comment-checker", status: "Grok-adapted", evidence: "T2 behavior proof: installed native Grok PostToolUse hook lfg-native-comment-checker.mjs emits bounded feedback for noisy comments, stays silent on clean files, and fail-closes on malformed JSON." },
  { id: "git-bash", status: "Manifest-only", evidence: "git_bash MCP is disabled on macOS/Linux and Windows-unverified. lfg can copy the upstream 4.13.0 git-bash-mcp runtime from a package-shaped source, but behavior-level Windows support remains unverified." },
  { id: "rules", status: "Grok-adapted", evidence: "Component hooks are bridged through lfg-grok-hook-bridge.mjs when present in the installed payload." },
  { id: "lsp", status: "Grok-adapted", evidence: "T5 behavior proof: bundled lfg-lsp MCP runtime exposes typescript_diagnostics, returns typed malformed-input errors, reports TS2322 on dirty fixtures, and returns empty diagnostics for clean fixtures. Upstream automatic PostToolUse/PostCompact hook reinjection remains unclaimed." },
  { id: "ast_grep", status: "Grok-adapted", evidence: "T4 behavior proof: bundled ast_grep MCP runtime exposes ast_grep_search, returns structural matches, reports malformed_pattern and invalid_path typed errors, and has a deterministic fallback when sg is unavailable." },
  { id: "codegraph", status: "Grok-adapted", evidence: "External @colbymchenry/codegraph semantic-code-graph MCP binary wrapped via utils/codegraph provisioning + Grok-native .mcp.json command server; Phase 0 of the core/adapter port strategy (docs/grok-adapter-core-port-strategy.md)." },
  { id: "grep_app", status: "Remote URL manifest-only", evidence: "grep_app MCP is represented as the upstream remote URL server https://mcp.grep.app; lfg validates manifest shape and does not live-call it by default." },
  { id: "context7", status: "Remote URL manifest-only", evidence: "context7 MCP is represented as the upstream remote URL server https://mcp.context7.com/mcp; lfg validates manifest shape and does not live-call it by default." },
  { id: "ultrawork", status: "Grok-adapted", evidence: "Ultrawork OMO hook parity routed natively via component/runtime and Grok-native OMO agent surfaces (default/sisyphus/role agents); implements `omo hook <event>` shape for Grok without new top-level commands." },
  { id: "ulw-loop", status: "Grok-adapted", evidence: "Project .omo awareness plus upstream OMO ulw-loop skill directory; durable CLI packaged as lfg ulw-loop/ulw (src/core/omo/ulw-loop) with Grok session env keys." },
  { id: "ulw-plan", status: "Grok-adapted", evidence: "Upstream OMO ulw-plan skill directory installed via skills/ copy, including references/full-workflow.md, intent references, and scripts/scaffold-plan.mjs." },
  { id: "ultimate-browsing", status: "Implemented", evidence: "Upstream OMO ultimate-browsing skill payload is installed via skills/ copy, including SKILL.md, references, engine, scripts, attribution, and Grok-converted agent metadata. This is payload availability only; lfg does not claim a separate Grok-native stealth-browser runtime beyond the installed skill assets." },
  { id: "bootstrap", status: "Deferred", evidence: "Upstream bootstrap provisioning is a SessionStart component for Codex runtime dependencies; lfg does not run provisioning hooks during Grok setup." },
  { id: "auto-update", status: "Unsupported", evidence: "Upstream auto-update is a SessionStart script that can run `npx lazycodex-ai@latest install`; lfg keeps updates user-controlled and does not enable this hook." },
  { id: "start-work-continuation", status: "Deferred", evidence: "Boulder/start-work continuation is not yet driven as a Grok-native lifecycle workflow; the durable continuation CLI is not packaged, while Sisyphus Stop/SubagentStop hooks provide context only (host dependency class: Stop/SubagentStop hook)." },
  { id: "prompts-core", status: "Grok-adapted", evidence: "Phase 3 of the core/adapter port strategy: prompts-core source (types, loader, variant-resolver, prompt tables for atlas/prometheus/ultrawork/mode) is owned under src/core/omo/prompts-core; Grok glue in ports/grok-prompt-adapter.ts resolves the default variant for Grok models via the fallback chain (docs/grok-adapter-core-port-strategy.md)." },
  { id: "agent-builder", status: "Grok-adapted", evidence: "Phase 4 of the core/adapter port strategy: agent-builder foundation + dynamic-agent prompt builders + curated builtin agent registry are owned under src/core/omo/agent-builder; Grok glue in ports/grok-agent-builder-adapter.ts assembles Grok agent roles (5/9 agents fully ported; oracle/metis/sisyphus/hephaestus deferred as host-bound). See docs/grok-adapter-core-port-strategy.md." },
  { id: "delegate-core", status: "Grok-adapted", evidence: "Phase 5 of the core/adapter port strategy: delegate-core source (model-selection, retry-patterns, retry-guidance) is owned under src/core/omo/delegate-core; Grok glue in ports/grok-delegate-adapter.ts maps delegate-task model selection to Grok subagent routing (docs/grok-adapter-core-port-strategy.md)." },
  { id: "boulder-state", status: "Grok-adapted", evidence: "Phase 5 of the core/adapter port strategy: boulder-state source (plan-checklist, types, storage) is owned under src/core/omo/boulder-state; Grok glue in ports/grok-delegate-adapter.ts bridges plan-checklist to the .omo/plans convention (docs/grok-adapter-core-port-strategy.md)." },
  { id: "skills-loader-core", status: "Grok-adapted", evidence: "Phase 6 of the core/adapter port strategy: skills-loader-core host-neutral primitives (config, shared, builtin-skills loader) are owned under src/core/omo/skills-loader-core; Grok glue in ports/grok-skills-loader-adapter.ts discovers skills from Grok skill roots (OpenCode-bound discovery layers deferred). See docs/grok-adapter-core-port-strategy.md." },
  { id: "teammode", status: "Deferred", evidence: "Upstream 4.13.0 teammode skill payload installed + Grok MVP ledger in src/core/lfg/team-ledger.ts (createTeam/addMemberSlot/recordSpawnMetadata/appendMessage/list/getStatus/requestShutdown; durable .omo/teams JSON with spawn_subagent mapping, test coverage). Skill updated with GrokBuild section. Remains Deferred (no codex_app claim; MVP ledger shipped per checkbox 5; see team-ledger.test.ts, grok-native-team-orchestration.md, parity doc update)." },
  { id: "lazycodex-executor-verify", status: "Deferred", evidence: "Upstream 4.13.0 SubagentStop evidence verifier targets the Codex lazycodex-executor agent and requires Grok-specific agent naming/event adaptation before it can be enabled (host dependency class: Stop/SubagentStop hook). MVP: pure function src/grok/hooks/subagent-stop-evidence-verifier.ts (Grok agents coding/hephaestus/builder, .omo/evidence receipt check or additionalContext warning, fail-closed on malformed JSON) + unit tests. No full hook wiring yet per checkbox 7 spec; remains Deferred until end-to-end registration proven." },
  { id: "workflow-selector", status: "Deferred", evidence: "Upstream 4.13.0 workflow-selector is an opt-in Codex UserPromptSubmit hook that emits hookSpecificOutput.additionalContext. lfg does not enable it until a Grok-native prompt-routing hook surface is implemented and verified (host dependency class: missing host surface)." },
  { id: "test-support", status: "Unsupported", evidence: "Upstream test-support is package test infrastructure for component smoke tests, not a user-facing runtime component to install into the Grok plugin payload." },
  { id: "telemetry", status: "Unsupported", evidence: "lfg does not emit upstream anonymous telemetry." },
] as const

export type ComponentInventorySource =
  | "source_tree"
  | "source_override"
  | "omo_native_bundle"
  | "lazycodex_bundle"
  | "fixture_fallback"
  | "repair_adapter"

export type ComponentInventoryOptions = {
  readonly pluginRoot: string
  readonly packageVersion: string
  readonly source: ComponentInventorySource
}

export function componentInventoryPath(pluginRoot: string): string {
  return join(pluginRoot, COMPONENT_INVENTORY_FILE)
}

export async function writeComponentInventory(options: ComponentInventoryOptions): Promise<string> {
  const path = componentInventoryPath(options.pluginRoot)
  const inventory = {
    inventoryVersion: 1,
    packageName: "@islee23520/lfg",
    packageVersion: options.packageVersion,
    platform: "grok",
    source: options.source,
    upstreamName: UPSTREAM_OMO_NAME,
    upstreamVersion: UPSTREAM_OMO_VERSION,
    upstreamTag: UPSTREAM_OMO_TAG,
    upstreamReleaseUrl: UPSTREAM_OMO_RELEASE_URL,
    components: COMPONENTS,
  }
  await writeFile(path, `${JSON.stringify(inventory, null, 2)}\n`, "utf8")
  return path
}
