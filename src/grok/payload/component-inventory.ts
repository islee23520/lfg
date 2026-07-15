import { writeFile } from "node:fs/promises"
import { join } from "node:path"

export const COMPONENT_INVENTORY_FILE = "lfg-component-inventory.json" as const
export const UPSTREAM_OMO_NAME = "oh-my-openagent" as const
export const UPSTREAM_OMO_VERSION = "4.16.3" as const
export const UPSTREAM_OMO_TAG = "v4.16.3" as const
export const UPSTREAM_OMO_RELEASE_URL = "https://github.com/code-yeongyu/oh-my-openagent/releases/tag/v4.16.3" as const

export const COMPONENTS = [
  { id: "comment-checker", status: "Grok-adapted", evidence: "T2 behavior proof: installed native Grok PostToolUse hook lfg-native-comment-checker.mjs emits bounded feedback for noisy comments, stays silent on clean files, and fail-closes on malformed JSON." },
  { id: "git-bash", status: "Manifest-only", evidence: "git_bash MCP is disabled on macOS/Linux and Windows-unverified. lfg can copy the upstream git-bash-mcp runtime from a package-shaped source (baseline v4.16.3), but behavior-level Windows support remains unverified." },
  { id: "rules", status: "Grok-adapted", evidence: "Native-first lfg-native-rules.mjs hooks invoke the installed behavioral rules CLI; lfg-grok-hook-bridge.mjs is the internal transport and legacy/imported-hook fallback." },
  { id: "lsp", status: "Grok-adapted", evidence: "T5 behavior proof: bundled lfg-lsp MCP runtime exposes typescript_diagnostics, returns typed malformed-input errors, reports TS2322 on dirty fixtures, and returns empty diagnostics for clean fixtures. T8 residual WAIVE: MCP runtime Grok-adapted; automatic PostToolUse/PostCompact reinjection not claimed (see .omo/evidence/omo-parity-gap-fill-88-to-95/T8-lsp-residual.txt)." },
  { id: "ast_grep", status: "Grok-adapted", evidence: "T4 behavior proof: bundled ast_grep MCP runtime exposes ast_grep_search, returns structural matches, reports malformed_pattern and invalid_path typed errors, and has a deterministic fallback when sg is unavailable." },
  { id: "eval", status: "Grok-adapted", evidence: "omp/senpi code-mode analog: lfg-eval-mcp exposes eval + eval_reset with persistent js/py kernels (session-scoped state, one cell per call). MVP: no rb/jl, no tool.*/agent() bridges. Skill skills/eval documents discipline." },
  { id: "codegraph", status: "Grok-adapted", evidence: "External @colbymchenry/codegraph semantic-code-graph MCP binary wrapped via utils/codegraph provisioning + Grok-native .mcp.json command server; Phase 0 of the core/adapter port strategy (docs/grok-adapter-core-port-strategy.md)." },
  { id: "grep_app", status: "Remote URL manifest-only", evidence: "grep_app MCP is represented as the upstream remote URL server https://mcp.grep.app; lfg validates manifest shape and does not live-call it by default." },
  { id: "context7", status: "Remote URL manifest-only", evidence: "context7 MCP is represented as the upstream remote URL server https://mcp.context7.com/mcp; lfg validates manifest shape and does not live-call it by default." },
  { id: "ultrawork", status: "Grok-adapted", evidence: "Ultrawork OMO hook parity routed natively via component/runtime and Grok-native OMO agent surfaces (default/sisyphus/role agents); implements `omo hook <event>` shape for Grok without new top-level commands." },
  { id: "ulw-loop", status: "Grok-adapted", evidence: "Project .omo awareness plus upstream OMO ulw-loop skill directory; durable CLI packaged as lfg ulw-loop/ulw (src/core/omo/ulw-loop) with Grok session env keys." },
  { id: "ulw-plan", status: "Grok-adapted", evidence: "Upstream OMO ulw-plan skill directory installed via skills/ copy, including references/full-workflow.md, intent references, and scripts/scaffold-plan.mjs." },
  { id: "ultimate-browsing", status: "Implemented", evidence: "Upstream OMO ultimate-browsing skill payload is installed via skills/ copy, including SKILL.md, references, engine, scripts, attribution, and Grok-converted agent metadata. This is payload availability only; lfg does not claim a separate Grok-native stealth-browser runtime beyond the installed skill assets." },
  { id: "bootstrap", status: "Deferred", evidence: "Upstream bootstrap provisioning is a SessionStart component for Codex runtime dependencies; lfg does not run provisioning hooks during Grok setup (host dependency class: policy / no Codex bootstrap from Grok). T9 residual WAIVE (issue #102): policy hold — no Codex runtime-dep bootstrap from Grok; not Grok-adapted. See .omo/evidence/omo-parity-gap-fill-88-to-95/T9-residuals.txt." },
  { id: "auto-update", status: "Unsupported", evidence: "Upstream auto-update is a SessionStart script that can run `npx lazycodex-ai@latest install`; lfg keeps updates user-controlled and does not enable this hook." },
  { id: "start-work-continuation", status: "Deferred", evidence: "Boulder/start-work continuation is not yet driven as a Grok-native lifecycle workflow; getStopHookContinuationContext + Sisyphus Stop/SubagentStop ship ledgerPath guidance naming lfg ulw-loop with explicit no automatic reinjection honesty; the durable continuation CLI is not packaged as auto-reinjection (host dependency class: Stop/SubagentStop hook)." },
  { id: "prompts-core", status: "Grok-adapted", evidence: "Phase 3 of the core/adapter port strategy: prompts-core source (types, loader, variant-resolver, prompt tables for atlas/prometheus/ultrawork/mode) is owned under src/core/omo/prompts-core; Grok glue in ports/grok-prompt-adapter.ts resolves the default variant for Grok models via the fallback chain (docs/grok-adapter-core-port-strategy.md)." },
  { id: "agent-builder", status: "Grok-adapted", evidence: "Phase 4 of the core/adapter port strategy: agent-builder foundation + dynamic-agent prompt builders + curated builtin agent registry are owned under src/core/omo/agent-builder; Grok glue in ports/grok-agent-builder-adapter.ts assembles Grok agent roles (5/9 agents fully ported; oracle/metis/sisyphus/hephaestus deferred as host-bound). See docs/grok-adapter-core-port-strategy.md." },
  { id: "delegate-core", status: "Grok-adapted", evidence: "Phase 5 of the core/adapter port strategy: delegate-core source (model-selection, retry-patterns, retry-guidance) is owned under src/core/omo/delegate-core; Grok glue in ports/grok-delegate-adapter.ts maps delegate-task model selection to Grok subagent routing (docs/grok-adapter-core-port-strategy.md)." },
  { id: "boulder-state", status: "Grok-adapted", evidence: "Phase 5 of the core/adapter port strategy: boulder-state source (plan-checklist, types, storage) is owned under src/core/omo/boulder-state; Grok glue in ports/grok-delegate-adapter.ts bridges plan-checklist to the .omo/plans convention (docs/grok-adapter-core-port-strategy.md)." },
  { id: "skills-loader-core", status: "Grok-adapted", evidence: "Phase 6 of the core/adapter port strategy: skills-loader-core host-neutral primitives (config, shared, builtin-skills loader) are owned under src/core/omo/skills-loader-core; Grok glue in ports/grok-skills-loader-adapter.ts discovers skills from Grok skill roots (OpenCode-bound discovery layers deferred). See docs/grok-adapter-core-port-strategy.md." },
  { id: "teammode", status: "Grok-adapted", evidence: "GrokBuild transport spawn_subagent in skills/teammode (team.mjs init/add-member/bind-subagent; default --transport spawn_subagent). Member subagent_type catalog = host built-ins (general-purpose, explore, plan) + lfg OMO agents (hephaestus, explorer, coding, librarian, ...). Durable state .omo/teams + team-ledger.ts. Tests: teammode-spawn-subagent.test.ts, team-ledger.test.ts. Residual: no codex_app/MultiAgentV2 mailbox on Grok; peer coordination via leader + artifacts." },
  { id: "lazycodex-executor-verify", status: "Deferred", evidence: "Upstream SubagentStop evidence verifier + difficulty-tier worker evidence (v4.16.x) targets Codex lazycodex-executor/workers (host dependency class: Stop/SubagentStop hook). MVP pure verifySubagentStopEvidence wired into lfg-sisyphus-hooks.mjs for coding|hephaestus|builder; no dedicated host-enforced block-or-continue CLI — Deferred." },
  { id: "workflow-selector", status: "Deferred", evidence: "Upstream omo-codex removed workflow-selector from the plugin components tree (#5745; absent on v4.16.3). lfg retains optional native lfg-native-workflow-selector.mjs (opt-in LFG_AUTO_WORKFLOW; legacy OMO_CODEX_AUTO_WORKFLOW still accepted) with temp-home proof only — historical lfg asset, not current upstream codex component debt. No Grok-adapted claim without authenticated GrokBuild host receipt." },
  { id: "difficulty-tier-workers", status: "Grok-adapted", evidence: "Host-neutral resolveDifficultyTierRoute sizes LOW/MEDIUM/HIGH external Codex work packages and returns the GPT handoff contract. lazycodex-worker-low|medium|high remain legacy identity metadata only; Grok disables the lazycodex implementer toggle and installs no active coding route. Product implementation uses Codex app-server, with codex exec fallback only when the daemon is unavailable." },
  { id: "plan-mode-interception", status: "Deferred", evidence: "Grok native Plan Mode / enter_plan_mode interception is not implemented because no verified Grok hook/runtime surface exists (host dependency class: missing host surface). Current /ulw-plan behavior is hook-time additionalContext guidance only, not native Plan Mode routing. T9 residual WAIVE (issue #102): no fake plan-mode intercept; remains Deferred. See .omo/evidence/omo-parity-gap-fill-88-to-95/T9-residuals.txt." },
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
