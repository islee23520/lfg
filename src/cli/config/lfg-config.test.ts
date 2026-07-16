import { mkdtemp, readFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg } from "../test/test-process"

describe("lfg Grok model config", () => {
  test("persists only endpoint discovery metadata to grok config", async () => {
    await withModelServer(["grok-3-mini", "grok-4.20-0309-reasoning", "codex-auto-review"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], { HOME: home, OPENAI_API_KEY: "sk-test" })
      expect(result.exitCode, JSON.stringify(result.json)).toBe(0)
      const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
      expect(result.json).toMatchObject({ ok: true, status: "installed", configUpdated: true })
      expect(config).toContain("[endpoints]")
      expect(config).toContain(`models_base_url = "${baseUrl}/v1"`)
      expect(config).not.toContain("[omo.models]")
      expect(config).not.toContain("[model.")
    })
  })

  test("setup --run with auto discovery from --base-url writes grok config", async () => {
    const apiKey = "sk-lfg-interactive"
    await withModelServer(["grok-3-mini", "grok-4.20-0309-reasoning"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], {
        HOME: home,
        OPENAI_API_KEY: apiKey,
      })
      const config = await readFile(join(home, ".grok", "config.toml"), "utf8")

      expect(result.exitCode).toBe(0)
      expect(result.json).toMatchObject({ ok: true, status: "installed" })
      expect(config).toContain(`models_base_url = "${baseUrl}/v1"`)
      expect(config).not.toContain("[omo.models]")
      expect(config).not.toContain("[model.")
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
