/**
 * Live-style check: install into temp HOME (mock /v1/models) then grok inspect sees explorer.
 * Run: npx vitest run src/cli/fast-tier-grok-live.test.ts
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { execFile, spawnSync } from "node:child_process"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"

import { runLazycodexInstaller } from "./lfg-installer"
import { resolveFastModelId, serviceTierFromChoice } from "./resolve-tier-model"

const execFileAsync = promisify(execFile)

const GROK_BIN = process.env.GROK_BIN ?? "grok"

/** A "live" test — only meaningful when the `grok` CLI is on PATH (CI runners lack it). */
function grokBinaryAvailable(bin: string): boolean {
  const result = spawnSync(bin, ["--version"], { timeout: 3000, encoding: "utf8" })
  if (result.error) {
    return (result.error as NodeJS.ErrnoException).code !== "ENOENT"
  }
  return true
}

describe.skipIf(!grokBinaryAvailable(GROK_BIN))("fast tier → Grok-visible explorer model (live harness)", () => {
  test("install writes grok-3-mini-fast to roles/overrides; grok inspect lists lfg:explorer", async () => {
    const modelIds = ["grok-3-mini", "grok-3-mini-fast", "grok-4.20-0309-reasoning", "gpt-5.3-codex-spark"] as const
    await withModelServer(modelIds, async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-fast-tier-grok-"))
      try {
        const pickedMini = "grok-3-mini"
        const tier = "fast"
        const resolvedModel = resolveFastModelId(modelIds, pickedMini, "grok-3-mini-fast")
        expect(resolvedModel).toBe("grok-3-mini-fast")

        const discovery = {
          baseUrl,
          modelsUrl: `${baseUrl}/v1/models`,
          modelIds: [...modelIds],
          mapping: {
            default: "grok-3-mini",
            fast: "grok-3-mini-fast",
            reasoning: "grok-4.20-0309-reasoning",
            coding: "gpt-5.3-codex-spark",
          },
          agentConfig: {
            explorer: { model: resolvedModel, reasoningLevel: "low" as const, serviceTier: serviceTierFromChoice(tier) },
            reasoning: { model: "grok-4.20-0309-reasoning", reasoningLevel: "high" as const },
            coding: { model: "gpt-5.3-codex-spark", reasoningLevel: "medium" as const },
          },
          agentOverrideMap: {
            explorer: {
              model: resolvedModel,
              reasoningLevel: "low" as const,
              serviceTier: serviceTierFromChoice(tier),
            },
          },
        }

        const prevHome = process.env.HOME
        process.env.HOME = home
        try {
          const result = await runLazycodexInstaller(discovery, { force: true })
          expect(result.ok).toBe(true)

          const roleToml = await readFile(join(home, ".grok", "roles", "explorer.toml"), "utf8")
          expect(roleToml).toContain('model = "grok-3-mini-fast"')
          expect(roleToml).toContain('service_tier = "fast"')

          const overridesRaw = await readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")
          expect(overridesRaw).toContain("grok-3-mini-fast")
          expect(overridesRaw).toContain('"service_tier": "fast"')

          let inspectStdout = ""
          try {
            const { stdout } = await execFileAsync(GROK_BIN, ["inspect", "--json"], {
              env: { ...process.env, HOME: home, GROK_HOME: join(home, ".grok") },
              maxBuffer: 8 * 1024 * 1024,
            })
            inspectStdout = stdout
          } catch (error) {
            const err = error as { stdout?: string; stderr?: string; message?: string }
            inspectStdout = err.stdout ?? ""
            if (inspectStdout.length === 0) {
              throw new Error(`grok inspect failed (set GROK_BIN if needed): ${err.message ?? error}\n${err.stderr ?? ""}`)
            }
          }

          expect(inspectStdout).toMatch(/lfg:explorer|explorer\.md/i)
        } finally {
          process.env.HOME = prevHome
        }
      } finally {
        await rm(home, { recursive: true, force: true })
      }
    })
  }, 120_000)
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
    await run(`http://127.0.0.1:${address.port}/v1`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }
}
