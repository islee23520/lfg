import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfgText } from "./test-process"

describe("lfg interactive setup", () => {
  test("renders an oh-my-openagent-style guided installer before confirmation", async () => {
    // Given: model auto-discovery is disabled so the CLI must ask for a base URL.
    const home = await mkdtemp(join(tmpdir(), "lfg-interactive-ux-"))

    // When: the user accepts defaults until the final install confirmation and declines.
    const result = await runLfgText(["setup"], "\n\nn\n", {
      HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
    })

    // Then: the human flow mirrors oh-my-openagent's branded, step-based installer vibe.
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("oMoMoMoMo... lfg setup")
    expect(result.stdout).toContain("[1/5] Discovering Grok model endpoint")
    expect(result.stdout).toContain("[2/5] Configuring LazyCodex agents")
    expect(result.stdout).toContain("[3/5] Reviewing install plan")
    expect(result.stdout).toContain("Install Summary")
    expect(result.stdout).toContain("The Magic Word")
    expect(result.stdout).toContain("Include ultrawork (or ulw) in your prompt")
    expect(result.stdout).toContain("Install now? [y/N]")
    expect(result.stdout).toContain("Installation cancelled. Nothing was changed.")
    expect(result.stdout).toContain("oMoMoMoMo... Bye!")
    expect(result.stdout).not.toContain("{\n")
  })

  test("requests GitHub stars for omo and lfg after a successful install", async () => {
    // Given: a temp home and no model endpoint keep setup deterministic.
    const home = await mkdtemp(join(tmpdir(), "lfg-interactive-star-"))

    // When: the user installs, then declines the optional GitHub star action.
    const result = await runLfgText(["setup"], "\n\ny\nn\n", {
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
})
