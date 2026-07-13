import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg } from "../test/test-process"

describe("lfg setup --install-only", () => {
  test("updates plugin without writing agent override settings", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-grok-cli-install-only-"))
    const result = await runLfg(["--json", "setup", "--run", "--install-only"], { HOME: home, OPENAI_API_KEY: "sk-test" })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      status: "installed",
      internalStep: { installOnly: true },
      agentOverridesPath: null,
      lfgConfigPath: null,
      postInstallVerify: { ok: true, status: "verified" },
    })
    await expect(readFile(join(home, ".grok", "plugins", "lfg", "lfg-install.json"), "utf8")).resolves.toContain("@islee23520/lfg")
    // install-only may seed [mcp_servers.xai_grok] but must not write agent overrides / roles / model routes.
    try {
      const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
      expect(config).not.toMatch(/\[omo\.agents\./)
      expect(config).not.toMatch(/\[subagents\.models\]/)
      expect(config).not.toMatch(/\[models\]/)
    } catch (error) {
      expect(error).toMatchObject({ code: "ENOENT" })
    }
    await expect(readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(home, ".grok", "roles", "explorer.toml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  }, 15_000)
})
