import { execFile } from "node:child_process"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const execFileAsync = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const fixtureRoot = join(here, "..", "grok-install", "fixture-minimal")

describe("npm setup script safety", () => {
  test("root npm run setup is a non-mutating JSON plan by default", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-npm-setup-safe-home."))
    const sentinelPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(sentinelPath, "[user]\nkeep = \"real-grok-config\"\n", "utf8")

    try {
      const { stdout } = await execFileAsync("npm", ["run", "--silent", "setup"], {
        env: { ...process.env, HOME: home, LFG_DISABLE_DEFAULT_MODELS_PROXY: "1" },
      })

      expect(JSON.parse(stdout)).toMatchObject({
        ok: true,
        status: "planned",
        command: "setup",
        executed: false,
      })
      await expect(readFile(sentinelPath, "utf8")).resolves.toBe("[user]\nkeep = \"real-grok-config\"\n")
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test("root npm run setup -- --run remains the explicit Grok install path", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-npm-setup-run-home."))

    try {
      const { stdout } = await execFileAsync("npm", ["run", "--silent", "setup", "--", "--run"], {
        env: { ...process.env, HOME: home, LFG_DISABLE_DEFAULT_MODELS_PROXY: "1" },
      })

      const result = JSON.parse(stdout) as { readonly executed?: boolean; readonly status?: string }
      expect(result).toMatchObject({ executed: true, status: "installed" })
      await expect(readFile(join(home, ".grok", "installed-plugins", "lfg", "lfg-install.json"), "utf8")).resolves.toContain(
        "@islee23520/lfg",
      )
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test("root npm run setup -- --run preserves existing Grok setup assets while syncing discovered config", async () => {
    await withModelServer(["grok-3-mini-fast", "gpt-5.4-mini", "gpt-5.5"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-npm-setup-existing-home."))
      const pluginRoot = join(home, ".grok", "installed-plugins", "lfg")
      const configPath = join(home, ".grok", "config.toml")
      const agentPath = join(home, ".grok", "agents", "explorer.toml")
      await mkdir(join(home, ".grok", "installed-plugins"), { recursive: true })
      await mkdir(join(home, ".grok", "agents"), { recursive: true })
      await cp(fixtureRoot, pluginRoot, { recursive: true })
      await writeFile(join(pluginRoot, "lfg-install.json"), '{"packageName":"@islee23520/lfg","version":"existing"}\n', "utf8")
      await writeFile(configPath, '[lazycodex.models]\ndefault = "user-kept-model"\n', "utf8")
      await writeFile(agentPath, 'model = "user-kept-agent"\n', "utf8")

      try {
        const { stdout } = await execFileAsync("npm", ["run", "--silent", "setup", "--", "--run", "--base-url", baseUrl], {
          env: { ...process.env, HOME: home },
        })

        const result = JSON.parse(stdout) as { readonly preservedExistingSetup?: boolean; readonly configUpdated?: boolean }
        expect(result.preservedExistingSetup).toBe(true)
        expect(result.configUpdated).toBe(true)
        await expect(readFile(configPath, "utf8")).resolves.toContain('default = "gpt-5.4-mini"')
        await expect(readFile(agentPath, "utf8")).resolves.toContain('model = "user-kept-agent"')
      } finally {
        await rm(home, { recursive: true, force: true })
      }
    })
  })

  test("root npm run setup exposes a gpt-centered preset plan", async () => {
    await withModelServer(["grok-3-mini-fast", "gpt-5.4-mini", "gpt-5.5"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-npm-setup-preset-home."))
      try {
        const { stdout } = await execFileAsync("npm", ["run", "--silent", "setup", "--", "--preset", "gpt", "--base-url", baseUrl], {
          env: { ...process.env, HOME: home },
        })
        const result = JSON.parse(stdout) as {
          readonly selectedPreset?: string
          readonly modelDiscovery?: { readonly mapping?: { readonly default?: string; readonly reasoning?: string } }
        }
        expect(result.selectedPreset).toBe("gpt")
        expect(result.modelDiscovery?.mapping).toMatchObject({ default: "gpt-5.4-mini", reasoning: "gpt-5.5" })
      } finally {
        await rm(home, { recursive: true, force: true })
      }
    })
  })
})

async function withModelServer(modelIds: readonly string[], run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.url !== "/v1/models") {
      response.writeHead(404, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: "not found" }))
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
        if (error) reject(error)
        else resolve()
      })
    })
  }
}
