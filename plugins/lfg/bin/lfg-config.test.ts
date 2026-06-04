import { describe, expect, test } from "vitest"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runLfg } from "./test-process"

describe("lfg Grok BYOK config", () => {
  test("plans Grok BYOK config without hardcoded CLI proxy URL", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const result = await runLfg(["--json", "config", "grok-byok"], { HOME: home })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "planned",
      command: "config grok-byok",
      mutatesGlobalConfig: true,
      executed: false,
      providerMode: "interactive",
      target: join(home, ".grok", "config.toml"),
    })
    expect(JSON.stringify(result.json)).not.toContain("https://cliproxy.linalab.io/v1")
  })

  test("requires explicit Grok BYOK settings for automation", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const result = await runLfg(["--json", "config", "grok-byok", "--run"], {
      HOME: home,
      LFG_GROK_API_KEY: "secret-test-key",
    })

    expect(result.exitCode).toBe(1)
    expect(result.json).toMatchObject({
      ok: false,
      status: "missing_config",
      executed: false,
      requiredEnv: ["LFG_GROK_BASE_URL", "LFG_GROK_API_KEY", "LFG_GROK_MODEL_ALIAS"],
    })
    expect(JSON.stringify(result.json)).not.toContain("secret-test-key")
  })

  test("uses gpt-5.5 as the Grok BYOK upstream model when omitted", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const configPath = join(home, ".grok", "config.toml")
    const result = await runLfg(["--json", "config", "grok-byok", "--run"], {
      HOME: home,
      LFG_GROK_BASE_URL: "https://example.test/v1",
      LFG_GROK_API_KEY: "secret-test-key",
      LFG_GROK_MODEL_ALIAS: "lfg-test",
    })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "configured",
      modelAlias: "lfg-test",
      modelId: "gpt-5.5",
      baseUrl: "https://example.test/v1",
    })
    expect(JSON.stringify(result.json)).not.toContain("secret-test-key")
    const config = await readFile(configPath, "utf8")
    expect(config).toContain('model = "gpt-5.5"')
    expect(config).toContain('base_url = "https://example.test/v1"')
  })

  test("writes Grok BYOK config from explicit environment without leaking the key", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const configPath = join(home, ".grok", "config.toml")
    const result = await runLfg(["--json", "config", "grok-byok", "--run"], {
      HOME: home,
      LFG_GROK_BASE_URL: "https://example.test/v1",
      LFG_GROK_API_KEY: "secret-test-key",
      LFG_GROK_MODEL_ALIAS: "lfg-test",
      LFG_GROK_MODEL_ID: "gpt-test",
    })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "configured",
      executed: true,
      modelAlias: "lfg-test",
      modelId: "gpt-test",
      baseUrl: "https://example.test/v1",
      apiKeyConfigured: true,
    })
    expect(JSON.stringify(result.json)).not.toContain("secret-test-key")
    const config = await readFile(configPath, "utf8")
    expect(config).toContain("[model.lfg-test]")
    expect(config).toContain('base_url = "https://example.test/v1"')
    expect(config).toContain('api_key = "secret-test-key"')
  })

  test("routes Grok secondary BYOK calls through the configured alias", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"))
    await writeFile(
      configPath,
      [
        "[ui]",
        'theme = "auto"',
        'fork_secondary_model = "grok-build"',
        "",
        "[models]",
        'default = "gpt-5-5"',
        "",
      ].join("\n"),
    )

    const result = await runLfg(["--json", "config", "grok-byok", "--run"], {
      HOME: home,
      LFG_GROK_BASE_URL: "https://example.test/v1",
      LFG_GROK_API_KEY: "secret-test-key",
      LFG_GROK_MODEL_ALIAS: "gpt-5-5",
      LFG_GROK_MODEL_ID: "gpt-5.5",
    })

    expect(result.exitCode).toBe(0)
    const config = await readFile(configPath, "utf8")
    expect(config).toContain("[model.gpt-5-5]")
    expect(config).toContain("[model.grok-build]")
    expect(config).toContain('fork_secondary_model = "gpt-5-5"')
    expect(config).toContain('name = "grok-build"')
    expect(config).not.toContain('fork_secondary_model = "grok-build"')
  })
})
