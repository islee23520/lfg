#!/usr/bin/env node
import { access, readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { checkOmoParityUpkeep } from "./omo-parity-upkeep.mjs"

const repoRootOverride = process.env.LFG_OMO_PARITY_REPO_ROOT
const repoRoot = repoRootOverride ? resolve(repoRootOverride) : fileURLToPath(new URL("..", import.meta.url))
const expectedVersion = "4.16.3"
const expectedSkillSourceUpstream = "@sisyphuslabs/omo-codex-plugin"
const expectedGeneratedBy = "scripts/sync-omo-skills-to-grok.mjs"
const requiredManagedSkills = [
  "ast-grep",
  "coding-agent-sessions",
  "comment-checker",
  "debugging",
  "frontend",
  "git-master",
  "init-deep",
  "lfg-contribute-bug-fix",
  "lfg-doctor",
  "lfg-report-bug",
  "lsp",
  "lsp-setup",
  "programming",
  "refactor",
  "remove-ai-slops",
  "review-work",
  "rules",
  "start-work",
  "teammode",
  "ultimate-browsing",
  "ultraresearch",
  "ulw-loop",
  "ulw-plan",
  "ulw-research",
  "visual-qa",
]
const requiredSupplementalSkills = [
  "xai-generate-text",
  "xai-image-generate",
  "xai-tts",
  "xai-video-generate",
  "xai-web-search",
  "xai-x-search",
]
/** lfg-owned skills (not OMO managed list) that must ship in all three skill roots. */
const requiredLfgNativeSkills = [
  "claude-code-inventory",
  "ulw-external-engine",
]
const excludedSupplementalSkills = ["xai-grok", "xai-login-instructions", "xai-status"]
const generatedSkillRoots = [
  "src/grok/skills",
  "skills",
  "dist/grok-install/skills",
]
const retiredSkillNames = ["lcx-contribute-bug-fix", "lcx-doctor", "lcx-report-bug"]
const deferredComponents = ["lazycodex-executor-verify", "workflow-selector"]
const grokAdaptedComponents = ["teammode", "difficulty-tier-workers"]
const unsupportedComponents = ["test-support"]
const staleAgentMetadataNeedles = [
  "code-yeongyu/lfg",
  "omo-codex bug",
  "openai codex bug",
  "codex upstream issue",
  "codex bug fix pr",
]
const duplicatedLaunchBinaryWording = "Execute `handoff.launch.binary` with `handoff.launch.argv`"
const exclusiveWorkerLaneRule =
  "Product implementation has exactly one worker lane: external Codex app-server handoff through `lfg --json handoff plan --engine gpt`. Grok may use watcher/explorer/git-master for host monitoring and read-only discovery, but must not spawn an in-host implementer for the product body."
const conflictingUnconditionalSpawnedSubagentMandates = [
  /every implementation, test, and QA unit must be a spawned subagent/i,
  /EVERY unit of implementation, test, QA, and review work MUST be delegated to a spawned subagent/,
  /You DELEGATE every code edit, test write, bug fix, and QA execution to a right-sized `multi_agent_v1\.spawn_agent` worker/,
  /DELEGATE all code edits, test writes, fixes, and QA execution to right-sized `multi_agent_v1\.spawn_agent` workers/,
  /Root NEVER edits product files, writes tests, or runs QA itself — a spawned worker does\./,
  /DELEGATE-IN-PARALLEL:[^\n]*dispatch every independent task[^\n]*(?:spawn_agent|spawn_subagent|spawned (?:subagent|worker))/i,
  /dispatch (?:all|every) independent (?:(?:sub-)?tasks?|job[- ]bod(?:y|ies))[^\n]*(?:spawn_agent|spawn_subagent|spawned (?:subagent|worker))/i,
  /\b(?:stop[.!]?\s*|(?:must|always)\s+)spawn (?:a |the )?(?:worker|subagent)s?(?:\s+instead)?[.!]/i,
]

const failures = []

for (const root of generatedSkillRoots) {
  await assertSkillRoot(root)
}
await assertTextContains("src/grok/payload/component-inventory.ts", [
  `UPSTREAM_OMO_VERSION = "${expectedVersion}"`,
  `UPSTREAM_OMO_TAG = "v${expectedVersion}"`,
  ...deferredComponents.map((component) => `{ id: "${component}", status: "Deferred"`),
  ...grokAdaptedComponents.map((component) => `{ id: "${component}", status: "Grok-adapted"`),
  ...unsupportedComponents.map((component) => `{ id: "${component}", status: "Unsupported"`),
])
await assertTextContains("docs/grok-adapter-parity.md", [
  "`lazycodex-ai` / OMO `v4.16.3`",
  "Scoped Grok-first OMO parity",
  "nativeAgentsStatus: \"verified\"",
  "postInstallVerify.nativeAgents.status: \"verified\"",
  "Full native OMO agent **behavioral** parity is not claimed",
  "`teammode`",
  "`lazycodex-executor-verify`",
  "`workflow-selector`",
  "`difficulty-tier-workers`",
  "`test-support`",
  "split hook JSON files under `packages/omo-codex/plugin/hooks/`",
  "package-level MCP runtimes",
  "hooks/lfg-native-rules.mjs session-start",
  "hooks/lfg-native-rules.mjs user-prompt-submit",
  "hooks/lfg-native-rules.mjs post-tool-use",
  "hooks/lfg-native-rules.mjs post-compact",
])
await assertTextContains("AGENTS.md", [
  "upstream baseline `lazycodex-ai`/OMO `v4.16.3`",
  "`teammode` | GrokBuild spawn_subagent transport + host built-ins and lfg OMO agents; Codex multi_agent_v2/codex_app still available on Codex | Grok-adapted",
  "`lazycodex-executor-verify` | T3: pure `verifySubagentStopEvidence` in Sisyphus SubagentStop; no dedicated host-enforced CLI (host dependency class: Stop/SubagentStop hook) | Deferred",
  "`workflow-selector` | Upstream removed from omo-codex components (#5745); lfg optional native opt-in retained, Deferred pending GrokBuild host receipt | Deferred",
  "`difficulty-tier-workers` | LOW/MEDIUM/HIGH sizing for external `lfg handoff plan --engine gpt`; legacy worker identities retained but disabled for Grok implementation | Grok-adapted",
  "`test-support` | Upstream package test infrastructure, not a Grok plugin runtime component | Unsupported",
  "host dependency class",
  "grok-orchestration-plane.md",
  "lfg-native-rules.mjs (or lfg-native-ultrawork.mjs)",
])
await assertTextContains("scripts/build.mjs", ["syncOmoSkillsToGrok({ allowExistingFallback: true, includeCache: false })"])
await assertParityUpkeep()

if (failures.length > 0) {
  process.stderr.write(`assert-omo-parity: ${failures.length} failure(s)\n`)
  for (const failure of failures) {
    process.stderr.write(`- ${failure}\n`)
  }
  process.exit(2)
}

process.stdout.write(`assert-omo-parity: ok upstream ${expectedVersion}, skills=${requiredManagedSkills.length}, roots=${generatedSkillRoots.length}\n`)

async function assertSkillRoot(root) {
  const manifestPath = join(repoRoot, root, ".lfg-omo-skill-sync.json")
  const manifest = await readJson(manifestPath)
  if (manifest === null) return

  assertEqual(`${manifestPath}: generatedBy`, manifest.generatedBy, expectedGeneratedBy)
  assertEqual(`${manifestPath}: source.upstream`, field(manifest, "source")?.upstream, expectedSkillSourceUpstream)
  assertEqual(`${manifestPath}: source.version`, field(manifest, "source")?.version, expectedVersion)
  assertArrayEqual(`${manifestPath}: managedSkills`, manifest.managedSkills, requiredManagedSkills)

  const sourceMap = field(field(manifest, "source"), "sourceMap")
  assertEqual(`${manifestPath}: sourceMap.lfg-doctor`, sourceMap?.["lfg-doctor"], "converted:lfg-doctor")
  assertEqual(`${manifestPath}: sourceMap.lfg-report-bug`, sourceMap?.["lfg-report-bug"], "converted:lfg-report-bug")
  assertEqual(`${manifestPath}: sourceMap.lfg-contribute-bug-fix`, sourceMap?.["lfg-contribute-bug-fix"], "converted:lfg-contribute-bug-fix")
  assertEqual(`${manifestPath}: sourceMap.teammode`, sourceMap?.teammode, "components/teammode/skills/teammode")

  for (const skillName of requiredManagedSkills) {
    await assertExists(join(root, skillName, "SKILL.md"))
  }
  for (const skillName of requiredSupplementalSkills) {
    await assertExists(join(root, skillName, "SKILL.md"))
    await assertTextContains(join(root, skillName, "SKILL.md"), ["Preferred Grok Tool Flow", "search_tool"])
    await assertTextExcludes(join(root, skillName, "SKILL.md"), ["codex-xai-oauth", "~/.config/codex-xai-oauth"])
  }
  for (const skillName of requiredLfgNativeSkills) {
    await assertExists(join(root, skillName, "SKILL.md"))
    await assertExists(join(root, skillName, "agents", "grok.yaml"))
    if (skillName === "claude-code-inventory") {
      await assertTextContains(join(root, skillName, "SKILL.md"), ["lfg claude", "Claude Code"])
    } else if (skillName === "ulw-external-engine") {
      await assertTextContains(join(root, skillName, "SKILL.md"), [
        "lfg --json handoff plan",
        "OMO-like",
        "Sisyphus",
        "timeout: 0",
        "claude",
        "gpt",
        "agy",
        "codex",
        "oracle",
        "vision",
        "hephaestus",
        "fullyTransferable",
        "grokIsOrchestrator",
        "launch.stdinSource",
        "no parallel Grok hephaestus for the same body",
        "lfg-gjc-intent-gateway",
        "gjc is an optional fail-open intent gateway",
      ])
      await assertTextExcludes(join(root, skillName, "SKILL.md"), ["$(cat", "gjc launch", "engine: gjc", "senpi -p"])
    }
  }
  for (const skillName of excludedSupplementalSkills) {
    await assertMissing(join(root, skillName, "SKILL.md"))
  }
  for (const skillName of retiredSkillNames) {
    await assertMissing(join(root, skillName, "SKILL.md"))
  }
  for (const openaiAgent of await findFiles(root, "openai.yaml")) {
    failures.push(`${openaiAgent}: OpenAI agent metadata must be converted to agents/grok.yaml`)
  }
  for (const grokAgent of await findFiles(root, "grok.yaml")) {
    await assertTextExcludes(grokAgent, staleAgentMetadataNeedles)
    await assertNoResidualCodexSkillInvokes(grokAgent)
  }
  await assertExists(join(root, "teammode", "scripts", "team.mjs"))
  await assertExists(join(root, "ulw-plan", "scripts", "scaffold-plan.mjs"))
  await assertExists(join(root, "ulw-plan", "agents", "grok.yaml"))
  await assertMissing(join(root, "ulw-plan", "agents", "openai.yaml"))
  await assertExists(join(root, "git-master", "agents", "grok.yaml"))
  await assertMissing(join(root, "git-master", "agents", "openai.yaml"))
  await assertTextContains(join(root, "ulw-loop", "references", "full-workflow.md"), [
    "## GrokBuild `/goal` state",
    "Do not call Codex-only goal tools such as `get_goal`, `create_goal`, `update_goal`, or `update_plan`",
    "in GrokBuild this is `todo_write`, not `update_plan`",
    "Use `lfg ulw-loop` (or `lfg ulw`)",
  ])
  await assertTextExcludes(join(root, "ulw-loop", "references", "full-workflow.md"), [
    "components/ulw-loop/dist/cli.js",
    "lfg-native-ultrawork.js",
    "Run lfg setup --run to refresh the lfg-owned GrokBuild plugin payload",
  ])
  await assertTextContains(join(root, "start-work", "SKILL.md"), [
    "Execute a Prometheus work plan in GrokBuild with `/goal` state",
    "Inspect GrokBuild `/goal` state",
    "GrokBuild sessions are `grok:<session_id>`",
    "Product implementation handoff (GrokBuild)",
    "External Codex implementation lane (GPT only)",
    "ulw-external-engine",
    "lfg --json handoff plan",
    "handoff.launch.argv[0]",
    "handoff.launch.argv.slice(1)",
    "handoff.launch.binary` is identity/readiness metadata",
    "launch.stdinSource",
    "timeout: 0",
    "fullyTransferable",
    "grokIsOrchestrator",
    "gpt",
    "codex-exec-fallback",
    "do not** spawn Grok hephaestus/coding/lazycodex-worker for the product body",
    "lfg-gjc-intent-gateway",
    "gjc remains intent-only and fail-open",
    exclusiveWorkerLaneRule,
    "lfg --json plan start-work",
    "Codex `$start-work`",
    ".omo/external-engine/start-work-codex-skill-result.md",
    "Prefer the Codex app-server",
    "Use codex-exec fallback only when the daemon is unavailable",
    "only then execute `handoff.launch.argv`",
  ])
  await assertExists(join(root, "start-work", "agents", "grok.yaml"))
  await assertMissing(join(root, "start-work", "agents", "openai.yaml"))
  await assertTextContains(join(root, "start-work", "agents", "grok.yaml"), [
    "Never execute product work in-host",
    "lfg --json plan start-work",
    "$start-work",
  ])
  await assertTextExcludes(join(root, "start-work", "SKILL.md"), ["$(cat", "gjc launch", "engine: gjc", "senpi -p"])
  await assertNoDuplicatedLaunchBinaryWording(join(root, "start-work", "SKILL.md"))
  await assertNoConflictingUnconditionalSpawnedSubagentMandate(join(root, "start-work", "SKILL.md"))
  await assertTextContains(join(root, "ulw-loop", "references", "full-workflow.md"), [
    "GPT-only external handoff",
    "codex-exec-fallback",
    "ulw-external-engine",
    "lfg --json handoff plan",
    "handoff.launch.argv[0]",
    "handoff.launch.argv.slice(1)",
    "handoff.launch.binary` is identity/readiness metadata",
    "Codex app-server",
    "Never `spawn_subagent` hephaestus/coding/lazycodex-worker for the product body",
    exclusiveWorkerLaneRule,
  ])
  // Ban payload command substitution; ulw-loop's unrelated PATH bootstrap still uses POSIX $(command -v ...).
  await assertTextExcludes(join(root, "ulw-loop", "references", "full-workflow.md"), ["$(cat", "gjc launch", "engine: gjc", "senpi -p"])
  await assertNoDuplicatedLaunchBinaryWording(join(root, "ulw-loop", "references", "full-workflow.md"))
  await assertNoConflictingUnconditionalSpawnedSubagentMandate(join(root, "ulw-loop", "references", "full-workflow.md"))
  // Managed component skills must be GrokBuild-framed (not Codex-primary leftovers).
  await assertTextContains(join(root, "lsp", "SKILL.md"), ["GrokBuild LSP", "GrokBuild"])
  await assertTextExcludes(join(root, "lsp", "SKILL.md"), ["# Codex LSP"])
  await assertTextContains(join(root, "comment-checker", "SKILL.md"), ["GrokBuild Comment Checker", "GrokBuild"])
  await assertTextExcludes(join(root, "comment-checker", "SKILL.md"), ["# Codex Comment Checker"])
  await assertTextContains(join(root, "rules", "SKILL.md"), ["GrokBuild Rules", "lfg Grok plugin"])
  await assertTextExcludes(join(root, "rules", "SKILL.md"), ["# Codex Rules", "Codex Rules is automatic"])
}

async function assertParityUpkeep() {
  const report = await checkOmoParityUpkeep({ repoRoot })
  if (!report.ok) {
    for (const item of report.findings) {
      failures.push(`omo-parity-upkeep:${item.kind}:${item.id}: ${item.message}`)
    }
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function field(value, name) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value[name] : undefined
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertArrayEqual(label, actual, expected) {
  if (!Array.isArray(actual)) {
    failures.push(`${label}: expected array, got ${JSON.stringify(actual)}`)
    return
  }
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson) {
    failures.push(`${label}: expected ${expectedJson}, got ${actualJson}`)
  }
}

async function assertTextContains(path, needles) {
  const content = await readText(path)
  if (content === null) return
  for (const needle of needles) {
    if (!content.includes(needle)) {
      failures.push(`${path}: missing ${JSON.stringify(needle)}`)
    }
  }
}

async function assertTextExcludes(path, needles) {
  const content = await readText(path)
  if (content === null) return
  for (const needle of needles) {
    if (content.includes(needle)) {
      failures.push(`${path}: contains stale metadata ${JSON.stringify(needle)}`)
    }
  }
}

async function assertNoDuplicatedLaunchBinaryWording(path) {
  const content = await readText(path)
  if (content === null) return
  if (content.includes(duplicatedLaunchBinaryWording)) {
    failures.push(`${path}: contains duplicated launch-binary wording ${JSON.stringify(duplicatedLaunchBinaryWording)}`)
  }
}

async function assertNoConflictingUnconditionalSpawnedSubagentMandate(path) {
  const content = await readText(path)
  if (content === null) return
  if (conflictingUnconditionalSpawnedSubagentMandates.some((pattern) => pattern.test(content))) {
    failures.push(`${path}: contains conflicting unconditional spawned-subagent mandate`)
  }
}

/** GrokBuild activates skills as /name; residual $name in agents/grok.yaml is Codex-shaped. */
async function assertNoResidualCodexSkillInvokes(path) {
  const content = await readText(path)
  if (content === null) return
  const ban = new Set([...requiredManagedSkills, ...requiredSupplementalSkills, ...requiredLfgNativeSkills, "ulw", "cua-driver", "xai"])
  for (const match of content.matchAll(/(?<![A-Za-z0-9_/])\$([a-z][a-z0-9_-]*)/g)) {
    const name = match[1]
    if (path.endsWith("start-work/agents/grok.yaml") && name === "start-work" && content.includes("external Codex invokes $start-work")) {
      continue
    }
    if (ban.has(name)) {
      failures.push(`${path}: residual Codex skill invoke $${name} (use /${name} for GrokBuild)`)
    }
  }
}

async function readText(path) {
  try {
    return await readFile(join(repoRoot, path), "utf8")
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

async function findFiles(root, basename) {
  const found = []
  await visit(root)
  return found

  async function visit(relativeDir) {
    let entries
    try {
      entries = await readdir(join(repoRoot, relativeDir), { withFileTypes: true })
    } catch (error) {
      failures.push(`${relativeDir}: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    for (const entry of entries) {
      const relativePath = join(relativeDir, entry.name)
      if (entry.isDirectory()) {
        await visit(relativePath)
      } else if (entry.isFile() && entry.name === basename) {
        found.push(relativePath)
      }
    }
  }
}

async function assertExists(path) {
  if (!(await pathExists(path))) {
    failures.push(`${path}: missing`)
  }
}

async function assertMissing(path) {
  if (await pathExists(path)) {
    failures.push(`${path}: must not exist`)
  }
}

async function pathExists(path) {
  try {
    await access(join(repoRoot, path))
    return true
  } catch {
    return false
  }
}
