import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { withModelServer } from "../test/test-model-server"
import { runLfg } from "../test/test-process"

describe("lfg Grok config persistence", () => {
  test("setup run persists endpoint discovery without model or subagent tables", async () => {
    const apiKey = "sk-lfg-test-key"
    await withModelServer(["gpt-4.1-mini", "o3-mini"], { requiredApiKey: apiKey }, async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], {
        HOME: home,
        OPENAI_API_KEY: apiKey,
      })

      const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
      const json = JSON.stringify(result.json)
      expect(result.exitCode).toBe(0)
      expect(result.json).toMatchObject({
        ok: true,
        status: "installed",
        grokConfig: {
          status: "configured",
          path: join(home, ".grok", "config.toml"),
        },
      })
      expect(config).toContain("[endpoints]")
      expect(config).toContain(`models_base_url = "${baseUrl}/v1"`)
      expect(config).not.toContain(`[endpoints]\nmodels_base_url = "${baseUrl}/v1"\napi_key = "${apiKey}"`)
      expect(config).not.toContain("[models]")
      expect(config).not.toContain("[model.")
      expect(config).not.toContain(`api_key = "${apiKey}"`)
      expect(config).not.toContain("[omo.models]")
      expect(config).not.toContain("[omo.agents.")
      expect(json).not.toContain(apiKey)
      await expect(readFile(join(home, ".grok", "roles", "explorer.toml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
      await expect(readFile(join(home, ".grok", "roles", "sisyphus.toml"), "utf8")).resolves.toContain('model = "gpt-4.1-mini"')
      expect(result.json).toMatchObject({ postInstallVerify: { status: "verified" } })
    })
  })

  test("setup run preserves unrelated config while removing endpoint credentials", async () => {
    await withModelServer(["gpt-4.1-mini", "o3-mini"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
            const configPath = join(home, ".grok", "config.toml")
      await mkdir(join(home, ".grok"), { recursive: true })
      await writeFile(configPath, "[endpoints]\napi_key = \"keep-me\"\n\n[ui]\ntheme = \"auto\"\n", "utf8")

      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], {
        HOME: home,
        OPENAI_API_KEY: "sk-new-env-key",
      })

      const config = await readFile(configPath, "utf8")
      expect(result.exitCode).toBe(0)
      expect(config).not.toContain('api_key = "keep-me"')
      expect(config).not.toContain('api_key = "sk-new-env-key"')
      expect(config).toContain("[ui]\ntheme = \"auto\"")
      expect(config).toContain(`models_base_url = "${baseUrl}/v1"`)
      expect(config).not.toContain("[omo.models]")
      expect(config).not.toContain("[omo.agents.")
    })
  })

  test("setup run does not materialize cli proxy model aliases", async () => {
    const apiKey = "sk-alias-key"
    await withModelServer(["GPT-5.2", "gpt-5.2", "Claude Sonnet 4.6", "claude-sonnet-4-6", "codex-auto-review"], { requiredApiKey: apiKey }, async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], {
        HOME: home,
        OPENAI_API_KEY: apiKey,
      })

      expect(result.exitCode, JSON.stringify(result.json)).toBe(0)
      const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
      expect(config).not.toContain("[model.")
      expect(config).not.toContain("[omo.agents.")
    })
  })

  test("setup run keeps backend routing out of config.toml", async () => {
    const apiKey = "sk-agent-key"
    await withModelServer(["gpt-5.5", "gemini-3-flash", "grok-4.20-0309-reasoning", "grok-4.20-0309-non-reasoning", "codex-auto-review"], { requiredApiKey: apiKey }, async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run", "--backend-engine", "codex"], {
        HOME: home,
        OPENAI_API_KEY: apiKey,
        LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
      })

      const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
      expect(result.exitCode).toBe(0)
      expect(config).not.toContain("[omo.backend_routing")
      const routing = JSON.parse(await readFile(join(home, ".grok", "lfg-backend-routing.json"), "utf8")) as { global: string }
      expect(routing.global).toBe("codex")
      expect(config).not.toContain("[omo.models]")
      expect(config).not.toContain("[omo.agents.")
    })
  })

  test("setup run omits model context windows when upstream advertises them", async () => {
    const apiKey = "sk-cw-key"
    const descriptors = [
      { id: "gpt-4.1-mini", context_window: 128000 },
      { id: "o3-mini", context_window: 200000 },
    ]
    await withModelServer(descriptors, { requiredApiKey: apiKey }, async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], {
        HOME: home,
        OPENAI_API_KEY: apiKey,
      })
      expect(result.exitCode).toBe(0)
      const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
      expect(config).not.toContain("context_window")
      expect(config).not.toContain("[model.")
    })
  })

  test("setup run omits max_model_len-derived model blocks", async () => {
    const descriptors = [{ id: "grok-3-mini", max_model_len: 131072 }]
    await withModelServer(descriptors, async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], { HOME: home })
      expect(result.exitCode).toBe(0)
      const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
      expect(config).not.toContain("context_window")
    })
  })

  test("setup strips prior grok-build model blocks when discovery omits context", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      configPath,
      `[endpoints]\nmodels_base_url = "http://127.0.0.1:8317/v1"\n\n[model."grok-build"]\nmodel = "old"\nbase_url = "http://127.0.0.1:8317/v1"\ncontext_window = 99999\n`,
      "utf8",
    )

    // Discovery has no context info for grok-build
    await withModelServer(["grok-build"], async (baseUrl) => {
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], { HOME: home })
      expect(result.exitCode).toBe(0)
      const config = await readFile(configPath, "utf8")
      expect(config).not.toContain('[model."grok-build"]')
      expect(config).not.toContain("[model.grok-build]")
    })
  })

  test("setup strips prior grok-build model blocks even when discovery provides context", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      configPath,
      `[endpoints]\nmodels_base_url = "http://127.0.0.1:8317/v1"\n\n[model."grok-build"]\nmodel = "old"\nbase_url = "http://127.0.0.1:8317/v1"\ncontext_window = 100000\n`,
      "utf8",
    )

    const descriptors = [{ id: "grok-build", context_window: 256000 }]
    await withModelServer(descriptors, async (baseUrl) => {
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], { HOME: home })
      expect(result.exitCode).toBe(0)
      const config = await readFile(configPath, "utf8")
      expect(config).not.toContain('[model."grok-build"]')
      expect(config).not.toContain("[model.grok-build]")
    })
  }, 10_000)

  // T1 baseline: pins CURRENT (buggy) behavior for GPT-5.5 display alias.
  // With discovery providing context under canonical "gpt-5.5", the display-alias
  // section currently receives no/fallback value (prior preserved).
  test("setup strips prior GPT-5.5 display alias model blocks", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    // Prior has a different value so we can observe fallback
    await writeFile(
      configPath,
      `[model."GPT-5.5"]\nmodel = "gpt-5.5"\ncontext_window = 128000\n`,
      "utf8",
    )

    const descriptors = [{ id: "gpt-5.5", context_window: 272000 }]
    await withModelServer(descriptors, async (baseUrl) => {
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], { HOME: home })
      expect(result.exitCode).toBe(0)
      const config = await readFile(configPath, "utf8")
      expect(config).not.toContain('[model."GPT-5.5"]')
    })
  })

  // T1 target: after fix, canonical metadata from discovery applies to display alias sections.
  test("setup does not create canonical or display alias model blocks", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })

    // Fixture uses both casings (matches existing overlapping-alias test; allowed per T1 scope).
    // The exact value is whatever local discovery produces (LiteLLM catalog or server); we assert propagation.
    const descriptors = [{ id: "GPT-5.5", context_window: 272000 }, { id: "gpt-5.5" }]
    await withModelServer(descriptors, async (baseUrl) => {
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], { HOME: home })
      expect(result.exitCode).toBe(0)
      const config = await readFile(configPath, "utf8")
      expect(config).not.toContain('[model."gpt-5.5"]')
      expect(config).not.toContain('[model."GPT-5.5"]')
    })
  })
})

function section(source: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\[${escaped}\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`).exec(source)?.[0] ?? ""
}
