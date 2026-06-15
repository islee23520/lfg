import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { LFG_OWNED_GROK_CONFIG_SECTIONS } from "../cli/lfg-grok-config"
import { runGrokInstall } from "./run-grok-install"

/** #29 — config.toml merge only via runGrokInstall transaction. */
describe("config single writer acceptance (#29)", () => {
  test("runGrokInstall merges endpoints and model sections idempotently", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-config-writer-"))
    const discovery = {
      baseUrl: "http://127.0.0.1:11434/v1",
      modelsUrl: "http://127.0.0.1:11434/v1/models",
      modelIds: ["gpt-4.1-mini"],
      mapping: { default: "gpt-4.1-mini", fast: "gpt-4.1-mini", reasoning: "gpt-4.1-mini", coding: "gpt-4.1-mini" },
    }
    const env = { HOME: home, OPENAI_API_KEY: "sk-test" }
    await runGrokInstall(discovery, env)
    const first = await readFile(join(home, ".grok", "config.toml"), "utf8")
    await runGrokInstall(discovery, env)
    const second = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(second).toBe(first)
    expect(first).toContain("[endpoints]")
    expect(first).toContain('default = "gpt-4.1-mini"')
    expect(first).toContain("models_base_url")
    const endpointsBlock = first.split(/\n\[/).find((chunk) => chunk.startsWith("endpoints]") || chunk.startsWith("[endpoints]"))
    expect(endpointsBlock ?? "").not.toMatch(/api_key/)
    expect(LFG_OWNED_GROK_CONFIG_SECTIONS.join(" ")).not.toContain("api_key")
  })
})