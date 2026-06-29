#!/usr/bin/env node
import { access, readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { checkOmoParityUpkeep } from "./omo-parity-upkeep.mjs"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))
const expectedVersion = "4.13.0"
const expectedSkillSourceUpstream = "@sisyphuslabs/omo-codex-plugin"
const expectedGeneratedBy = "scripts/sync-omo-skills-to-grok.mjs"
const requiredManagedSkills = [
  "ast-grep",
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
const excludedSupplementalSkills = ["xai-grok", "xai-login-instructions", "xai-status"]
const generatedSkillRoots = [
  "src/grok/skills",
  "skills",
  "dist/grok-install/skills",
]
const retiredSkillNames = ["lcx-contribute-bug-fix", "lcx-doctor", "lcx-report-bug"]
const deferredComponents = ["teammode", "lazycodex-executor-verify", "workflow-selector"]
const unsupportedComponents = ["test-support"]
const staleAgentMetadataNeedles = [
  "code-yeongyu/lfg",
  "omo-codex bug",
  "openai codex bug",
  "codex upstream issue",
  "codex bug fix pr",
]

const failures = []

for (const root of generatedSkillRoots) {
  await assertSkillRoot(root)
}
await assertTextContains("src/grok/payload/component-inventory.ts", [
  `UPSTREAM_OMO_VERSION = "${expectedVersion}"`,
  `UPSTREAM_OMO_TAG = "v${expectedVersion}"`,
  ...deferredComponents.map((component) => `{ id: "${component}", status: "Deferred"`),
  ...unsupportedComponents.map((component) => `{ id: "${component}", status: "Unsupported"`),
])
await assertTextContains("docs/grok-adapter-parity.md", [
  "`lazycodex-ai` / OMO `v4.13.0`",
  "Scoped Grok-first OMO parity",
  "nativeAgentsStatus: \"missing\"",
  "Full native OMO agent behavioral parity is not claimed",
  "`teammode`",
  "`lazycodex-executor-verify`",
  "`workflow-selector`",
  "`test-support`",
  "split hook JSON files under `packages/omo-codex/plugin/hooks/`",
  "package-level MCP runtimes",
])
await assertTextContains("AGENTS.md", [
  "upstream baseline `lazycodex-ai`/OMO `v4.13.0`",
  "`teammode` | Skill payload installed; Codex thread orchestration hook not Grok-adapted | Deferred",
  "`lazycodex-executor-verify` | Codex `lazycodex-executor` SubagentStop verifier not Grok-adapted | Deferred",
  "`workflow-selector` | Codex-only opt-in UserPromptSubmit workflow selector; no verified Grok-native prompt-routing hook yet | Deferred",
  "`test-support` | Upstream package test infrastructure, not a Grok plugin runtime component | Unsupported",
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
  ])
  await assertTextContains(join(root, "start-work", "SKILL.md"), [
    "Execute a Prometheus work plan in GrokBuild with `/goal` state",
    "Inspect GrokBuild `/goal` state",
    "GrokBuild sessions are `grok:<session_id>`",
  ])
}

async function assertParityUpkeep() {
  const report = await checkOmoParityUpkeep()
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
