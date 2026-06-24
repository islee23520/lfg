#!/usr/bin/env node
// allow: SIZE_OK - this release-contract generator embeds the lfg maintenance skill templates it emits.
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const managedSkillSources = [
  ["ast-grep", "skills/ast-grep"],
  ["comment-checker", "components/comment-checker/skills/comment-checker"],
  ["debugging", "skills/debugging"],
  ["frontend", "skills/frontend"],
  ["git-master", "skills/git-master"],
  ["init-deep", "skills/init-deep"],
  ["lfg-contribute-bug-fix", "skills/lcx-contribute-bug-fix"],
  ["lfg-doctor", "skills/lcx-doctor"],
  ["lfg-report-bug", "skills/lcx-report-bug"],
  ["lsp", "components/lsp/skills/lsp"],
  ["lsp-setup", "skills/lsp-setup"],
  ["programming", "skills/programming"],
  ["refactor", "skills/refactor"],
  ["remove-ai-slops", "skills/remove-ai-slops"],
  ["review-work", "skills/review-work"],
  ["rules", "components/rules/skills/rules"],
  ["start-work", "skills/start-work"],
  ["teammode", "components/teammode/skills/teammode"],
  ["ultraresearch", "skills/ultraresearch"],
  ["ulw-loop", "components/ulw-loop/skills/ulw-loop"],
  ["ulw-plan", "components/ultrawork/skills/ulw-plan"],
  ["visual-qa", "skills/visual-qa"],
]
const managedSkills = managedSkillSources.map(([skillName]) => skillName)
const retiredSkillNames = ["lcx-contribute-bug-fix", "lcx-doctor", "lcx-report-bug"]
const defaultTargets = [join(repoRoot, "src", "grok", "skills"), join(repoRoot, "skills")]
const syncManifestName = ".lfg-omo-skill-sync.json"

export async function syncOmoSkillsToGrok(options = {}) {
  const sourceRoot = await resolveOmoPluginSource(options.source, { includeCache: options.includeCache !== false })
  const targets = options.targets ?? defaultTargets

  if (sourceRoot === null) {
    if (options.allowExistingFallback !== true) {
      throw new Error("OMO skill source not found. Set LFG_OMO_SKILLS_SOURCE_ROOT or pass --source.")
    }
    await assertExistingGeneratedTargets(targets)
    return { sourceRoot: null, targets, synced: false }
  }

  await assertSourceHasManagedSkills(sourceRoot)
  for (const target of targets) {
    await syncTarget(sourceRoot, target)
  }
  return { sourceRoot, targets, synced: true }
}

async function syncTarget(sourceRoot, targetRoot) {
  await mkdir(targetRoot, { recursive: true })
  for (const skillName of retiredSkillNames) {
    await rm(join(targetRoot, skillName), { recursive: true, force: true })
  }
  for (const [skillName, sourcePath] of managedSkillSources) {
    await rm(join(targetRoot, skillName), { recursive: true, force: true })
    await cp(await resolveManagedSourcePath(sourceRoot, sourcePath), join(targetRoot, skillName), { recursive: true })
    await adaptSkillPayload(skillName, join(targetRoot, skillName))
  }
  await writeFile(join(targetRoot, syncManifestName), `${JSON.stringify(await syncManifest(sourceRoot), null, 2)}\n`, "utf8")
}

async function syncManifest(sourceRoot) {
  return {
    generatedBy: "scripts/sync-omo-skills-to-grok.mjs",
    source: await describeSource(sourceRoot),
    conversion: "GrokBuild adapter payload: upstream OMO aggregate/component skill directories copied with relative references and scripts preserved.",
    managedSkills,
  }
}

async function describeSource(sourceRoot) {
  const packageJson = await readJsonSafe(join(sourceRoot, "package.json"))
  return {
    upstream: packageJson?.name ?? "oh-my-openagent/omo",
    version: packageJson?.version ?? null,
    sourceMap: Object.fromEntries(managedSkillSources.map(([skillName, sourcePath]) => [skillName, manifestSourcePath(skillName, sourcePath)])),
  }
}

function manifestSourcePath(skillName, sourcePath) {
  if (skillName === "lfg-doctor") return "converted:lfg-doctor"
  if (skillName === "lfg-report-bug") return "converted:lfg-report-bug"
  if (skillName === "lfg-contribute-bug-fix") return "converted:lfg-contribute-bug-fix"
  return sourcePath
}

async function adaptSkillPayload(skillName, skillRoot) {
  await adaptAgentMetadata(skillName, skillRoot)
  if (skillName === "lfg-doctor") {
    await rewriteSkillMarkdown(skillRoot, adaptLfgDoctorSkill)
  } else if (skillName === "lfg-report-bug") {
    await rewriteSkillMarkdown(skillRoot, adaptLfgReportBugSkill)
  } else if (skillName === "lfg-contribute-bug-fix") {
    await rewriteSkillMarkdown(skillRoot, adaptLfgContributeBugFixSkill)
    await rewriteOptionalFile(join(skillRoot, "scripts", "create-pr-body.mjs"), adaptLfgContributeBugFixScript)
  } else if (skillName === "ulw-loop") {
    await rewriteOptionalFile(join(skillRoot, "references", "full-workflow.md"), adaptUlwLoopReference)
  } else if (skillName === "ulw-plan") {
    await rewriteOptionalFile(join(skillRoot, "references", "full-workflow.md"), adaptUlwPlanReference)
  }
}

async function adaptAgentMetadata(skillName, skillRoot) {
  const agentsRoot = join(skillRoot, "agents")
  const openaiPath = join(agentsRoot, "openai.yaml")
  const grokPath = join(agentsRoot, "grok.yaml")
  const content = await readTextSafe(openaiPath)
  if (content === null) return
  await writeFile(grokPath, adaptAgentYaml(skillName, content), "utf8")
  await rm(openaiPath, { force: true })
}

function adaptAgentYaml(skillName, content) {
  if (skillName === "lfg-doctor") {
    return `interface:
  display_name: "lfg-doctor (lfg)"
  short_description: "Diagnose lfg GrokBuild adapter install health"
  search_terms:
    - "lfg-doctor"
    - "lfg doctor"
    - "lfg setup health"
    - "grok plugin lfg health"
  default_prompt: "Use $lfg-doctor to diagnose this lfg GrokBuild adapter installation, inspect the installed ~/.grok/plugins/lfg payload, hooks, skills, agents, MCP manifests, model config, and latest islee23520/lfg source, then report evidence-backed findings without mutating user config."
`
  }
  if (skillName === "lfg-report-bug") {
    return `interface:
  display_name: "lfg-report-bug (lfg)"
  short_description: "Route lfg or GrokBuild adapter bugs with source evidence"
  search_terms:
    - "lfg-report-bug"
    - "lfg bug"
    - "lfg issue"
    - "grok adapter bug"
    - "grok plugin lfg issue"
  default_prompt: "Use $lfg-report-bug to investigate this lfg or GrokBuild adapter bug, compare runtime evidence with latest islee23520/lfg source, search existing islee23520/lfg issues, and prepare a high-signal issue or comment with reproduction, root cause, fix guidance, and the lfg-generated footer."
`
  }
  if (skillName === "lfg-contribute-bug-fix") {
    return `interface:
  display_name: "lfg-contribute-bug-fix (lfg)"
  short_description: "Contribute verified lfg or GrokBuild adapter bug fixes"
  search_terms:
    - "lfg-contribute-bug-fix"
    - "lfg fix"
    - "lfg bug fix"
    - "grok adapter fix"
    - "grok plugin lfg fix"
  default_prompt: "Use $lfg-contribute-bug-fix to debug this lfg or GrokBuild adapter bug in islee23520/lfg, capture failing-before evidence, implement the smallest verified patch, run focused and setup-surface verification, and prepare the lfg-generated fix evidence for an issue, branch, or PR when requested."
`
  }

  return content
    .replaceAll(" (omo)", " (lfg)")
    .replaceAll("(OmO)", "(lfg)")
    .replaceAll("lcx-contribute-bug-fix", "lfg-contribute-bug-fix")
    .replaceAll("lcx-doctor", "lfg-doctor")
    .replaceAll("lcx-report-bug", "lfg-report-bug")
    .replaceAll("omo-codex bug fix", "lfg bug fix")
    .replaceAll("omo-codex bug", "lfg bug")
    .replaceAll("openai codex bug", "lfg bug")
    .replaceAll("codex upstream issue", "lfg upstream issue")
    .replaceAll("codex bug fix pr", "lfg bug fix")
    .replaceAll("LazyCodex or Codex", "lfg or GrokBuild adapter")
    .replaceAll("LazyCodex/Codex", "lfg/GrokBuild")
    .replaceAll("LazyCodex and Codex", "lfg and GrokBuild")
    .replaceAll("LazyCodex", "lfg")
    .replaceAll("lazycodex", "lfg")
    .replaceAll("Codex", "GrokBuild")
    .replaceAll("openai/codex", "islee23520/lfg")
    .replaceAll("code-yeongyu/lazycodex", "islee23520/lfg")
    .replaceAll("code-yeongyu/lfg", "islee23520/lfg")
    .replaceAll("lfg-generated", "lfg-generated")
}

async function rewriteSkillMarkdown(skillRoot, transform) {
  await rewriteOptionalFile(join(skillRoot, "SKILL.md"), transform)
}

async function rewriteOptionalFile(path, transform) {
  const content = await readTextSafe(path)
  if (content === null) return
  await writeFile(path, transform(content), "utf8")
}

function adaptLfgDoctorSkill(content) {
  return `---
name: lfg-doctor
description: "Diagnose lfg GrokBuild adapter installation health against the latest lfg source. Use when lfg setup, the installed ~/.grok/plugins/lfg payload, hooks, skills, agents, model config, or GrokBuild integration behaves oddly after install or update."
metadata:
  short-description: Diagnose lfg/GrokBuild adapter install health
---

# lfg-doctor

You are an lfg GrokBuild adapter install doctor. Diagnose only: gather evidence, compare the local lfg-owned GrokBuild payload against the latest lfg source, and report PASS/WARN/FAIL findings. Do not mutate user config or repositories unless the user explicitly asks for remediation afterward.

## Required Workflow

1. Materialize the latest lfg source under \`/tmp/lfg-source\`:

\`\`\`bash
if [ ! -d /tmp/lfg-source/.git ]; then
  gh repo clone islee23520/lfg /tmp/lfg-source -- --depth=1 || git clone --depth=1 https://github.com/islee23520/lfg /tmp/lfg-source
fi
DEFAULT_BRANCH="$(git -C /tmp/lfg-source remote show origin | sed -n '/HEAD branch/s/.*: //p')"
git -C /tmp/lfg-source fetch --depth=1 origin "$DEFAULT_BRANCH"
git -C /tmp/lfg-source checkout -B "$DEFAULT_BRANCH" FETCH_HEAD
\`\`\`

2. Inventory the installed GrokBuild surface:
   - lfg package version and bin path: \`node dist/lfg.js --json setup\` from a checkout, or \`lfg --json setup\` when installed globally.
   - lfg plugin payload: \`~/.grok/plugins/lfg/lfg-install.json\`, \`hooks/hooks.json\`, \`.mcp.json\`, \`skills/.lfg-omo-skill-sync.json\`, \`agents/\`, and \`prompts/\`.
   - lfg-owned Grok config sections in \`~/.grok/config.toml\`.
3. Probe the real setup surface with \`node dist/lfg.js --json setup --run\` or \`lfg --json setup --run\`, then inspect \`postInstallVerify\`.
4. Compare local payload shape and generated skill manifest against \`/tmp/lfg-source\`; cite exact files and command output.
5. Recommend \`$lfg-report-bug\` for a product defect or \`$lfg-contribute-bug-fix\` when the user wants a verified patch.

## Report Template

\`\`\`markdown
## lfg Doctor Report

### Summary
[healthy, degraded, or broken, with the single next action]

### Environment
- lfg installed/latest:
- Grok plugin root: ~/.grok/plugins/lfg
- OS/install method:

### Checks
| Check | Verdict | Evidence |
| --- | --- | --- |
| setup plan | PASS/WARN/FAIL | [command output] |
| setup --run verifier | PASS/WARN/FAIL | [postInstallVerify fields] |
| skill payload sync | PASS/WARN/FAIL | [manifest/path evidence] |
| hooks and MCP payload | PASS/WARN/FAIL | [file/path evidence] |
| config.toml lfg-owned sections | PASS/WARN/FAIL | [file/path evidence] |

### Remediations
1. [exact command or edit]
\`\`\`

Do not report healthy without captured setup output and installed payload evidence.
`
}

function adaptLfgReportBugSkill(content) {
  return `---
name: lfg-report-bug
description: "Create a high-signal bug report for lfg or its GrokBuild adapter payload. Use when the user asks to report, file, open, or triage an lfg setup, skill sync, hook, MCP, agent, config, package, or GrokBuild integration bug."
metadata:
  short-description: Route lfg or GrokBuild adapter bugs with source evidence
---

# lfg-report-bug

You are an lfg GrokBuild adapter bug router and reporter. Produce one actionable GitHub issue for \`islee23520/lfg\`, backed by runtime evidence and source evidence. Do not file until the reproduction and likely owner are concrete enough for a maintainer to act.

## Required Workflow

1. Invoke the debugging skill for the investigation.
2. Reproduce through the real lfg surface, preferably \`node dist/lfg.js --json setup --run\` or the exact command the user reported.
3. Compare the failure with latest lfg source under \`/tmp/lfg-source\`.
4. Search for an existing issue:

\`\`\`bash
gh issue list --repo islee23520/lfg --search "<short symptom>" --state open
\`\`\`

5. If a matching issue exists, prepare a comment with the new evidence. Otherwise prepare a new issue.
6. Apply the \`lfg-generated\` label when available and end the body with the footer below.

## Issue Template

\`\`\`markdown
## Summary
[user-visible failure]

## Environment
- lfg version:
- GrokBuild/plugin root:
- OS:
- Install method:

## Reproduction
1. [exact command/action]
2. [observed trigger]

## Expected Behavior
[what should happen]

## Actual Behavior
[exact output/error]

## Evidence
[commands, logs, files, screenshots]

## Root Cause
[confirmed or strongly evidenced cause]

## Proposed Fix
[concrete implementation or operational fix]

## Verification Plan
- [RED reproduction]
- [GREEN verification]
- [real setup surface check]

---
This issue was generated by lfg.
Tag: lfg-generated
\`\`\`

Do not create vague issues, duplicates, or reports without runtime evidence.
`
}

function adaptLfgContributeBugFixSkill(content) {
  return `---
name: lfg-contribute-bug-fix
description: "Contribute a verified bug fix for lfg or its GrokBuild adapter payload. Use when the user asks to debug and fix an lfg setup, skill sync, hook, MCP, agent, config, package, or GrokBuild integration defect."
metadata:
  short-description: Contribute verified lfg/GrokBuild adapter bug fixes
---

# lfg-contribute-bug-fix

Use this skill to debug a concrete lfg defect, implement the smallest correct fix, and deliver a verified local patch. Work in the current lfg checkout when the user is already in that repo; otherwise use a fresh temporary clone of \`islee23520/lfg\`.

## Required Outcome

- failing-before evidence for the reported bug
- the smallest implementation that fixes it
- passing-after test output
- real setup-surface verification, usually \`node dist/lfg.js --json setup --run\`
- a clean patch or draft issue/PR body ending with \`Tag: lfg-generated\`

## Required Workflow

1. Reproduce the bug through the real lfg surface.
2. Add or update a focused regression test before production changes.
3. Implement the smallest fix in lfg-owned source.
4. Run the focused test, adjacent tests, and real setup verification.
5. If asked to publish upstream, prepare the branch/issue/PR for \`islee23520/lfg\` with the verification evidence.

## Delivery Footer

\`\`\`markdown
---
This fix was debugged, implemented, and verified with lfg.
Tag: lfg-generated
\`\`\`

Do not ship a fix without RED evidence, GREEN evidence, and a real setup-surface proof.
`
}

function adaptLfgContributeBugFixScript(content) {
  return content
    .replaceAll("createLazyCodexBugFixPrBody", "createLfgBugFixPrBody")
    .replaceAll("https://github.com/code-yeongyu/lazycodex", "https://github.com/islee23520/lfg")
    .replaceAll("LazyCodex", "lfg")
    .replaceAll("lazycodex-generated", "lfg-generated")
}

function adaptUlwLoopReference(content) {
  return content
    .replaceAll("CODEX_HOME=\"${CODEX_HOME:-$HOME/.codex}\"", "GROK_HOME=\"${GROK_HOME:-$HOME/.grok}\"")
    .replaceAll("\"$CODEX_HOME/bin/omo\" \"$CODEX_HOME\"/plugins/cache/sisyphuslabs/omo/*/components/ulw-loop/dist/cli.js", "\"$GROK_HOME/plugins/lfg/components/ulw-loop/dist/cli.js\" \"$GROK_HOME/plugins/lfg/hooks/lfg-native-ultrawork.js\"")
    .replaceAll("${CODEX_HOME:-$HOME/.codex}", "${GROK_HOME:-$HOME/.grok}")
    .replaceAll("Install with npx lazycodex-ai install or set CODEX_LOCAL_BIN_DIR to a PATH directory.", "Run lfg setup --run to refresh the lfg-owned GrokBuild plugin payload under ~/.grok/plugins/lfg.")
    .replaceAll("lazycodex-code-reviewer", "lfg-code-reviewer")
    .replaceAll("lazycodex-qa-executor", "lfg-qa-executor")
    .replaceAll("lazycodex-gate-reviewer", "lfg-gate-reviewer")
    .replaceAll("packages/omo-codex/plugin/components/ulw-loop", "grok-plugin-lfg/components/ulw-loop")
}

function adaptUlwPlanReference(content) {
  return content
    .replaceAll("an independent Codex CLI review", "an independent GrokBuild adapter review")
    .replaceAll("Codex CLI review", "GrokBuild adapter review")
    .replaceAll("`CODEX_HOME`", "`GROK_HOME`")
    .replaceAll("Codex-native", "GrokBuild-native")
}

async function resolveOmoPluginSource(explicitSource, options = {}) {
  const candidates = [
    explicitSource,
    process.env.LFG_OMO_SKILLS_SOURCE_ROOT,
    process.env.LFG_OMO_PLUGIN_ROOT,
    ...(options.includeCache === false ? [] : await cachedOmoPluginCandidates()),
  ].filter((candidate) => typeof candidate === "string" && candidate.length > 0)

  for (const candidate of candidates) {
    const resolved = await normalizePluginRoot(resolve(candidate))
    if (resolved !== null) return resolved
  }
  return null
}

async function cachedOmoPluginCandidates() {
  const cacheRoot = join(homedir(), ".codex", "plugins", "cache", "sisyphuslabs", "omo")
  try {
    const entries = await readdir(cacheRoot, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(cacheRoot, entry.name))
      .sort((a, b) => compareVersionPathDescending(a, b))
  } catch {
    return []
  }
}

function compareVersionPathDescending(a, b) {
  const aParts = a.split("/").at(-1)?.split(".").map((part) => Number.parseInt(part, 10)) ?? []
  const bParts = b.split("/").at(-1)?.split(".").map((part) => Number.parseInt(part, 10)) ?? []
  const length = Math.max(aParts.length, bParts.length)
  for (let index = 0; index < length; index++) {
    const diff = (bParts[index] ?? 0) - (aParts[index] ?? 0)
    if (diff !== 0) return diff
  }
  return b.localeCompare(a)
}

async function normalizePluginRoot(candidate) {
  const roots = []
  let current = candidate
  for (let index = 0; index < 5; index += 1) {
    roots.push(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  for (const root of roots) {
    if ((await resolveManagedSourcePath(root, "components/ultrawork/skills/ulw-plan")) !== null) return root
  }
  return null
}

async function assertSourceHasManagedSkills(sourceRoot) {
  for (const [skillName, sourcePath] of managedSkillSources) {
    if ((await resolveManagedSourcePath(sourceRoot, sourcePath)) === null) {
      throw new Error(`OMO skill source missing ${sourcePath}/SKILL.md for ${skillName} at ${sourceRoot}`)
    }
  }
}

async function assertExistingGeneratedTargets(targets) {
  for (const target of targets) {
    const manifest = await readJsonSafe(join(target, syncManifestName))
    if (manifest?.generatedBy !== "scripts/sync-omo-skills-to-grok.mjs") {
      throw new Error(`Generated OMO skill manifest missing at ${target}`)
    }
    for (const skillName of managedSkills) {
      if (!(await hasManagedSource(target, skillName, skillName))) {
        throw new Error(`Generated OMO skill ${skillName} missing at ${target}`)
      }
    }
  }
}

async function hasManagedSource(root, skillName, sourcePath) {
  try {
    await access(join(root, sourcePath, "SKILL.md"))
    return true
  } catch {
    return false
  }
}

async function resolveManagedSourcePath(sourceRoot, sourcePath) {
  const candidates = sourcePath.startsWith("components/")
    ? [
        join(sourceRoot, sourcePath),
        join(sourceRoot, "packages", "omo-codex", "plugin", sourcePath),
      ]
    : [
        join(sourceRoot, sourcePath),
        join(sourceRoot, "packages", "shared-skills", sourcePath),
        join(sourceRoot, "packages", "omo-codex", "plugin", sourcePath),
      ]
  for (const candidate of candidates) {
    try {
      await access(join(candidate, "SKILL.md"))
      return candidate
    } catch {
      // Try the next known OMO package layout.
    }
  }
  return null
}

async function readJsonSafe(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch {
    return null
  }
}

async function readTextSafe(path) {
  try {
    return await readFile(path, "utf8")
  } catch {
    return null
  }
}

function parseArgs(argv) {
  const targets = []
  let source
  let allowExistingFallback = false
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === "--source") {
      source = argv[++index]
    } else if (arg === "--target") {
      targets.push(resolve(argv[++index]))
    } else if (arg === "--allow-existing-fallback") {
      allowExistingFallback = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return {
    source,
    targets: targets.length > 0 ? targets : undefined,
    allowExistingFallback,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await syncOmoSkillsToGrok(parseArgs(process.argv.slice(2)))
  const mode = result.synced ? `synced from ${result.sourceRoot}` : "validated existing generated skills"
  process.stdout.write(`sync-omo-skills-to-grok: ${mode}\n`)
}
