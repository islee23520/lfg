import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))

describe("docs/grok-external-engine-orchestration.md", () => {
  test("documents the GPT-only app-server handoff contract", async () => {
    const text = await readFile(join(ROOT, "docs/grok-external-engine-orchestration.md"), "utf8")

    expect(text).toContain("GPT-only external implementation contract")
    expect(text).toContain("Sisyphus")
    expect(text).toContain("planOmoHandoff")
    expect(text).toContain("lfg --json handoff plan")
    expect(text).toContain("lfg --json plan start-work")
    expect(text).toContain("lfg --json plan ulw-plan")
    expect(text).toContain("$ulw-plan")
    expect(text).toContain('skillPath: "skills/ulw-plan/SKILL.md"')
    expect(text).toContain("lfg --json handoff plan")
    expect(text).toContain("--role coding --engine gpt")
    expect(text).toContain("$start-work")
    expect(text).toContain("Codex app-server")
    expect(text).toContain('transport.primary: "app-server"')
    expect(text).toContain('transport.fallback: "codex-exec"')
    expect(text).toContain("dryRun: true")
    expect(text).toContain("executed: true")
    expect(text).toContain("executed: false")
    expect(text).toContain("lfgIsPlugin: false")
    expect(text).toContain("stdinSource")
    expect(text).toContain("launch.argv[0]")
    expect(text).toContain("launch.argv.slice(1)")
    expect(text).toContain("launch.binary")
    expect(text).toContain("--no-probe")
    expect(text).toContain("PATH")
    expect(text).toContain("watcher/explorer/git-master")
    expect(text).toContain("eval MCP")
    expect(text).toContain("`gpt`")
    expect(text).toContain("Codex app-server")
    expect(text).toContain("codex-exec-fallback")
    expect(text).toContain("timeout: 0")
    expect(text).toContain("sole executor")
    expect(text).toContain("Legacy config/input aliases")
    expect(text).toContain("src/core/lfg/external-engine")
    expect(text).toContain("src/core/lfg/external-engine")
    expect(text).not.toContain("$(cat")
    expect(text).not.toMatch(/\bgjc\s+-/)
    expect(text).not.toContain("senpi -p")
    expect(text).not.toContain("Claude Code CLI")
    expect(text).not.toContain("Antigravity CLI")
    expect(text).not.toMatch(/auto(?:matic)?[- ]auth/i)
    expect(text).not.toMatch(/full OMO parity/i)
  })

  test("is discoverable from the README", async () => {
    const text = await readFile(join(ROOT, "README.md"), "utf8")

    expect(text).toContain("lfg --json handoff plan")
    expect(text).toContain("src/core/lfg/external-engine")
    expect(text).toContain("docs/grok-external-engine-orchestration.md")
  })
})
