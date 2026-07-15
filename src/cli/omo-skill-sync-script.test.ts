import { execFile } from "node:child_process"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"
import {
  managedSourceMap,
  writeLazycodexPackageSkillSource,
  writeUpstreamSkillSource,
} from "./omo-skill-sync-test-helpers.js"

const execFileAsync = promisify(execFile)
const ROOT = new URL("../..", import.meta.url).pathname
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
      await expect(readFile(join(target, "ulw-plan", "SKILL.md"), "utf8")).resolves.toContain("lfg --json plan ulw-plan")
      await expect(readFile(join(target, "ulw-plan", "SKILL.md"), "utf8")).resolves.not.toContain('subagent_type: "plan"')
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
      await expect(readFile(join(target, "ulw-plan", "agents", "grok.yaml"), "utf8")).resolves.toContain("lfg --json plan ulw-plan")
      await expect(readFile(join(target, "ulw-plan", "agents", "grok.yaml"), "utf8")).resolves.toContain("high ambiguity")
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
      expect(manifest).toContain("coding-agent-sessions")
      expect(manifest).toContain("ulw-research")
      expect(manifest).toContain("lfg-doctor")
      expect(manifest).not.toContain("lcx-doctor")
      expect(manifest).toContain('"version": "9.9.9"')
      await expect(readFile(join(target, "coding-agent-sessions", "SKILL.md"), "utf8")).resolves.toContain(
        "aggregate coding-agent-sessions source",
      )
      await expect(readFile(join(target, "ulw-research", "SKILL.md"), "utf8")).resolves.toContain(
        "aggregate ulw-research source",
      )
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

describe("T-SKILL-SLASH-01 GrokBuild skill activation forms", () => {
  test("convertCodexSkillCommandsToGrokSlash rewrites managed $skill to /skill", async () => {
    const script = join(ROOT, "scripts", "sync-omo-skills-to-grok.mjs")
    const { stdout } = await execFileAsync(
      "node",
      [
        "--input-type=module",
        "-e",
        `import { convertCodexSkillCommandsToGrokSlash } from ${JSON.stringify(script)};
const cases = [
  ["Use $coding-agent-sessions now", "Use /coding-agent-sessions now"],
  ["Use $ulw-plan before code", "Use /ulw-plan before code"],
  ["pattern $MSG stays", "pattern $MSG stays"],
];
for (const [input, expected] of cases) {
  const got = convertCodexSkillCommandsToGrokSlash(input);
  if (got !== expected) {
    console.error(JSON.stringify({ input, expected, got }));
    process.exit(2);
  }
}
console.log("ok");`,
      ],
      { cwd: ROOT, encoding: "utf8" },
    )
    expect(stdout.trim()).toBe("ok")
  })

  test("synced grok.yaml default_prompt uses slash form not $skill", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-sync-slash-"))
    const source = join(home, "omo")
    const target = join(home, "skills-out")
    await writeUpstreamSkillSource(source)
    await writeFile(
      join(source, managedSourceMap["coding-agent-sessions"], "agents", "openai.yaml"),
      'interface:\n  display_name: "Coding Agent Sessions"\n  default_prompt: "Use $coding-agent-sessions to find sessions."\n',
      "utf8",
    )
    await execFileAsync(
      "node",
      [join(ROOT, "scripts", "sync-omo-skills-to-grok.mjs"), "--source", source, "--target", target],
      { cwd: ROOT, encoding: "utf8" },
    )
    const grokYaml = await readFile(join(target, "coding-agent-sessions", "agents", "grok.yaml"), "utf8")
    expect(grokYaml).toContain("/coding-agent-sessions")
    expect(grokYaml).not.toMatch(/(?<![A-Za-z0-9_/])\$coding-agent-sessions\b/)
  })
})
