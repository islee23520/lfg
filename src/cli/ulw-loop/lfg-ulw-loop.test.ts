import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { dispatchUlwLoopArgv } from "./lfg-ulw-loop"

const temps: string[] = []
const SESSION_ENV = [
  "OMO_ULW_LOOP_SESSION_ID",
  "LFG_ULW_LOOP_SESSION_ID",
  "GROK_SESSION_ID",
  "CODEX_SESSION_ID",
  "CODEX_THREAD_ID",
] as const

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("lfg ulw-loop CLI", () => {
  test("help exits 0 and mentions durable state", async () => {
    const chunks: string[] = []
    const orig = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      const code = await dispatchUlwLoopArgv(["help"])
      expect(code).toBe(0)
      expect(chunks.join("")).toContain("lfg ulw-loop")
      expect(chunks.join("")).toContain(".omo/ulw-loop")
    } finally {
      process.stdout.write = orig
    }
  })

  test("create-goals writes plan under .omo/ulw-loop", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-ulw-loop-"))
    temps.push(root)
    const prev = process.cwd()
    const saved = Object.fromEntries(SESSION_ENV.map((k) => [k, process.env[k]]))
    for (const k of SESSION_ENV) delete process.env[k]
    process.chdir(root)
    try {
      const code = await dispatchUlwLoopArgv([
        "ulw-loop",
        "create-goals",
        "--brief",
        "Ship durable ulw-loop CLI on Grok via lfg",
        "--json",
      ])
      expect(code).toBe(0)
      const goals = JSON.parse(await readFile(join(root, ".omo", "ulw-loop", "goals.json"), "utf8"))
      expect(goals.version).toBe(1)
      expect(Array.isArray(goals.goals)).toBe(true)
      expect(goals.goals.length).toBeGreaterThan(0)
      await expect(readFile(join(root, ".omo", "ulw-loop", "brief.md"), "utf8")).resolves.toContain(
        "Ship durable ulw-loop CLI",
      )
      await expect(readFile(join(root, ".omo", "ulw-loop", "ledger.jsonl"), "utf8")).resolves.toContain("plan_created")
    } finally {
      process.chdir(prev)
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  })
})
