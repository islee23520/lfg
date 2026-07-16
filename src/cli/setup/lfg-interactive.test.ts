import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfgText } from "../test/test-process"

describe("lfg interactive setup", () => {
  test("renders an oh-my-openagent-style guided installer before confirmation", async () => {
    // Given: model auto-discovery is disabled so the CLI must ask for a base URL.
    const home = await mkdtemp(join(tmpdir(), "lfg-interactive-ux-"))

    // When: the user declines the final install confirmation (vanilla path has no proxy quiz).
    const result = await runLfgText(["setup", "--no-tui"], "n\n", {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
    })

    // Then: the human flow mirrors oh-my-openagent's branded, step-based installer vibe.
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("oMoMoMoMo... lfg setup")
    expect(result.stdout).toContain("[1/5] Discovering Grok model endpoint")
    expect(result.stdout).toContain("[2/5] Configuring LazyCodex agents")
    expect(result.stdout).not.toContain("Default subagent CLI")
    expect(result.stdout).not.toContain("Default implementer backend")
    expect(result.stdout).toContain("[3/5] Reviewing install plan")
    expect(result.stdout).toContain("Install Summary")
    expect(result.stdout).toContain("The Magic Word")
    expect(result.stdout).toMatch(/ultrawork|ulw|Codex/)
    expect(result.stdout).toContain("Install now? [y/N]")
    expect(result.stdout).toContain("Installation cancelled. Nothing was changed.")
    expect(result.stdout).toContain("oMoMoMoMo... Bye!")
    expect(result.stdout).not.toContain("{\n")
  })

  test("requests GitHub stars for omo and lfg after a successful install", async () => {
    // Given: a temp home and no model endpoint keep setup deterministic.
    const home = await mkdtemp(join(tmpdir(), "lfg-interactive-star-"))

    // When: the user installs, then declines the optional GitHub star action (no proxy quiz).
    const result = await runLfgText(["setup", "--no-tui"], "y\nn\n", {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
    })

    // Then: setup asks to star both the upstream omo repo and this adapter.
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Installation complete!")
    expect(result.stdout).toContain("Star oh-my-openagent and lfg on GitHub? [y/N]")
    expect(result.stdout).toContain("code-yeongyu/oh-my-openagent")
    expect(result.stdout).toContain("islee23520/lfg")
    expect(result.stdout).toContain("Skipped GitHub starring.")
  })

  test("no-tui install always persists Grok coding tool adapter", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-interactive-adapter-"))

    const result = await runLfgText(["setup", "--no-tui"], "y\nn\n", {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Installation complete!")
    const configToml = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(configToml).not.toContain("[omo.models]")
    expect(configToml).not.toContain("[omo.backend_routing]")
    expect(configToml).not.toContain("[model.")
    await expect(readFile(join(home, ".grok", "lfg-backend-routing.json"), "utf8")).resolves.toContain('"global": "codex"')
  })
})
