import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"
import { npmFixtureEnv, withNpmPackLock } from "./npm-pack-mutex"

const execFileAsync = promisify(execFile)
const ROOT = fileURLToPath(new URL("../../../", import.meta.url))

describe("npm pack contract (#22)", () => {
  test("dry-run ships bin at root package.json path, not nested package.json", async () => {
    const { stdout } = await withNpmPackLock(() =>
      execFileAsync("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8", env: npmFixtureEnv() }),
    )
    const packs = JSON.parse(stdout) as readonly { readonly files?: readonly { readonly path?: string }[] }[]
    const paths = packs.flatMap((p) => p.files?.map((f) => f.path).filter((x): x is string => typeof x === "string") ?? [])
    expect(paths).toContain("package.json")
    expect(paths).toContain("bin/lfg.js")
    expect(paths).toContain("dist/lfg.js")
    expect(paths).toContain("dist/self-test.js")
    expect(paths).toContain("README.md")
    expect(paths).toContain("src/AGENTS.md")
    expect(paths.some((p) => p.startsWith("skills/"))).toBe(true)
    expect(paths).not.toContain("src/cli/command/lfg.ts")
    expect(paths.length).toBeLessThanOrEqual(700)
    expect(paths).toContain("dist/npm-publish-auth.js")
    expect(paths).toContain("dist/npm-registry-version.js")
    expect(paths).toContain("dist/npm-publish-bin.js")
    expect(paths).toContain("dist/npm-registry-bin.js")
    expect(paths).toContain("dist/publish-readiness.js")
    expect(paths).toContain("dist/grok-install/fixture/hooks/hooks.json")
    expect(paths.some((p) => p.includes("lfg-grok-hook-bridge.mjs") || p.includes("hook-bridge"))).toBe(true)
    expect(paths.some((p) => p.startsWith("skills/") && (p.includes("ulw") || p.includes("ultrawork")))).toBe(true)
    expect(paths).toContain("skills/ulw-plan/references/full-workflow.md")
    expect(paths).toContain("skills/ulw-plan/scripts/scaffold-plan.mjs")
    expect(paths).toContain("skills/ulw-loop/references/full-workflow.md")
    expect(paths).toContain("skills/rules/SKILL.md")
    expect(paths).toContain("skills/lsp/SKILL.md")
    expect(paths).toContain("skills/review-work/SKILL.md")
    expect(paths).toContain("skills/visual-qa/SKILL.md")
    expect(paths).toContain("skills/lfg-doctor/SKILL.md")
    expect(paths).not.toContain("skills/lcx-doctor/SKILL.md")
    expect(paths).toContain("skills/.lfg-omo-skill-sync.json")
    expect(paths).toContain("dist/grok-install/skills/.lfg-omo-skill-sync.json")
    expect(paths).toContain("dist/grok-install/assets/lfg-grok-hook-bridge.mjs") // bridge fallback surface
  }, 60_000)

  test("dry-run pack filename uses scoped package name and semver (#22)", async () => {
    const { stdout } = await withNpmPackLock(() =>
      execFileAsync("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8", env: npmFixtureEnv() }),
    )
    const packs = JSON.parse(stdout) as readonly { readonly filename?: string }[]
    const root = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as { version: string }
    expect(packs[0]?.filename).toMatch(new RegExp(`islee23520-lfg-${root.version.replace(/\./g, "\\.")}\\.tgz`))
  }, 60_000)

  test("root package.json bin.lfg points at shim under src", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      readonly bin?: { readonly lfg?: string }
      readonly files?: readonly string[]
    }
    expect(pkg.bin?.lfg).toBe("bin/lfg.js")
    expect(pkg.files).toContain("bin")
    expect(pkg.files).toContain("dist")
  })
})
