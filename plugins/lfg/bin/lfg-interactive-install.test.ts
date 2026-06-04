import { describe, expect, test } from "vitest"
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runLfgText } from "./test-process"

describe("lfg interactive install conflict handling", () => {
  test("keeps existing Grok settings when overwrite is refused", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const agentPath = join(home, ".grok", "agents", "lazycodex.md")
    await mkdir(join(home, ".grok", "agents"), { recursive: true })
    await writeFile(agentPath, "existing agent\n")
    const fakeBin = await makeFakeNpx('echo fake lazycodex install: "$@"')

    const result = await runLfgText(["install"], "y\nn\nn\n", { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Existing Grok lazycodex/agent settings were found")
    expect(result.stdout).toContain("Overwrite existing Grok settings by running the installer?")
    expect(result.stdout).toContain("Kept existing Grok settings. Installer was not run.")
    expect(result.stdout).not.toContain("fake lazycodex install")
    expect(await readFile(agentPath, "utf8")).toBe("existing agent\n")
  })

  test("detects existing Grok agent directory even without a lazycodex file", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const agentPath = join(home, ".grok", "agents", "custom-agent.md")
    await mkdir(join(home, ".grok", "agents"), { recursive: true })
    await writeFile(agentPath, "custom agent\n")
    const fakeBin = await makeFakeNpx('echo fake lazycodex install: "$@"')

    const result = await runLfgText(["install"], "y\nn\nn\n", { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Existing Grok lazycodex/agent settings were found")
    expect(result.stdout).toContain("Global Grok agents")
    expect(result.stdout).toContain("Kept existing Grok settings. Installer was not run.")
    expect(result.stdout).not.toContain("fake lazycodex install")
    expect(await readFile(agentPath, "utf8")).toBe("custom agent\n")
  })

  test("restores existing Grok settings after overwrite", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const agentPath = join(home, ".grok", "agents", "lazycodex.md")
    await mkdir(join(home, ".grok", "agents"), { recursive: true })
    await writeFile(agentPath, "existing agent\n")
    const fakeBin = await makeFakeNpx(['echo fake lazycodex install: "$@"', 'rm -rf "$HOME/.grok/agents"', 'mkdir -p "$HOME/.grok/agents"', 'printf "%s\\n" "new agent" > "$HOME/.grok/agents/lazycodex.md"'].join("\n"))

    const result = await runLfgText(["install"], "y\ny\ny\nn\n", { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("fake lazycodex install")
    expect(result.stdout).toContain("Restore previous Grok settings from backup?")
    expect(result.stdout).toContain("Restored previous Grok settings.")
    expect(await readFile(agentPath, "utf8")).toBe("existing agent\n")
  })
})

async function makeFakeNpx(script: string): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "lfg-fake-npx."))
  await writeFile(join(bin, "npx"), `#!/usr/bin/env bash\nset -euo pipefail\n${script}\n`)
  await chmod(join(bin, "npx"), 0o755)
  return bin
}
