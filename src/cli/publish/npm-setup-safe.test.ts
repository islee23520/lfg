import { execFile, spawn } from "node:child_process"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const execFileAsync = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const fixtureRoot = join(here, "..", "..", "grok", "fixture")

describe("npm setup script safety", () => {
  test("root npm run setup opens the guided setup flow by default without mutating before confirmation", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-npm-setup-safe-home."))
    const sentinelPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(sentinelPath, "[user]\nkeep = \"real-grok-config\"\n", "utf8")

    try {
      const result = await runNpmSetup([], "\n\nn\n", {
        HOME: home,
        LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("oMoMoMoMo... lfg setup")
      expect(result.stdout).toContain("[1/5] Discovering Grok model endpoint")
      expect(result.stdout).toContain("[3/5] Reviewing install plan")
      expect(result.stdout).toContain("Install now? [y/N]")
      expect(result.stdout).toContain("Installation cancelled. Nothing was changed.")
      expect(result.stdout).not.toContain("{\n")
      await expect(readFile(sentinelPath, "utf8")).resolves.toBe("[user]\nkeep = \"real-grok-config\"\n")
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test("root npm run setup -- --run remains the explicit Grok install path", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-npm-setup-run-home."))

    try {
      const { stdout } = await execFileAsync("npm", ["run", "--silent", "setup", "--", "--json", "--run"], {
        env: { ...process.env, HOME: home, LFG_DISABLE_DEFAULT_MODELS_PROXY: "1" },
      })

      const result = JSON.parse(stdout) as { readonly executed?: boolean; readonly status?: string }
      expect(result).toMatchObject({ executed: true, status: "installed" })
      // Accept native Grok path or legacy installed-plugins
      const native = join(home, ".grok", "plugins", "lfg", "lfg-install.json")
      const legacy = join(home, ".grok", "plugins", "lfg", "lfg-install.json")
      await expect(readFile(native, "utf8").catch(() => readFile(legacy, "utf8"))).resolves.toContain("@islee23520/lfg")
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test("root npm run setup -- --run preserves existing Grok setup assets while syncing discovered config", async () => {
    await withModelServer(["grok-3-mini-fast", "gpt-5.4-mini", "gpt-5.5"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-npm-setup-existing-home."))
      const pluginRoot = join(home, ".grok", "plugins", "lfg")
      const configPath = join(home, ".grok", "config.toml")
      const agentPath = join(home, ".grok", "agents", "explorer.toml")
      await mkdir(join(home, ".grok", "plugins"), { recursive: true })
      await mkdir(join(home, ".grok", "agents"), { recursive: true })
      await cp(fixtureRoot, pluginRoot, { recursive: true })
      await writeFile(join(pluginRoot, "lfg-install.json"), '{"packageName":"@islee23520/lfg","version":"existing"}\n', "utf8")
      await writeFile(configPath, '[lazycodex.models]\ndefault = "user-kept-model"\n', "utf8")
      await writeFile(agentPath, 'model = "user-kept-agent"\n', "utf8")

      try {
        const { stdout } = await execFileAsync("npm", ["run", "--silent", "setup", "--", "--json", "--run", "--base-url", baseUrl], {
          env: { ...process.env, HOME: home },
        })

        const result = JSON.parse(stdout) as {
          readonly preservedExistingSetup?: boolean
          readonly configUpdated?: boolean
          readonly agentOverridesPath?: string | null
          readonly agentPaths?: readonly string[]
        }
        expect(result.preservedExistingSetup).toBe(true)
        expect(result.configUpdated).toBe(true)
        expect(result.agentOverridesPath).toBe(join(home, ".grok", "omo-agent-overrides.json"))
        expect(result.agentPaths?.length).toBeGreaterThanOrEqual(1)
        const configText = await readFile(configPath, "utf8")
        expect(configText).toContain('default = "gpt-5.5"')
        expect(configText).toContain('fast = "grok-3-mini-fast"')
        await expect(readFile(agentPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
        await expect(readFile(join(home, ".grok", "agents-toml-backup-lfg", "explorer.toml"), "utf8")).resolves.toContain(
          'model = "user-kept-agent"',
        )
        await expect(readFile(join(home, ".grok", "roles", "explorer.toml"), "utf8")).resolves.toContain('model = "grok-3-mini-fast"')
        await expect(readFile(join(home, ".grok", "plugins", "lfg", "agents", "explorer.md"), "utf8")).resolves.toContain(
          "name: explorer",
        )
      } finally {
        await rm(home, { recursive: true, force: true })
      }
    })
  })

  test("root npm run setup -- --json exposes an explicit gpt-centered preset plan", async () => {
    await withModelServer(["grok-3-mini-fast", "gpt-5.4-mini", "gpt-5.5"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-npm-setup-preset-home."))
      try {
        const { stdout } = await execFileAsync("npm", ["run", "--silent", "setup", "--", "--json", "--preset", "gpt", "--base-url", baseUrl], {
          env: { ...process.env, HOME: home },
        })
        const result = JSON.parse(stdout) as {
          readonly selectedPreset?: string
          readonly modelDiscovery?: { readonly mapping?: { readonly default?: string; readonly reasoning?: string } }
        }
        expect(result.selectedPreset).toBe("gpt")
        expect(result.modelDiscovery?.mapping).toMatchObject({ default: "gpt-5.5", reasoning: "gpt-5.5" })
      } finally {
        await rm(home, { recursive: true, force: true })
      }
    })
  })
})

type NpmSetupResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

function runNpmSetup(
  args: readonly string[],
  inputText: string,
  env: Readonly<Record<string, string>>,
): Promise<NpmSetupResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "--silent", "setup", "--", ...args], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.on("error", reject)
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      })
    })
    child.stdin.end(inputText)
  })
}

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
