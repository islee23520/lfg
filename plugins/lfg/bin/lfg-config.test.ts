import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg, runLfgText } from "./test-process"

describe("lfg Grok model config", () => {
  test("persists discovered models to grok config after setup run succeeds", async () => {
    await withModelServer(["grok-3-mini", "grok-4.20-0309-reasoning", "codex-auto-review"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const fakeBin = await makeFakeNpx(0)
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })
      const config = await readFile(join(home, ".grok", "config.toml"), "utf8")

      expect(result.exitCode).toBe(0)
      expect(result.json).toMatchObject({ ok: true, status: "installed", configUpdated: true })
      expect(config).toContain("[endpoints]")
      expect(config).toContain(`models_base_url = "${baseUrl}/v1"`)
      expect(config).toContain("[lazycodex.models]")
      expect(config).toContain('default = "grok-3-mini"')
      expect(config).toContain('reasoning = "grok-4.20-0309-reasoning"')
      expect(config).toContain('coding = "codex-auto-review"')
    })
  })

  test("does not persist discovered models when setup run fails", async () => {
    await withModelServer(["grok-3-mini"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const fakeBin = await makeFakeNpx(7)
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

      expect(result.exitCode).toBe(1)
      expect(result.json).toMatchObject({ ok: false, status: "install_failed" })
      await expect(readFile(join(home, ".grok", "config.toml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    })
  })

  test("interactive setup writes grok config after confirmed install", async () => {
    await withModelServer(["grok-3-mini", "grok-4.20-0309-reasoning"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const fakeBin = await makeFakeNpx(0)
      const result = await runLfgText(["setup"], `${baseUrl}\nn\ny\n`, { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })
      const config = await readFile(join(home, ".grok", "config.toml"), "utf8")

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Updated ~/.grok/config.toml")
      expect(config).toContain(`models_base_url = "${baseUrl}/v1"`)
      expect(config).toContain('default = "grok-3-mini"')
      expect(config).toContain('reasoning = "grok-4.20-0309-reasoning"')
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

async function makeFakeNpx(exitCode: number): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "lfg-fake-npx."))
  const body =
    exitCode === 0
      ? "case \"$*\" in *lazycodex-ai*) echo fake lazycodex install: $* ;; *@islee23520/lfp*) echo unexpected lfp npx: $* >&2; exit 2 ;; *) echo unexpected npx: $* >&2; exit 2 ;; esac"
      : "echo fake lazycodex failure: $* >&2"
  await writeFile(join(bin, "npx"), `#!/usr/bin/env bash\n${body}\nexit ${exitCode}\n`)
  await chmod(join(bin, "npx"), 0o755)
  return bin
}
