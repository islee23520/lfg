#!/usr/bin/env node
// allow: SIZE_OK - this release-contract generator embeds the lfg maintenance skill templates it emits.
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
export const managedSkillSources = [
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
    await rewriteSkillMarkdown(skillRoot, adaptUlwLoopSkill)
    await rewriteOptionalFile(join(skillRoot, "references", "full-workflow.md"), adaptUlwLoopReference)
  } else if (skillName === "ulw-plan") {
    await rewriteOptionalFile(join(skillRoot, "references", "full-workflow.md"), adaptUlwPlanReference)
  } else if (skillName === "start-work") {
    await rewriteSkillMarkdown(skillRoot, adaptStartWorkSkill)
  } else if (skillName === "ultraresearch") {
    await rewriteSkillMarkdown(skillRoot, adaptUltraresearchSkill)
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

function adaptUlwLoopSkill(content) {
  return content.replace(
    "Read through **Bootstrap** (including its tier triage), **Execution Loop**, and the **Manual-QA channels** table before running any ULW command or recording evidence.",
    "Read through **Bootstrap** (including its tier triage), **GrokBuild `/goal` state**, **Execution Loop**, and the **Manual-QA channels** table before running any ULW command or recording evidence.",
  )
}

function adaptStartWorkSkill(content) {
  return content
    .replace(
      'description: "Execute a Prometheus work plan in Codex with Boulder state, evidence ledger updates, worktree discipline, parallel subagents, and Stop-hook continuation. Use after planning when the user says start work, execute plan, continue plan, resume plan, or asks to run a .omo/plans plan."',
      'description: "Execute a Prometheus work plan in GrokBuild with `/goal` state, Boulder state, evidence ledger updates, worktree discipline, parallel subagents, and explicit continuation. Use after planning when the user says start work, execute plan, continue plan, resume plan, or asks to run a .omo/plans plan."',
    )
    .replace(
      "Execute a Prometheus work plan until every top-level checkbox is complete. This skill pairs with the Codex `Stop` / `SubagentStop` continuation hook (`components/start-work-continuation`), which re-injects the next turn while `.omo/boulder.json` says this `codex:<session_id>` still has unchecked plan work.",
      "Execute a Prometheus work plan until every top-level checkbox is complete. Use GrokBuild's `/goal` command as the host goal-state surface for the aggregate objective. The upstream Codex `Stop` / `SubagentStop` continuation hook (`components/start-work-continuation`) is not a GrokBuild runtime contract, so do not depend on automatic hook reinjection; preserve state in `.omo/boulder.json` and continue explicitly from that durable state.",
    )
    .replace(
      "## Phase 1: Select the plan\n\n1. Read `.omo/boulder.json` if it exists.",
      "## Phase 1: Select the plan\n\n0. Inspect GrokBuild `/goal` state. If no active goal exists, create one with `/goal <aggregate objective>` once the objective is known. If a different active goal exists, stop and surface the conflict instead of overwriting it.\n1. Read `.omo/boulder.json` if it exists.",
    )
    .replace(
      "Write `.omo/boulder.json` before implementation starts. Prefix session ids with `codex:` so the continuation hook can identify its own session.",
      "Write `.omo/boulder.json` before implementation starts. Prefix session ids with `grok:` for GrokBuild-owned work; if resuming an older `codex:<session_id>` entry, preserve it as historical state but attach the current `grok:<session_id>` before continuing.",
    )
    .replaceAll('"session_ids": ["codex:<session_id>"]', '"session_ids": ["grok:<session_id>"]')
    .replace(
      "Print an `ORCHESTRATION COMPLETE` block with the plan path, verification commands, Global Review and Debugging Gate verdict, artifacts, and cleanup receipts.",
      "Print an `ORCHESTRATION COMPLETE` block with the plan path, verification commands, Global Review and Debugging Gate verdict, artifacts, cleanup receipts, and final `/goal` status. Clear `/goal` with `/goal clear` before starting an unrelated aggregate in the same session.",
    )
    .replace(
      "- No unprefixed session ids in Boulder state. Codex sessions are always `codex:<session_id>`.",
      "- No unprefixed session ids in Boulder state. GrokBuild sessions are `grok:<session_id>`; preserve older `codex:<session_id>` values only as historical/resume evidence.\n- Use `/goal` for the host aggregate goal. Do not rely on Codex-only goal APIs or Stop/SubagentStop continuation hooks in GrokBuild.",
    )
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
    .replace(
      "## Bootstrap",
      "## GrokBuild `/goal` state\n\nUse GrokBuild's `/goal` command as the host goal-state surface. Do not call Codex-only goal tools such as `get_goal`, `create_goal`, `update_goal`, or `update_plan`; they are not available in GrokBuild.\n\n- Before execution, run `/goal` (or inspect the active goal shown by the host) and confirm whether a goal is active.\n- If no active goal exists, create one with `/goal <aggregate objective from the ulw-loop handoff>`.\n- If the active goal is the same aggregate objective, continue the current ulw-loop story.\n- If a different goal is active, STOP: checkpoint the ulw-loop item as blocked and surface the conflict instead of overwriting it.\n- Track step-level progress with the host-visible plan/todo facility available in this session; in GrokBuild this is `todo_write`, not `update_plan`.\n- Only mark the final host goal complete after the final quality gate passes. In GrokBuild, report completion through the active `/goal` flow or the host-provided goal completion mechanism; never complete it mid-aggregate.\n- After completing an aggregate ulw-loop run, clear the host goal with `/goal clear` before starting another unrelated aggregate in the same session.\n\n## Bootstrap",
    )
    .replace(
      "### Acquire Next Goal\n1. Run `omo ulw-loop complete-goals --json` and read the handoff, including criteria.\n2. Call `get_goal` and inspect active Codex state.\n3. Apply this table exactly:\n\n| get_goal result | action |\n|-----------------|--------|\n| no active goal | Call `create_goal` with objective only from `instruction.json.objective`; do not copy lifecycle fields such as `status`. |\n| same aggregate objective active | Continue the current ulw-loop story. |\n| different goal active | STOP. Checkpoint blocked and surface the conflict. |\n4. If retrying failed work, run `omo ulw-loop complete-goals --retry-failed --json`.\n5. Never create a second Codex goal for the same aggregate objective.\n\n### Per-Criterion Cycle\n1. PLAN: read `criterion.scenario`, `criterion.expectedEvidence`, prior ledger entries, and safety bounds. Identify which tasks in the current wave are independent.\n2. Register atomic todos via `update_plan` — one ultra-granular step per action, `path: <action> for <criterion> - verify by <check>`. Call `update_plan` on every transition (start → `in_progress`, finish → `completed`); exactly one `in_progress`, mark completed immediately, never batch, never let the rendered plan lag behind reality.",
      "### Acquire Next Goal\n1. Run `omo ulw-loop complete-goals --json` and read the handoff, including criteria.\n2. Inspect the active GrokBuild `/goal` state.\n3. Apply this table exactly:\n\n| `/goal` result | action |\n|----------------|--------|\n| no active goal | Create one with `/goal <objective>` using only `instruction.json.objective`; do not copy lifecycle fields such as `status`. |\n| same aggregate objective active | Continue the current ulw-loop story. |\n| different goal active | STOP. Checkpoint blocked and surface the conflict. |\n4. If retrying failed work, run `omo ulw-loop complete-goals --retry-failed --json`.\n5. Never create a second host goal for the same aggregate objective.\n\n### Per-Criterion Cycle\n1. PLAN: read `criterion.scenario`, `criterion.expectedEvidence`, prior ledger entries, and safety bounds. Identify which tasks in the current wave are independent.\n2. Register atomic todos via the host-visible plan/todo facility — in GrokBuild, use `todo_write`. Track one ultra-granular step per action, `path: <action> for <criterion> - verify by <check>`. Update status on every transition (start → `in_progress`, finish → `completed`); exactly one `in_progress`, mark completed immediately, never batch, never let the rendered plan lag behind reality.",
    )
    .replace(
      "### Goal Completion\n1. Non-final aggregate goal: confirm every `essential` criterion is `pass`; non-essential criteria may remain pending. Final aggregate goal: confirm every criterion across the whole plan is `pass`.\n2. Call `get_goal` for a fresh snapshot.\n3. Run `omo ulw-loop checkpoint --goal-id <id> --status complete --evidence \"<criteria evidence summary>\" --codex-goal-json <snapshot> --json`.",
      "### Goal Completion\n1. Non-final aggregate goal: confirm every `essential` criterion is `pass`; non-essential criteria may remain pending. Final aggregate goal: confirm every criterion across the whole plan is `pass`.\n2. Inspect the active GrokBuild `/goal` state for a fresh snapshot or note that no machine-readable snapshot is available.\n3. Run `omo ulw-loop checkpoint --goal-id <id> --status complete --evidence \"<criteria evidence summary>\" --codex-goal-json <snapshot-or-host-goal-summary-json> --json`.",
    )
    .replace(
      "## Constraints\n1. NEVER call `update_goal` mid-aggregate; only on final story after the quality gate passes.\n2. NEVER call `create_goal` when `get_goal` shows a different active goal.",
      "## Constraints\n1. NEVER complete the host `/goal` mid-aggregate; only complete the final story after the quality gate passes.\n2. NEVER create a new `/goal` when the host already shows a different active goal.",
    )
    .replace("Per-story Codex goal mode", "Per-story host goal mode")
    .replace("clear the Codex goal manually", "clear the host goal manually")
    .replace(
      "The shell command emits a model-facing handoff; only the Codex agent calls `get_goal`, `create_goal`, or `update_goal` tools.",
      "The shell command emits a model-facing handoff; in GrokBuild, use `/goal` plus the host-visible todo/plan tool instead of Codex-only `get_goal`, `create_goal`, `update_goal`, or `update_plan` APIs.",
    )
    .replace("Codex `get_goal` reports a different active goal", "Host `/goal` reports a different active goal")
}

function adaptUlwPlanReference(content) {
  return content
    .replaceAll("an independent Codex CLI review", "an independent GrokBuild adapter review")
    .replaceAll("Codex CLI review", "GrokBuild adapter review")
    .replaceAll("`CODEX_HOME`", "`GROK_HOME`")
    .replaceAll("Codex-native", "GrokBuild-native")
}

function adaptUltraresearchSkill(content) {
  if (content.includes("xai-x-search") && content.includes("Hermes-agent research references")) return content

  return content
    .replace(
      "codebase, web, official docs, and OSS repos",
      "codebase, web, Grok native x_search, official docs, and OSS repos",
    )
    .replace(
      "- **Web (librarian), 3-6 workers.** At least 10 distinct websearch queries per worker, each with a different operator or angle (see Search craft); fetch the full page for every result that matters — snippets lie. Context7 with 3+ queries per known library. grep.app and `gh search code|repos|issues` for real-world usage. Official docs via sitemap discovery (`<base>/sitemap.xml`), then targeted pages.\n",
      "- **Web (librarian), 3-6 workers.** At least 10 distinct websearch queries per worker, each with a different operator or angle (see Search craft); fetch the full page for every result that matters — snippets lie. Context7 with 3+ queries per known library. grep.app and `gh search code|repos|issues` for real-world usage. Official docs via sitemap discovery (`<base>/sitemap.xml`), then targeted pages.\n- **Grok native x_search / `xai-x-search`, 1-3 workers.** When the Grok host exposes `x_search` directly or via the installed `xai-x-search` skill, use it aggressively as a first-class real-time/social source lane, especially for breaking news, product launches, incidents, funding, sentiment, community reports, and claims where primary actors publish on X first. Run multiple query phrasings with handles, hashtags, exact product names, error strings, and date windows. Treat X posts as leads or primary-source statements only when the account identity is relevant and cited; corroborate factual claims through the Phase 3b claim ledger before asserting them.\n",
    )
    .replace(
      "English first: run every search in English by default",
      "Grok native x_search first when recency, primary-actor posts, or community signal matters: include an x_search lane in Phase 0, dedicate at least one first-wave worker to it when available, and promote useful posts into EXPAND leads for web/docs/repo corroboration. Prefer the installed `xai-x-search` skill for X/Twitter source lanes and `xai-web-search` for xAI server-side web search when those Grok-connected tools are available.\n\nHermes-agent research references worth emulating: prefer agent-native structured output, async launch/status/poll patterns for long-running research tools, cite only returned source URLs, and preserve an evidence chain from raw source to claim.\n\nEnglish first: run every search in English by default",
    )
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
