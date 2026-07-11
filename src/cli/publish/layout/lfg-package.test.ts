import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { npmFixtureEnv, withNpmPackLock } from "../pack/npm-pack-mutex"

describe("lfg package contract", () => {
  test("package metadata stays publishable to npm public registry", async () => {
    const root = JSON.parse(await readFile(new URL("../../../../package.json", import.meta.url), "utf8")) as Record<string, unknown>

    expect(root).not.toHaveProperty("private")
    expect(root.publishConfig).toEqual({ access: "public" })
    expect(root.bin).toEqual({ lfg: "bin/lfg.js" })
    expect(root.files).toEqual(["bin", "dist", "skills", "README.md", "AGENTS.md", "src/AGENTS.md"])
    expect(root.scripts).toMatchObject({
      setup: "sh bin/lfg.js setup",
      test: "npm run build && vitest run src/cli/*.test.ts src/cli/**/*.test.ts src/core/*.test.ts src/core/**/*.test.ts src/grok/*.test.ts src/grok/**/*.test.ts --exclude src/grok/skills/**/*.test.ts",
      "self-test": "npm run build && node dist/self-test.js",
      typecheck: "tsc --noEmit",
      build: "node scripts/build.mjs",
      prepublishOnly: "npm run verify",
      prepack: "npm run build",
      "assert-pack": "npm run build && node scripts/assert-npm-pack-bin.mjs",
      "assert-omo-parity": "npm run build && node scripts/assert-omo-parity.mjs",
      verify: "npm run assert-pack && npm run assert-omo-parity && npm test && npm run typecheck && npm run self-test",
      "pre-publish-check": "npm run build && node scripts/pre-publish-check.mjs",
      "record-publish-gap": "npm run build && node scripts/record-publish-gap.mjs",
      "assert-publish-auth": "npm run build && node scripts/assert-npm-publish-auth.mjs",
    })
    expect((root as { name?: string }).name).toBe("@islee23520/lfg")
    expect(String(root.description)).toContain("GrokBuild port")
    expect(String(root.description)).toContain("Grok Build plugin payload")
    expect(String(root.description)).toContain("~/.grok/plugins/lfg")
    expect(root.scripts).not.toHaveProperty("postinstall")
    expect(root).not.toHaveProperty("workspaces")
  })

  test("package metadata exposes a single npx runnable lfg bin", async () => {
    const parsed = JSON.parse(await readFile(new URL("../../../../package.json", import.meta.url), "utf8")) as Record<string, unknown>
    const root = JSON.parse(await readFile(new URL("../../../../package.json", import.meta.url), "utf8")) as { readonly version?: string }

    expect(parsed.name).toBe("@islee23520/lfg")
    expect(parsed.version).toBe(root.version)
    expect(parsed.description).toContain("GrokBuild port")
    expect(parsed.description).toContain("Grok Build plugin payload")
    expect(parsed.description).not.toContain("@islee23520/lfp setup")
    expect(parsed.bin).toEqual({ lfg: "bin/lfg.js" })
    expect(parsed).not.toHaveProperty("exports")
    expect(JSON.stringify(parsed)).not.toContain("plugin runtime")
    expect(JSON.stringify(parsed)).not.toContain("bunx")
  })

  test("README explains the single install-helper purpose in English", async () => {
    const readme = await readFile(new URL("../../../../README.md", import.meta.url), "utf8")

    expect(readme).toContain("GrokBuild port")
    expect(readme).toContain("OpenCode OmO / lazycodex")
    expect(readme).toContain("npx @islee23520/lfg setup")
    expect(readme).toContain("~/.grok")
    expect(readme).toContain(".")
    expect(readme).toContain("omo/lazycodex Grok Build plugin")
    expect(readme).not.toContain("npx @islee23520/lfp setup")
    expect(readme).toContain("OpenAI-compatible base URL")
    expect(readme).toContain("/v1/models")
    expect(readme).toContain("When to run what")
    expect(readme).not.toContain("UltraWork Loop")
    expect(readme).not.toContain("doctor")
    expect(readme).not.toContain("dry-setup")
    expect(readme).not.toContain("bunx")
  })

  test("packed package excludes source files and ships only runnable assets", async () => {
    const files = await packDryRunFilePaths()

    expect(files).toContain("package.json")
    expect(files).toContain("bin/lfg.js")
    expect(files).toContain("README.md")
    expect(files).toContain("dist/lfg.js")
    expect(files).toContain("dist/self-test.js")
    expect(files).not.toContain("skills/lazycodex/SKILL.md")
    expect(files).toContain("skills/ulw-plan/references/full-workflow.md")
    expect(files).toContain("skills/ulw-plan/scripts/scaffold-plan.mjs")
    expect(files).toContain("skills/ulw-loop/references/full-workflow.md")
    expect(files).toContain("skills/rules/SKILL.md")
    expect(files).toContain("skills/lsp/SKILL.md")
    expect(files).toContain("skills/review-work/SKILL.md")
    expect(files).toContain("skills/ultimate-browsing/SKILL.md")
    expect(files).toContain("skills/ultimate-browsing/engine/__main__.py")
    expect(files).toContain("skills/visual-qa/SKILL.md")
    expect(files).toContain("skills/lfg-doctor/SKILL.md")
    expect(files).not.toContain("skills/lcx-doctor/SKILL.md")
    expect(files).toContain("skills/.lfg-omo-skill-sync.json")
    expect(files).not.toContain("src/cli/lfg")
    expect(files).not.toContain("src/cli/command/lfg.ts")
    expect(files).not.toContain("src/cli/setup/lfg-installer.ts")
    expect(files).not.toContain(".npmignore")
    expect(files).not.toContain(".omo/artifacts/ulw-qa-main-setup-only.txt")
    expect(files).not.toContain(".lfg")
  }, 60_000)

  test("npm pack tarball exposes lfg bin and setup works from npm install layout", async () => {
    const packDir = await mkdtemp(join(tmpdir(), "lfg-pack-out-"))
    const pack = await withNpmPackLock(() => execFileResult("npm", ["pack", "--pack-destination", packDir, "--json"]))
    expect(pack.exitCode).toBe(0)
    const packs = JSON.parse(pack.stdout) as readonly { readonly filename?: string }[]
    const tarball = join(packDir, packs[0]?.filename ?? "")
    expect(tarball).toMatch(/\.tgz$/)
    const installDir = await mkdtemp(join(tmpdir(), "lfg-npm-pack-"))
    const init = await execFileResult("npm", ["init", "-y"], installDir)
    expect(init.exitCode).toBe(0)
    const install = await execFileResult("npm", ["install", tarball], installDir)
    expect(install.exitCode).toBe(0)
    const installedPkg = JSON.parse(
      await readFile(join(installDir, "node_modules", "@islee23520", "lfg", "package.json"), "utf8"),
    ) as { readonly bin?: { readonly lfg?: string } }
    expect(installedPkg.bin?.lfg).toBe("bin/lfg.js")
    const shimOnDisk = join(installDir, "node_modules", "@islee23520", "lfg", "bin", "lfg.js")
    await expect(readFile(shimOnDisk, "utf8")).resolves.toContain("../dist/lfg.js")
    const nestedWorkspacePkg = join(installDir, "node_modules", "@islee23520", "lfg", "plugins", "lfg", "package.json")
    await expect(readFile(nestedWorkspacePkg, "utf8")).rejects.toThrow()
    const home = await mkdtemp(join(tmpdir(), "lfg-npm-pack-home-"))
    const setup = await execFileResultEnv("npx", ["lfg", "--json", "setup"], installDir, { HOME: home })
    expect(setup.exitCode).toBe(0)
    const json = JSON.parse(setup.stdout) as { readonly ok?: boolean; readonly command?: string; readonly selectedPreset?: string }
    expect(json.ok).toBe(true)
    expect(json.command).toBe("setup")
    expect(json.selectedPreset).toBe("auto")
    const scopedDoctor = await execFileResultEnv(
      "npx",
      ["@islee23520/lfg", "--json", "setup", "--preset", "gpt"],
      installDir,
      { HOME: home },
    )
    expect(scopedDoctor.exitCode).toBe(0)
    const scopedJson = JSON.parse(scopedDoctor.stdout) as { readonly ok?: boolean; readonly command?: string; readonly selectedPreset?: string }
    expect(scopedJson.ok).toBe(true)
    expect(scopedJson.command).toBe("setup")
    expect(scopedJson.selectedPreset).toBe("gpt")
    const doctor = await execFileResultEnv("npx", ["lfg", "--json", "doctor"], installDir, { HOME: home })
    expect(doctor.exitCode).toBe(1)
    const unsupported = JSON.parse(doctor.stdout) as { readonly ok?: boolean; readonly code?: string; readonly supportedCommands?: readonly string[] }
    expect(unsupported).toMatchObject({ ok: false, code: "unsupported_command", supportedCommands: ["setup", "xai", "zai", "mcp", "ulw", "ulw-loop", "codex"] })
    await rm(installDir, { recursive: true, force: true })
    await rm(packDir, { recursive: true, force: true })
  }, 120_000)
})

async function packDryRunFilePaths(): Promise<readonly string[]> {
  const result = await withNpmPackLock(() => execFileResult("npm", ["pack", "--dry-run", "--json"]))
  expect(result.exitCode).toBe(0)
  const parsed = JSON.parse(result.stdout) as readonly { readonly files?: readonly { readonly path?: string }[] }[]
  return parsed.flatMap((pack) => pack.files?.map((file) => file.path).filter((path): path is string => typeof path === "string") ?? [])
}

function execFileResult(file: string, args: readonly string[], cwd = process.cwd()): Promise<{ readonly exitCode: number; readonly stdout: string }> {
  return execFileResultEnv(file, args, cwd, {})
}

function execFileResultEnv(
  file: string,
  args: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>>,
): Promise<{ readonly exitCode: number; readonly stdout: string }> {
  return new Promise((resolve) => {
    execFile(file, [...args], { cwd, env: npmFixtureEnv(env) }, (error, stdout) => {
      const exitCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : 0
      resolve({ exitCode, stdout })
    })
  })
}
