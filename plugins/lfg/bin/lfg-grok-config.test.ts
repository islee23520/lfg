import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg, runLfgText } from "./test-process"

describe("lfg Grok config persistence", () => {
  test("setup run persists discovered OpenAI-compatible models after installer success", async () => {
    const apiKey = "sk-lfg-test-key"
    await withModelServer(["gpt-4.1-mini", "o3-mini"], { requiredApiKey: apiKey }, async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const fakeBin = await makeFakeNpx(0)

      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], {
        HOME: home,
        OPENAI_API_KEY: apiKey,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
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
      expect(config).toContain("[models]")
      expect(config).toContain('default = "gpt-4.1-mini"')
      expect(config).toContain('[model."grok-build"]')
      expect(config).toContain('[model."gpt-4.1-mini"]')
      expect(config).toContain('model = "gpt-4.1-mini"')
      expect(config).toContain(`base_url = "${baseUrl}/v1"`)
      expect(config).toContain(`api_key = "${apiKey}"`)
      expect(config).toContain('[model."o3-mini"]')
      expect(config).toContain("[lazycodex.models]")
      expect(config).toContain('default = "gpt-4.1-mini"')
      expect(config).toContain('reasoning = "o3-mini"')
      expect(json).not.toContain(apiKey)
      const explorerToml = await readFile(join(home, ".grok", "agents", "explorer.toml"), "utf8")
      expect(explorerToml).toContain('model = "gpt-4.1-mini"')
      expect(result.json).toMatchObject({ postInstallVerify: { status: "verified" } })
    })
  })

  test("setup run preserves existing endpoint keys while updating model config", async () => {
    await withModelServer(["gpt-4.1-mini", "o3-mini"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const fakeBin = await makeFakeNpx(0)
      const configPath = join(home, ".grok", "config.toml")
      await mkdir(join(home, ".grok"), { recursive: true })
      await writeFile(configPath, "[endpoints]\napi_key = \"keep-me\"\n\n[ui]\ntheme = \"auto\"\n", "utf8")

      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], {
        HOME: home,
        OPENAI_API_KEY: "sk-new-env-key",
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      })

      const config = await readFile(configPath, "utf8")
      expect(result.exitCode).toBe(0)
      expect(config).not.toContain('api_key = "keep-me"')
      expect(config).toContain('api_key = "sk-new-env-key"')
      expect(config).toContain("[ui]\ntheme = \"auto\"")
      expect(config).toContain(`models_base_url = "${baseUrl}/v1"`)
      expect(config).toContain("[lazycodex.models]")
      expect(config).toContain("[lazycodex.agents.explorer]")
      expect(config).toContain('reasoning_level = "medium"')
    })
  })

  test("setup run writes every cli proxy model alias and groups overlapping aliases", async () => {
    const apiKey = "sk-alias-key"
    await withModelServer(["GPT-5.2", "gpt-5.2", "Claude Sonnet 4.6", "claude-sonnet-4-6", "codex-auto-review"], { requiredApiKey: apiKey }, async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const fakeBin = await makeFakeNpx(0)

      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], {
        HOME: home,
        OPENAI_API_KEY: apiKey,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      })

      expect(result.exitCode, JSON.stringify(result.json)).toBe(0)
      const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
      expect(config).toContain('[model."GPT-5.2"]')
      expect(config).toContain('[model."gpt-5.2"]')
      expect(config).toContain('[model."Claude Sonnet 4.6"]')
      expect(config).toContain('[model."claude-sonnet-4-6"]')
      expect(section(config, 'model."GPT-5.2"')).toContain('model = "gpt-5.2"')
      expect(section(config, 'model."gpt-5.2"')).toContain('model = "gpt-5.2"')
      expect(section(config, 'model."Claude Sonnet 4.6"')).toContain('model = "claude-sonnet-4-6"')
      expect(section(config, 'model."claude-sonnet-4-6"')).toContain('model = "claude-sonnet-4-6"')
      expect(section(config, 'model."codex-auto-review"')).toContain('model = "codex-auto-review"')
      expect(section(config, "lazycodex.agents.explorer")).toContain('model = "gpt-5.2"')
      expect(section(config, "lazycodex.agents.coding")).toContain('model = "codex-auto-review"')
    })
  })

  test("setup run persists interactive lazycodex agent model and reasoning choices", async () => {
    const apiKey = "sk-agent-key"
    await withModelServer(["grok-3-mini", "grok-4.20-0309-reasoning", "codex-auto-review"], { requiredApiKey: apiKey }, async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const fakeBin = await makeFakeNpx(0)
      const input = [
        baseUrl,
        "y",
        "codex-auto-review",
        "high",
        "grok-4.20-0309-reasoning",
        "xhigh",
        "grok-3-mini",
        "low",
        "y",
        "",
      ].join("\n")

      const result = await runLfgText(["setup"], input, {
        HOME: home,
        OPENAI_API_KEY: apiKey,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      })

      const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("LazyCodex agent model configuration")
      expect(section(config, "lazycodex.agents.explorer")).toContain('model = "codex-auto-review"')
      expect(section(config, "lazycodex.agents.explorer")).toContain('reasoning_level = "high"')
      expect(section(config, "lazycodex.agents.reasoning")).toContain('model = "grok-4.20-0309-reasoning"')
      expect(section(config, "lazycodex.agents.reasoning")).toContain('reasoning_level = "xhigh"')
      expect(section(config, "lazycodex.agents.coding")).toContain('model = "grok-3-mini"')
      expect(section(config, "lazycodex.agents.coding")).toContain('reasoning_level = "low"')
      expect(result.stdout).toContain("LAZYCODEX_AGENT_CONFIG=")
    })
  })

  test("setup run leaves Grok config untouched when installer fails", async () => {
    await withModelServer(["gpt-4.1-mini", "o3-mini"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const fakeBin = await makeFakeNpx(9)
      const configPath = join(home, ".grok", "config.toml")
      await mkdir(join(home, ".grok"), { recursive: true })
      await writeFile(configPath, "[ui]\ntheme = \"auto\"\n", "utf8")

      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      })

      expect(result.exitCode).toBe(1)
      expect(result.json).toMatchObject({
        ok: false,
        status: "install_failed",
      })
      await expect(readFile(configPath, "utf8")).resolves.toBe("[ui]\ntheme = \"auto\"\n")
    })
  })
})

function section(source: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\[${escaped}\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`).exec(source)?.[0] ?? ""
}

type ModelServerOptions = {
  readonly requiredApiKey?: string
}

async function withModelServer(modelIds: readonly string[], run: (baseUrl: string) => Promise<void>): Promise<void>
async function withModelServer(modelIds: readonly string[], options: ModelServerOptions, run: (baseUrl: string) => Promise<void>): Promise<void>
async function withModelServer(
  modelIds: readonly string[],
  optionsOrRun: ModelServerOptions | ((baseUrl: string) => Promise<void>),
  maybeRun?: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const options = typeof optionsOrRun === "function" ? {} : optionsOrRun
  const run = typeof optionsOrRun === "function" ? optionsOrRun : maybeRun
  if (typeof run !== "function") {
    throw new Error("model server callback is required")
  }
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.url !== "/v1/models") {
      response.writeHead(404, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: "not found" }))
      return
    }
    const expectedAuthorization = options.requiredApiKey === undefined ? null : `Bearer ${options.requiredApiKey}`
    if (expectedAuthorization !== null && request.headers.authorization !== expectedAuthorization) {
      response.writeHead(401, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: "Missing API key" }))
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ data: modelIds.map((id) => ({ id })) }))
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
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }
}

async function makeFakeNpx(exitCode: number): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "lfg-fake-npx."))
  const body =
    exitCode === 0
      ? "case \"$*\" in *lazycodex-ai*) echo fake lazycodex install: $*; echo LAZYCODEX_AGENT_CONFIG=${LAZYCODEX_AGENT_CONFIG:-} ;; *@islee23520/lfp*) echo unexpected lfp npx: $* >&2; exit 2 ;; *) echo unexpected npx: $* >&2; exit 2 ;; esac"
      : "echo fake lazycodex failure: $* >&2"
  await writeFile(join(bin, "npx"), `#!/usr/bin/env bash\n${body}\nexit ${exitCode}\n`)
  await chmod(join(bin, "npx"), 0o755)
  return bin
}
