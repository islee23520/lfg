import { mkdir, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { resolveSetupDiscovery } from "./resolve-setup-discovery"

describe("resolveSetupDiscovery", () => {
  test("uses [endpoints].models_base_url from config when CLI omits --base-url", async () => {
    await withModelServer(["grok-3-mini"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-resolve."))
      await mkdir(join(home, ".grok"), { recursive: true })
      await writeFile(join(home, ".grok", "config.toml"), `[endpoints]\nmodels_base_url = "${baseUrl}/v1"\n`, "utf8")
      const resolved = await resolveSetupDiscovery({ home, cliBaseUrl: null })
      expect(resolved.baseUrlSource).toBe("config")
      expect(resolved.discovery?.mapping.default).toBe("grok-3-mini")
    })
  })

  test("host-auth-only mode ignores stale config proxy when CLI omits --base-url", async () => {
    await withModelServer(["gpt-5.5"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-resolve-host-only."))
      await mkdir(join(home, ".grok"), { recursive: true })
      await writeFile(join(home, ".grok", "config.toml"), `[endpoints]\nmodels_base_url = "${baseUrl}/v1"\n`, "utf8")
      const resolved = await resolveSetupDiscovery({ home, cliBaseUrl: null, hostAuthOnly: true })
      expect(resolved).toMatchObject({
        discovery: null,
        baseUrlUsed: null,
        baseUrlSource: "none",
        autoDiscovered: false,
      })
    })
  })
})

async function withModelServer(modelIds: readonly string[], run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.url !== "/v1/models") {
      response.writeHead(404)
      response.end()
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ data: modelIds.map((id) => ({ id })) }))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (typeof address !== "object" || address === null) {
    server.close()
    throw new Error("no address")
  }
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  }
}
