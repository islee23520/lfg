import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"

const execFileAsync = promisify(execFile)
const ROOT = new URL("../..", import.meta.url).pathname
const managedSourceMap = {
  "ast-grep": "skills/ast-grep",
  "comment-checker": "components/comment-checker/skills/comment-checker",
  debugging: "skills/debugging",
  frontend: "skills/frontend",
  "git-master": "skills/git-master",
  "init-deep": "skills/init-deep",
  "lfg-contribute-bug-fix": "skills/lcx-contribute-bug-fix",
  "lfg-doctor": "skills/lcx-doctor",
  "lfg-report-bug": "skills/lcx-report-bug",
  lsp: "components/lsp/skills/lsp",
  "lsp-setup": "skills/lsp-setup",
  programming: "skills/programming",
  refactor: "skills/refactor",
  "remove-ai-slops": "skills/remove-ai-slops",
  "review-work": "skills/review-work",
  rules: "components/rules/skills/rules",
  "start-work": "skills/start-work",
  teammode: "components/teammode/skills/teammode",
  "ultimate-browsing": "skills/ultimate-browsing",
  ultraresearch: "skills/ultraresearch",
  "ulw-loop": "components/ulw-loop/skills/ulw-loop",
  "ulw-plan": "components/ultrawork/skills/ulw-plan",
  "visual-qa": "skills/visual-qa",
} as const

describe("sync-omo-skills-to-grok", () => {
  test("copies managed upstream OMO skill directories into Grok package targets", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-sync-skills-"))
    const source = join(home, "omo")
    const targetA = join(home, "src-skills")
    const targetB = join(home, "package-skills")

    await writeUpstreamSkillSource(source)

    const { stdout } = await execFileAsync(
      "node",
      [join(ROOT, "scripts", "sync-omo-skills-to-grok.mjs"), "--source", source, "--target", targetA, "--target", targetB],
      { cwd: ROOT, encoding: "utf8" },
    )

    expect(stdout).toContain("sync-omo-skills-to-grok: synced from")
    for (const target of [targetA, targetB]) {
      await expect(readFile(join(target, "ulw-plan", "SKILL.md"), "utf8")).resolves.toContain("You are **Prometheus**")
      await expect(readFile(join(target, "ulw-plan", "scripts", "scaffold-plan.mjs"), "utf8")).resolves.toContain("scaffold-plan")
      await expect(readFile(join(target, "ulw-loop", "references", "full-workflow.md"), "utf8")).resolves.toContain("## Execution Loop")
      await expect(readFile(join(target, "ulw-loop", "references", "full-workflow.md"), "utf8")).resolves.toContain("GROK_HOME")
      await expect(readFile(join(target, "ulw-loop", "references", "full-workflow.md"), "utf8")).resolves.not.toContain("CODEX_HOME")
      await expect(readFile(join(target, "ulw-loop", "references", "full-workflow.md"), "utf8")).resolves.toContain("Use `lfg ulw-loop` (or `lfg ulw`)")
      await expect(readFile(join(target, "ulw-loop", "references", "full-workflow.md"), "utf8")).resolves.not.toContain("components/ulw-loop/dist/cli.js")
      await expect(readFile(join(target, "ulw-loop", "references", "full-workflow.md"), "utf8")).resolves.not.toContain("lfg-native-ultrawork.js")
      await expect(readFile(join(target, "start-work", "SKILL.md"), "utf8")).resolves.toContain("Boulder state")
      await expect(readFile(join(target, "teammode", "SKILL.md"), "utf8")).resolves.toContain("component teammode source")
      await expect(readFile(join(target, "ultimate-browsing", "SKILL.md"), "utf8")).resolves.toContain("aggregate ultimate-browsing source")
      await expect(readFile(join(target, "rules", "SKILL.md"), "utf8")).resolves.toContain("component rules source")
      await expect(readFile(join(target, "lsp", "SKILL.md"), "utf8")).resolves.toContain("component lsp source")
      await expect(readFile(join(target, "debugging", "SKILL.md"), "utf8")).resolves.toContain("aggregate debugging source")
      await expect(readFile(join(target, "review-work", "SKILL.md"), "utf8")).resolves.toContain("aggregate review-work source")
      await expect(readFile(join(target, "ultraresearch", "SKILL.md"), "utf8")).resolves.toContain("Grok native x_search")
      await expect(readFile(join(target, "git-master", "agents", "grok.yaml"), "utf8")).resolves.toContain("git-master (lfg)")
      await expect(readFile(join(target, "ulw-plan", "agents", "grok.yaml"), "utf8")).resolves.toContain("Use $ulw-plan")
      await expect(readFile(join(target, "ulw-plan", "agents", "openai.yaml"), "utf8")).rejects.toThrow()
      await expect(readFile(join(target, "lfg-doctor", "SKILL.md"), "utf8")).resolves.toContain("lfg-doctor")
      await expect(readFile(join(target, "lfg-doctor", "SKILL.md"), "utf8")).resolves.toContain("~/.grok/plugins/lfg")
      await expect(readFile(join(target, "lfg-report-bug", "SKILL.md"), "utf8")).resolves.toContain("Route lfg or GrokBuild adapter bugs")
      await expect(readFile(join(target, "lfg-contribute-bug-fix", "SKILL.md"), "utf8")).resolves.toContain("Tag: lfg-generated")
      await expect(readFile(join(target, "lcx-doctor", "SKILL.md"), "utf8")).rejects.toThrow()
      await expect(readFile(join(target, "ulw-plan", "references", "full-workflow.md"), "utf8")).resolves.toContain("GrokBuild adapter review")
      await expect(readFile(join(target, "ulw-plan", "references", "full-workflow.md"), "utf8")).resolves.not.toContain("Codex CLI review")
      const manifest = await readFile(join(target, ".lfg-omo-skill-sync.json"), "utf8")
      expect(manifest).toContain("GrokBuild adapter payload")
      expect(manifest).toContain("visual-qa")
      expect(manifest).toContain("ultimate-browsing")
      expect(manifest).toContain("teammode")
      expect(manifest).toContain("lfg-doctor")
      expect(manifest).not.toContain("lcx-doctor")
      expect(manifest).toContain('"version": "9.9.9"')
    }
  })

  test("accepts lazycodex-ai package layout with shared skills and omo-codex plugin components", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-sync-lazycodex-layout-"))
    const source = join(home, "lazycodex-ai")
    const target = join(home, "package-skills")

    await writeLazycodexPackageSkillSource(source)

    await execFileAsync(
      "node",
      [join(ROOT, "scripts", "sync-omo-skills-to-grok.mjs"), "--source", source, "--target", target],
      { cwd: ROOT, encoding: "utf8" },
    )

    const manifest = await readFile(join(target, ".lfg-omo-skill-sync.json"), "utf8")
    expect(manifest).toContain('"upstream": "lazycodex-ai"')
    expect(manifest).toContain('"version": "4.12.1"')
    expect(manifest).toContain('"teammode"')
    await expect(readFile(join(target, "teammode", "SKILL.md"), "utf8")).resolves.toContain("component teammode source")
    await expect(readFile(join(target, "programming", "SKILL.md"), "utf8")).resolves.toContain("shared programming source")
    await expect(readFile(join(target, "rules", "SKILL.md"), "utf8")).resolves.toContain("component rules source")
  })
})

async function writeUpstreamSkillSource(source: string): Promise<void> {
  await mkdir(source, { recursive: true })
  await writeFile(join(source, "package.json"), '{"name":"@sisyphuslabs/omo","version":"9.9.9"}\n', { encoding: "utf8" })
  for (const [skillName, sourcePath] of Object.entries(managedSourceMap)) {
    await writeSkillFile(source, sourcePath, skillName, `${sourcePath.startsWith("components/") ? "component" : "aggregate"} ${skillName} source\n`)
  }
  await writeSkillFile(
    source,
    managedSourceMap.ultraresearch,
    "ultraresearch",
    'description: "Maximum-saturation research orchestration: parallel explore+librarian swarms across codebase, web, official docs, and OSS repos;"\n\nRole protocols — embed the relevant one in each spawn message; every worker gets a unique angle:\n\n- **Web (librarian), 3-6 workers.** At least 10 distinct websearch queries per worker, each with a different operator or angle (see Search craft); fetch the full page for every result that matters — snippets lie. Context7 with 3+ queries per known library. grep.app and `gh search code|repos|issues` for real-world usage. Official docs via sitemap discovery (`<base>/sitemap.xml`), then targeted pages.\n\n## Search craft\n\nEnglish first: run every search in English by default\n',
  )
  await writeSkillFile(
    source,
    managedSourceMap["ulw-plan"],
    "ulw-plan",
    "You are **Prometheus**\nreferences/full-workflow.md\nscripts/scaffold-plan.mjs\n",
  )
  await writeSkillFile(
    source,
    managedSourceMap["ulw-loop"],
    "ulw-loop",
    "This skill is intentionally compact\nreferences/full-workflow.md\nManual-QA channels\n",
  )
  await writeSkillFile(
    source,
    managedSourceMap["start-work"],
    "start-work",
    "Codex Harness Tool Compatibility\nABSOLUTE RULE: YOU ARE AN ORCHESTRATOR\nBoulder state\n",
  )
  await writeSkillFile(
    source,
    managedSourceMap["lfg-doctor"],
    "lcx-doctor",
    "Diagnose LazyCodex and Codex CLI installation health\nCODEX_HOME\nlazycodex doctor --json\n",
  )
  await writeSkillFile(
    source,
    managedSourceMap["lfg-report-bug"],
    "lcx-report-bug",
    "Route LazyCodex or Codex bugs with source evidence\ncode-yeongyu/lazycodex\nlazycodex-generated\n",
  )
  await writeSkillFile(
    source,
    managedSourceMap["lfg-contribute-bug-fix"],
    "lcx-contribute-bug-fix",
    "Contribute verified LazyCodex or Codex bug fixes\nTag: lazycodex-generated\n",
  )
  await writeFile(join(source, managedSourceMap["ulw-plan"], "references", "full-workflow.md"), "## Phase 3 - Generate the plan\nCodex CLI review with `CODEX_HOME`\n", "utf8")
  await writeFile(join(source, managedSourceMap["ulw-plan"], "references", "intent-clear.md"), "clear\n", "utf8")
  await writeFile(join(source, managedSourceMap["ulw-plan"], "references", "intent-unclear.md"), "unclear\n", "utf8")
  await writeFile(join(source, managedSourceMap["ulw-plan"], "scripts", "scaffold-plan.mjs"), "console.log('scaffold-plan')\n", "utf8")
  await writeFile(join(source, managedSourceMap["ulw-loop"], "references", "full-workflow.md"), "## Execution Loop\nCODEX_HOME=\"${CODEX_HOME:-$HOME/.codex}\"\nInstall with npx lazycodex-ai install or set CODEX_LOCAL_BIN_DIR to a PATH directory.\n", "utf8")
  await writeFile(join(source, managedSourceMap["git-master"], "agents", "openai.yaml"), 'interface:\n  display_name: "git-master (omo)"\n  default_prompt: "Use $git-master"\n', "utf8")
  await writeFile(join(source, managedSourceMap["ulw-plan"], "agents", "openai.yaml"), 'interface:\n  display_name: "ulw-plan (omo)"\n  default_prompt: "Use $ulw-plan"\n', "utf8")
}

async function writeLazycodexPackageSkillSource(source: string): Promise<void> {
  await mkdir(source, { recursive: true })
  await writeFile(join(source, "package.json"), '{"name":"lazycodex-ai","version":"4.12.1"}\n', { encoding: "utf8" })
  for (const [skillName, sourcePath] of Object.entries(managedSourceMap)) {
    const packageSourcePath = sourcePath.startsWith("components/")
      ? join("packages", "omo-codex", "plugin", sourcePath)
      : join("packages", "shared-skills", sourcePath)
    await writeSkillFile(
      source,
      packageSourcePath,
      skillName,
      `${sourcePath.startsWith("components/") ? "component" : "shared"} ${skillName} source\n`,
    )
  }
}

async function writeSkillFile(source: string, sourcePath: string, skillName: string, body: string): Promise<void> {
  const dir = join(source, sourcePath)
  await mkdir(dir, { recursive: true })
  await mkdir(join(dir, "agents"), { recursive: true })
  await mkdir(join(dir, "references"), { recursive: true })
  await mkdir(join(dir, "scripts"), { recursive: true })
  await writeFile(join(dir, "SKILL.md"), `---\nname: ${skillName}\n---\n\n${body}`, "utf8")
}
