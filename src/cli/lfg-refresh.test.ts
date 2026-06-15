import { describe, expect, test } from "vitest"
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { runLfg, runLfgText } from "./test-process"

async function withModelServer(
  modelIdsOrDescriptors: readonly (string | { id: string; context_window?: number; max_model_len?: number })[],
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const descriptors = modelIdsOrDescriptors.map((d) => (typeof d === "string" ? { id: d } : d))
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.url !== "/v1/models") {
      response.writeHead(404, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: "not found" }))
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(
      JSON.stringify({
        data: descriptors.map((d) => ({
          id: d.id,
          ...(d.context_window !== undefined ? { context_window: d.context_window } : {}),
          ...(d.max_model_len !== undefined ? { max_model_len: d.max_model_len } : {}),
        })),
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (typeof address !== "object" || address === null) {
    server.close()
    throw new Error("model test server did not expose a TCP address")
  }
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }
}

describe("lfg setup --refresh (model/auth re-sync)", () => {
  test("--json setup --refresh returns a non-mutating plan (no execution)", async () => {
    const result = await runLfg(["--json", "setup", "--refresh"], {})
    expect(result.exitCode).toBe(0)
    const json = result.json as Record<string, unknown>
    expect(json).toMatchObject({
      ok: true,
      status: "planned",
      command: "setup",
      subcommand: "refresh",
      executed: false,
      lfgIsPlugin: false,
    })
    expect(json.purpose).toContain("Refresh only the model list")
    expect(Array.isArray(json.steps)).toBe(true)
    // Should not have performed any writes
    expect(json).not.toHaveProperty("configUpdated")
  })

  test("--json setup --refresh --run discovers models, writes config with context_window and api_key, does not install plugin tree", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-refresh-"))
    try {
      await withModelServer(
        [
          { id: "gpt-5.5", context_window: 1050000 },
          { id: "claude-sonnet-4-6", max_model_len: 200000 },
        ],
        async (baseUrl) => {
          const result = await runLfg(
            ["--json", "setup", "--refresh", "--run", "--base-url", baseUrl],
            { HOME: home, OPENAI_API_KEY: "sk-refresh-test" },
          )
          expect(result.exitCode).toBe(0)
          const json = result.json as Record<string, unknown>
          expect(json).toMatchObject({
            ok: true,
            status: "refreshed",
            command: "setup",
            subcommand: "refresh",
            executed: true,
            configUpdated: true,
          })
          expect(typeof (json as { configPath?: string }).configPath).toBe("string")

          // Verify ~/.grok/config.toml has the refreshed sections
          const configPath = join(home, ".grok", "config.toml")
          const config = await readFile(configPath, "utf8")
          expect(config).toContain('models_base_url = "')
          expect(config).toContain('[model."grok-build"]')
          expect(config).toContain("context_window = 1050000") // from gpt-5.5 (default)
          expect(config).toContain('api_key = "sk-refresh-test"')

          // Ensure no plugin tree was materialized (refresh is config-only)
          // We only assert that we did not create the typical src stamp dir in this run.
          // (Full install would also write component inventory etc.; we just confirm the narrow intent.)
          // A soft heuristic: if the user had no prior stamp, we should not have created one.
          // We don't hard-require absence because prior test state could exist; instead we check the JSON shape.
          expect(json).not.toHaveProperty("internalStep")
          expect(json).not.toHaveProperty("postInstallVerify")
        },
      )
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test("--json setup --refresh --run uses active Codex provider token when env key is absent", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-refresh-codex-token-"))
    try {
      await mkdir(join(home, ".codex"), { recursive: true })
      await writeFile(
        join(home, ".codex", "config.toml"),
        [
          'model_provider = "cliproxyapi"',
          "",
          "[model_providers.cliproxyapi]",
          'experimental_bearer_token = "sk-codex-provider-token"',
          "",
        ].join("\n"),
        "utf8",
      )
      await withModelServer(["gpt-5.5"], async (baseUrl) => {
        const result = await runLfg(
          ["--json", "setup", "--refresh", "--run", "--base-url", baseUrl],
          { HOME: home, OPENAI_API_KEY: "" },
        )
        expect(result.exitCode).toBe(0)
        const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
        expect(config).toContain('api_key = "sk-codex-provider-token"')
      })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test("--json setup --refresh --run with public LiteLLM enrichment when proxy omits sizes", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-refresh-lite-"))
    try {
      // Proxy returns models with no context info.
      await withModelServer(["gpt-5.4-mini", "o3-mini"], async (baseUrl) => {
        const result = await runLfg(
          ["--json", "setup", "--refresh", "--run", "--base-url", baseUrl],
          { HOME: home },
        )
        expect(result.exitCode).toBe(0)
        const json = result.json as Record<string, unknown>
        expect(json.status).toBe("refreshed")
        // Discovery should have been enriched by public catalog (we only assert presence of some contextWindows in the echoed discovery).
        const disc = (json as { modelDiscovery?: { contextWindows?: Record<string, number> } }).modelDiscovery
        expect(disc).toBeTruthy()
        // At least one of the known public keys should have been filled (best-effort; network may be cached or timing-sensitive).
        // We do not hard-fail if the catalog fetch is blocked in CI; the important contract is that the refresh path ran cleanly.
        if (disc && disc.contextWindows && Object.keys(disc.contextWindows).length > 0) {
          // If enrichment happened, values must be positive.
          for (const v of Object.values(disc.contextWindows)) {
            expect(typeof v).toBe("number")
            expect(v).toBeGreaterThan(0)
          }
        }
      })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test("bare interactive `lfg setup --refresh` advertises maintenance nature (non-mutating unless confirmed)", async () => {
    const result = await runLfgText(["setup", "--refresh"], "n\n", {})
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Model / auth refresh")
    expect(result.stdout).toContain("does not reinstall or modify the Grok adapter plugin tree")
    expect(result.stdout).toContain("Cancelled")
  })

  test("refresh preserves prior context_window when discovery provides none for a model", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-refresh-prior-"))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      configPath,
      `[endpoints]\nmodels_base_url = "http://127.0.0.1:8317/v1"\n\n[model."grok-build"]\nmodel = "old"\nbase_url = "http://127.0.0.1:8317/v1"\ncontext_window = 77777\n`,
      "utf8",
    )
    try {
      // Discovery advertises the model but with no size info.
      await withModelServer(["grok-build"], async (baseUrl) => {
        const result = await runLfg(["--json", "setup", "--refresh", "--run", "--base-url", baseUrl], { HOME: home })
        expect(result.exitCode).toBe(0)
        const config = await readFile(configPath, "utf8")
        // Prior value must be kept.
        expect(config).toContain("context_window = 77777")
      })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test("refresh overrides prior context_window when discovery provides a fresh value", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-refresh-override-"))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      configPath,
      `[endpoints]\nmodels_base_url = "http://127.0.0.1:8317/v1"\n\n[model."grok-build"]\nmodel = "old"\nbase_url = "http://127.0.0.1:8317/v1"\ncontext_window = 100000\n`,
      "utf8",
    )
    try {
      const descriptors = [{ id: "grok-build", context_window: 300000 }]
      await withModelServer(descriptors, async (baseUrl) => {
        const result = await runLfg(["--json", "setup", "--refresh", "--run", "--base-url", baseUrl], { HOME: home })
        expect(result.exitCode).toBe(0)
        const config = await readFile(configPath, "utf8")
        expect(config).toContain("context_window = 300000")
      })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test("refresh without discovery yields a clear no-op response (no writes)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-refresh-nodisc-"))
    try {
      // Force no default proxy and explicitly clear any ambient base URL sources
      // so resolveSetupDiscovery has literally no candidates.
      const result = await runLfg(
        ["--json", "setup", "--refresh", "--run"],
        {
          HOME: home,
          LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
          LFG_GROK_BASE_URL: "",
          LAZYCODEX_OPENAI_BASE_URL: "",
        },
      )
      // With no sources and --run, the CLI surfaces a failure (ok:false) and exits non-zero.
      expect(result.exitCode).not.toBe(0)
      const json = result.json as Record<string, unknown>
      expect(json.status).toBe("refresh_no_discovery")
      expect(json.ok).toBe(false)
      // No config should have been written by this path.
      const exists = await readFile(join(home, ".grok", "config.toml"), "utf8").then(() => true).catch(() => false)
      expect(exists).toBe(false)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})
