import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { expect, test } from "vitest"
import { managedSourceMap, writeUpstreamSkillSource } from "./omo-skill-sync-test-helpers.js"

const execFileAsync = promisify(execFile)
const ROOT = new URL("../..", import.meta.url).pathname
const EXCLUSIVE_LANE_RULE = "Product implementation has exactly one worker lane"
const DIFFICULTY_TIER_ROW = "**GPT-only external handoff:**"
const DIFFICULTY_TIER_NOTE = "Difficulty still sizes the Codex work package"
const DIFFICULTY_QA_ROUTE = "send the QA execution body through `lfg --json handoff plan --role review --engine gpt`"
const EXTERNAL_ENGINE_ROW = "| Product implementation (LOW / MEDIUM / HIGH) |"
const LANE_NEUTRAL_STOP = "STOP. DISPATCH THE SELECTED WORKER LANE INSTEAD."
const TRANSPORT_FORCING_STOP = "STOP. SPAWN A WORKER INSTEAD."

test("regenerates ulw-loop worker lanes idempotently from clean upstream anchors", async () => {
  const home = await mkdtemp(join(tmpdir(), "lfg-sync-clean-source-"))
  const source = join(home, "omo")
  const target = join(home, "skills")

  try {
    await writeUpstreamSkillSource(source)
    const sourceStartWorkPath = join(source, managedSourceMap["start-work"], "SKILL.md")
    await writeFile(
      sourceStartWorkPath,
      `---\nname: start-work\n---\n\nABSOLUTE RULE: YOU ARE AN ORCHESTRATOR\nAbout to edit? **${TRANSPORT_FORCING_STOP}**\n`,
      "utf8",
    )
    const upstreamWorkflow = `## Delegation model (ATLAS-STYLE — YOU CONDUCT, WORKERS PLAY)
You read, search, plan, integrate, and QA. You DELEGATE every code edit, test write, bug fix, and QA execution to a right-sized \`multi_agent_v1.spawn_agent\` worker, then verify what comes back. Fan out independent tasks in PARALLEL in one response; serialize only on a NAMED dependency.

Size each worker to the task. Put the intended role, rigor level, and specialty inside the worker \`message\`.

| Task shape | Message instruction |
|---|---|
| Read-only codebase search | \`TASK: act as an explorer. ...\` |
| External library / docs research | \`TASK: act as a librarian. ...\` |
| Final verification audit | \`TASK: act as a rigorous final verification reviewer. ...\` |

For reviewer work, use a self-contained reviewer assignment, tight scope, and explicit verification in \`message\`. Never spawn a context-only child for review.

## Execution Loop
3. DELEGATE-IN-PARALLEL: dispatch every independent task in the wave at once via right-sized \`multi_agent_v1.spawn_agent\` workers (Delegation table). Serialize only on a NAMED dependency.
5. EXECUTE-AS-SCENARIO: for heavier flows dispatch a dedicated QA worker (\`worker\`, \`gpt-5.6-sol\`, \`xhigh\`) whose ONLY job is to drive the channel.
`
    const sourceWorkflowPath = join(source, managedSourceMap["ulw-loop"], "references", "full-workflow.md")
    await writeFile(sourceWorkflowPath, upstreamWorkflow, "utf8")
    const cleanSource = await readFile(sourceWorkflowPath, "utf8")
    expect(cleanSource).not.toContain(EXCLUSIVE_LANE_RULE)
    expect(cleanSource).not.toContain(DIFFICULTY_TIER_ROW)
    expect(cleanSource).not.toContain(DIFFICULTY_TIER_NOTE)
    expect(cleanSource).not.toContain(DIFFICULTY_QA_ROUTE)
    expect(cleanSource).not.toContain(EXTERNAL_ENGINE_ROW)

    await syncSkills(source, target)
    const generatedPath = join(target, "ulw-loop", "references", "full-workflow.md")
    const firstSync = await readFile(generatedPath, "utf8")

    expect(count(firstSync, EXCLUSIVE_LANE_RULE)).toBe(1)
    expect(count(firstSync, DIFFICULTY_TIER_ROW)).toBe(1)
    expect(count(firstSync, DIFFICULTY_TIER_NOTE)).toBe(1)
    expect(count(firstSync, DIFFICULTY_QA_ROUTE)).toBe(1)
    expect(count(firstSync, EXTERNAL_ENGINE_ROW)).toBe(1)
    expect(firstSync).toContain("Fan out independent tasks in PARALLEL")
    const generatedStartWork = await readFile(join(target, "start-work", "SKILL.md"), "utf8")
    expect(generatedStartWork).toContain(LANE_NEUTRAL_STOP)
    expect(generatedStartWork).not.toContain(TRANSPORT_FORCING_STOP)
    expect(generatedStartWork).toContain("lfg --json plan start-work")
    expect(generatedStartWork).toContain("Codex `$start-work`")
    expect(generatedStartWork).toContain("Prefer the Codex app-server")
    expect(generatedStartWork).toContain("codex-exec fallback only when the daemon is unavailable")
    expect(generatedStartWork).not.toContain("then launch the returned Codex argv")
    const startWorkAgent = await readFile(join(target, "start-work", "agents", "grok.yaml"), "utf8")
    expect(startWorkAgent).toContain("Never execute product work in-host")

    await syncSkills(source, target)
    const secondSync = await readFile(generatedPath, "utf8")
    expect(secondSync).toBe(firstSync)
    const secondStartWork = await readFile(join(target, "start-work", "SKILL.md"), "utf8")
    expect(secondStartWork).toBe(generatedStartWork)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

async function syncSkills(source: string, target: string): Promise<void> {
  await execFileAsync(
    "node",
    [join(ROOT, "scripts", "sync-omo-skills-to-grok.mjs"), "--source", source, "--target", target],
    { cwd: ROOT, encoding: "utf8" },
  )
}

function count(content: string, marker: string): number {
  return content.split(marker).length - 1
}
