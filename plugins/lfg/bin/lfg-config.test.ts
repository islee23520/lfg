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
      provider: "custom_openai_compatible",
      supportsBatch: true,
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
      requiredEnv: ["LFG_GROK_API_KEY", "LFG_GROK_MODEL_ALIAS"],
      conditionalEnv: ["LFG_GROK_BASE_URL"],
      existingEndpointDetected: false,
    })
    expect(JSON.stringify(result.json)).not.toContain("secret-test-key")
  })

  test("uses existing Grok endpoints for BYOK automation when base URL is omitted", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(configPath, '[endpoints]\nmodels_base_url = "https://endpoint.test/v1"\n\n[ui]\ntheme = "auto"\n')

    const result = await runLfg(["--json", "config", "grok-byok", "--run"], {
      HOME: home,
      LFG_GROK_API_KEY: "secret-test-key",
      LFG_GROK_MODEL_ALIAS: "openai-codex",
    })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "configured",
      modelAlias: "openai-codex",
      modelId: "gpt-5",
      baseUrl: "https://endpoint.test/v1",
      baseUrlSource: "existing_endpoints",
      provider: "custom_openai_compatible",
    })
    expect(JSON.stringify(result.json)).not.toContain("secret-test-key")
    const config = await readFile(configPath, "utf8")
    expect(config).toContain('[endpoints]\nmodels_base_url = "https://endpoint.test/v1"')
    expect(config).toContain("[model.openai-codex]")
    expect(config).toContain('api_key = "secret-test-key"')
    expect(config).not.toContain('\nbase_url = "https://endpoint.test/v1"')
  })

  test("normalizes endpoint URLs and TOML model aliases", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const configPath = join(home, ".grok", "config.toml")
    const result = await runLfg(["--json", "config", "grok-byok", "--run"], {
      HOME: home,
      LFG_GROK_BASE_URL: "cliproxy.linalab.io/v1/responses",
      LFG_GROK_API_KEY: "secret-test-key",
      LFG_GROK_MODEL_ALIAS: "gpt-5.5",
    })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "configured",
      modelAlias: "gpt-5-5",
      modelId: "gpt-5.5",
      baseUrl: "https://cliproxy.linalab.io/v1",
      baseUrlSource: "environment",
    })
    const config = await readFile(configPath, "utf8")
    expect(config).toContain('models_base_url = "https://cliproxy.linalab.io/v1"')
    expect(config).toContain("[model.gpt-5-5]")
    expect(config).not.toContain("[model.gpt-5.5]")
    expect(config).not.toContain("cliproxy.linalab.io/v1/responses")
  })

  test("uses gpt-5 as the Grok BYOK upstream model when omitted", async () => {
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
      modelId: "gpt-5",
      baseUrl: "https://example.test/v1",
    })
    expect(JSON.stringify(result.json)).not.toContain("secret-test-key")
    const config = await readFile(configPath, "utf8")
    expect(config).toContain('model = "gpt-5"')
    expect(config).toContain('models_base_url = "https://example.test/v1"')
    expect(config).not.toContain('\nbase_url = "https://example.test/v1"')
  })

  test("writes all lazycodex required models from LFG_GROK_MODELS", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const configPath = join(home, ".grok", "config.toml")
    const result = await runLfg(["--json", "config", "grok-byok", "--run"], {
      HOME: home,
      LFG_GROK_BASE_URL: "https://example.test/v1",
      LFG_GROK_API_KEY: "secret-test-key",
      LFG_GROK_MODELS: "gpt-5.5,gpt-5.4,gpt-5.4-mini,gpt-5.2",
    })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "configured",
      supportsBatch: true,
      modelCount: 3,
      configuredModels: [
        { alias: "gpt-5-5", modelId: "gpt-5.5" },
        { alias: "gpt-5-4", modelId: "gpt-5.4" },
        { alias: "gpt-5-4-mini", modelId: "gpt-5.4-mini" },
      ],
      secondaryModelAlias: "grok-build",
      verificationCommands: expect.arrayContaining(["grok -m grok-build -p 'Reply LFG_GROK_BUILD_OK'"]),
    })
    expect(JSON.stringify(result.json)).not.toContain("secret-test-key")
    const config = await readFile(configPath, "utf8")
    expect(config).toContain("[model.gpt-5-5]")
    expect(config).toContain("[model.gpt-5-4]")
    expect(config).toContain("[model.gpt-5-4-mini]")
    expect(config).toContain("[model.grok-build]")
    expect(config).not.toContain("[model.gpt-5.5]")
    expect(config).not.toContain("[model.gpt-5.4]")
    expect(config).not.toContain("[model.gpt-5.4-mini]")
    expect(config).not.toContain("[model.gpt-5.2]")
    expect(config).not.toContain('model = "gpt-5.2"')
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
    expect(config).toContain('models_base_url = "https://example.test/v1"')
    expect(config).not.toContain('\nbase_url = "https://example.test/v1"')
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
