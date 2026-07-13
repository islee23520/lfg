import { execFile } from "node:child_process"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"

const execFileAsync = promisify(execFile)
const ROOT = process.cwd()

describe("pre-publish-check integration (#22)", () => {
  test("exits 2 with gap.publishReady and auth blocked when not logged in", async () => {
    const script = join(ROOT, "scripts/pre-publish-check.mjs")
    try {
      await execFileAsync("node", [script], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, LFG_NPM_WHOAMI: "" },
      })
      expect.fail("expected exit 2")
    } catch (error: unknown) {
      const err = error as { code?: number; stdout?: string }
      expect(err.code).toBe(2)
      const payload = JSON.parse(String(err.stdout)) as {
        ready: boolean
        gap: { publishReady: boolean; hasBin: boolean }
        auth: { ok: boolean; blockedReason?: string | null }
        registryBin?: { legacyWrongTarget?: boolean; matchesPublishContract?: boolean; binLfg?: string | null }
      }
      expect(payload.ready).toBe(false)
      expect(payload.ready).toBe(payload.gap.publishReady && payload.auth.ok)
      expect(payload.gap.hasBin).toBe(true)
      expect(typeof payload.gap.publishReady).toBe("boolean")
      expect(payload.auth.ok).toBe(false)
      const gap = payload.gap as { packageName?: string; localVersion?: string; registryVersion?: string }
      expect(gap.packageName).toBe("@islee23520/lfg")
      expect(gap.localVersion).toMatch(/^\d+\.\d+\.\d+$/)
      const rootPkg = JSON.parse(
        await (await import("node:fs/promises")).readFile(
          join(ROOT, "package.json"),
          "utf8",
        ),
      ) as { version: string }
      expect(gap.localVersion).toBe(rootPkg.version)
      expect(gap.registryVersion).toMatch(/^\d+\.\d+\.\d+$|unavailable/)
      if (payload.registryBin?.binLfg === "bin/lfg.js") {
        expect(payload.registryBin.matchesPublishContract).toBe(true)
      } else {
        expect(payload.registryBin?.legacyWrongTarget).toBe(true)
      }
      expect(payload.auth.blockedReason).toContain("npm login")
    }
  }, 30_000)

  test("node scripts/pre-publish-check.mjs exits 2 when not logged in (#22)", async () => {
    try {
      await execFileAsync("node", ["scripts/pre-publish-check.mjs"], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, LFG_NPM_WHOAMI: "" },
      })
      expect.fail("expected exit 2")
    } catch (error: unknown) {
      const err = error as { code?: number; stdout?: string; stderr?: string }
      expect(err.code).toBe(2)
      const combined = `${err.stdout ?? ""}\n${err.stderr ?? ""}`
      expect(combined).toContain('"hasBin": true')
      expect(combined).toContain('"publishReady":')
      expect(combined).toContain('"legacyWrongTarget":')
    }
  }, 60_000)
})
