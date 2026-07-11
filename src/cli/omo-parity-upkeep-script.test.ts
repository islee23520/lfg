import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"

const execFileAsync = promisify(execFile)
const ROOT = new URL("../..", import.meta.url).pathname

describe("scripts/omo-parity-upkeep.mjs", () => {
  test("passes when no upstream source is configured and local generated parity is internally consistent", async () => {
    const { stdout } = await execFileAsync("node", [join(ROOT, "scripts", "omo-parity-upkeep.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
    })

    expect(stdout).toContain("omo-parity-upkeep: ok local generated parity state")
  })

  test("fails on unclassified upstream skills, components, and hook components", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-parity-upkeep-"))
    const source = join(home, "lazycodex-ai")
    await writeMinimalKnownUpstreamSource(source)
    await writeSkill(source, "skills/new-upstream-skill", "new-upstream-skill")
    await mkdir(join(source, "packages", "omo-codex", "plugin", "components", "new-component"), { recursive: true })
    await mkdir(join(source, "packages", "omo-codex", "plugin", "hooks"), { recursive: true })
    await writeFile(
      join(source, "packages", "omo-codex", "plugin", "hooks", "post-tool-use-new-component.json"),
      JSON.stringify({ command: "node components/new-hook-component/dist/cli.js hook post-tool-use" }, null, 2),
      "utf8",
    )

    await expect(execFileAsync("node", [join(ROOT, "scripts", "omo-parity-upkeep.mjs"), "--source", source], {
      cwd: ROOT,
      encoding: "utf8",
    })).rejects.toMatchObject({
      code: 2,
      stderr: expect.stringContaining("unclassified-upstream-skill:new-upstream-skill"),
    })
  })

  test("reports clean parity for known upstream package-layout surfaces", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-parity-upkeep-known-"))
    const source = join(home, "lazycodex-ai")
    await writeMinimalKnownUpstreamSource(source)

    const { stdout } = await execFileAsync("node", [join(ROOT, "scripts", "omo-parity-upkeep.mjs"), "--source", source, "--json"], {
      cwd: ROOT,
      encoding: "utf8",
    })
    const report = JSON.parse(stdout)

    expect(report.ok).toBe(true)
    expect(report.upstream.skills).toBeGreaterThan(0)
    expect(report.local.managedSkills).toBe(25)
  })
})

async function writeMinimalKnownUpstreamSource(source: string): Promise<void> {
  await mkdir(source, { recursive: true })
  await writeFile(join(source, "package.json"), '{"name":"lazycodex-ai","version":"4.12.1"}\n', "utf8")

  for (const skillName of ["debugging", "frontend", "programming", "ultraresearch", "visual-qa"]) {
    await writeSkill(source, join("packages", "shared-skills", skillName), skillName)
  }
  for (const [componentName, skillName] of [["rules", "rules"], ["lsp", "lsp"], ["teammode", "teammode"], ["ultrawork", "ulw-plan"], ["ulw-loop", "ulw-loop"]]) {
    await writeSkill(source, join("packages", "omo-codex", "plugin", "components", componentName, "skills", skillName), skillName)
  }
  for (const componentName of ["comment-checker", "git-bash", "rules", "lsp", "codegraph", "ultrawork", "ulw-loop", "start-work-continuation", "teammode", "lazycodex-executor-verify", "bootstrap", "telemetry"]) {
    await mkdir(join(source, "packages", "omo-codex", "plugin", "components", componentName), { recursive: true })
  }
  await mkdir(join(source, "packages", "omo-codex", "plugin", "hooks"), { recursive: true })
  await writeFile(
    join(source, "packages", "omo-codex", "plugin", "hooks", "user-prompt-submit-rules.json"),
    JSON.stringify({ command: "node components/rules/dist/cli.js hook user-prompt-submit" }, null, 2),
    "utf8",
  )
}

async function writeSkill(source: string, relativePath: string, skillName: string): Promise<void> {
  const root = join(source, relativePath)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, "SKILL.md"), `---\nname: ${skillName}\n---\n\n${skillName}\n`, "utf8")
}
