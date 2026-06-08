import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { runLfg, runLfgText } from "./test-process"

describe("lfg CLI", () => {
  test("package metadata stays publishable to npm public registry", async () => {
    const root = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8")) as Record<string, unknown>
    const workspace = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as Record<string, unknown>

    expect(root).not.toHaveProperty("private")
    expect(workspace).not.toHaveProperty("private")
    expect(root.publishConfig).toEqual({ access: "public" })
    expect(workspace.publishConfig).toEqual({ access: "public" })
    expect(root.bin).toEqual({ lfg: "plugins/lfg/lfg" })
    expect(root.files).toEqual(["plugins/lfg/AGENTS.md", "plugins/lfg/lfg", "plugins/lfg/README.md", "plugins/lfg/dist", "plugins/lfg/skills"])
    expect(root.scripts).toMatchObject({
      setup: "sh plugins/lfg/lfg setup",
      test: "npm run build && vitest run plugins/lfg/bin/*.test.ts plugins/lfg/grok-install/*.test.ts",
      "self-test": "npm run build && node plugins/lfg/dist/self-test.js",
      typecheck: "tsc --noEmit",
      build: "node scripts/build.mjs",
      prepublishOnly: "npm test",
      prepack: "npm run build",
      "assert-pack": "node scripts/assert-npm-pack-bin.mjs",
      verify: "npm run assert-pack && npm test && npm run typecheck && npm run self-test",
      "pre-publish-check": "npm run build && node scripts/pre-publish-check.mjs",
      "record-publish-gap": "npm run build && node scripts/record-publish-gap.mjs",
      "assert-publish-auth": "npm run build && node scripts/assert-npm-publish-auth.mjs",
    })
    expect(String(root.description)).toContain("grok-install")
    expect(root.scripts).not.toHaveProperty("postinstall")
    expect(workspace.scripts).toMatchObject({
      setup: "sh lfg setup",
      build: "node ../../scripts/build.mjs",
      test: "npm run build && vitest run ./bin/*.test.ts",
      typecheck: "tsc --noEmit -p tsconfig.json",
    })
    expect(workspace.scripts).not.toHaveProperty("postinstall")
  })

  test("package metadata exposes a single npx runnable lfg bin", async () => {
    const parsed = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as Record<string, unknown>

    expect(parsed.name).toBe("@islee23520/lfg")
    expect(parsed.version).toBe("0.1.4")
    expect(parsed.description).toContain("Grok Build adapter")
    expect(parsed.description).not.toContain("@islee23520/lfp setup")
    expect(parsed.bin).toEqual({ lfg: "lfg" })
    expect(parsed).not.toHaveProperty("exports")
    expect(JSON.stringify(parsed)).not.toContain("plugin runtime")
    expect(JSON.stringify(parsed)).not.toContain("bunx")
  })

  test("README explains the single install-helper purpose in English", async () => {
    const readme = await readFile(new URL("../README.md", import.meta.url), "utf8")

    expect(readme).toContain("What lfg does")
    expect(readme).toContain("npx @islee23520/lfg setup")
    expect(readme).toContain("npx lazycodex-ai install")
    expect(readme).toContain("grok-install")
    expect(readme).toContain("grok-adapter-parity")
    expect(readme).not.toContain("npx @islee23520/lfp setup")
    expect(readme).toContain("OpenAI-compatible base URL")
    expect(readme).toContain("/v1/models")
    expect(readme).toContain("not a plugin")
    expect(readme).not.toContain("UltraWork Loop")
    expect(readme).not.toContain("doctor")
    expect(readme).not.toContain("dry-setup")
    expect(readme).not.toContain("bunx")
  })

  test("packed package excludes source files and ships only runnable assets", async () => {
    const files = await packDryRunFilePaths()

    expect(files).toContain("package.json")
    expect(files).toContain("plugins/lfg/lfg")
    expect(files).toContain("plugins/lfg/README.md")
    expect(files).toContain("plugins/lfg/dist/lfg.js")
    expect(files).toContain("plugins/lfg/dist/self-test.js")
    expect(files).toContain("plugins/lfg/skills/lazycodex/SKILL.md")
    expect(files).toContain("plugins/lfg/skills/lfp/SKILL.md")
    expect(files).not.toContain("plugins/lfg/bin/lfg")
    expect(files).not.toContain("plugins/lfg/bin/lfg.ts")
    expect(files).not.toContain("plugins/lfg/bin/lfg-installer.ts")
    expect(files).not.toContain("plugins/lfg/package.json")
    expect(files).not.toContain(".npmignore")
    expect(files).not.toContain(".omo/artifacts/ulw-qa-main-setup-only.txt")
    expect(files).not.toContain(".lfg")
  })

  test("setup returns a non-mutating install plan by default", async () => {
    const result = await runLfg(["--json", "setup"], {})

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "planned",
      command: "setup",
      dryRun: false,
      executed: false,
      installerCommand: "npx lazycodex-ai install",
      lfpInstallerCommand: "@islee23520/lfg internal grok-install",
      companionPackage: "lfg-grok-install",
      packageExecutors: ["npx @islee23520/lfg"],
      lfgIsPlugin: false,
      modelDiscovery: {
        required: true,
        endpoint: "OpenAI-compatible /v1/models",
      },
    })
  })

  test("json setup can fetch OpenAI-compatible models and map them", async () => {
    await withModelServer(["gpt-4.1-mini", "o3-mini"], async (baseUrl) => {
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl], {})

      expect(result.exitCode).toBe(0)
      expect(result.json).toMatchObject({
        ok: true,
        status: "planned",
        modelDiscovery: {
          baseUrl,
          modelsUrl: `${baseUrl}/v1/models`,
          modelIds: ["gpt-4.1-mini", "o3-mini"],
          mapping: {
            default: "gpt-4.1-mini",
            fast: "gpt-4.1-mini",
            reasoning: "o3-mini",
            coding: "gpt-4.1-mini",
          },
        },
      })
    })
  })

  test("npm run setup reaches the setup command surface", async () => {
    const result = await execFileResult("npm", ["run", "--silent", "setup", "--", "--json"])

    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      status: "planned",
      command: "setup",
      installerCommand: "npx lazycodex-ai install",
      lfpInstallerCommand: "@islee23520/lfg internal grok-install",
    })
  })

  test("posix shell launcher works from a Korean cwd", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "한국어 삭제."))
    const syntax = await execFileResult("sh", ["-n", new URL("../lfg", import.meta.url).pathname])
    const result = await execFileResult("sh", [new URL("../lfg", import.meta.url).pathname, "--json", "setup"], cwd)

    expect(syntax.exitCode).toBe(0)
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      status: "planned",
      command: "setup",
    })
  })

  test("setup run is the only explicit installer execution surface", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const fakeBin = await makeFakeNpx(0)
    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "installed",
      command: "setup",
      executed: true,
      installerCommand: "npx lazycodex-ai install",
      lfpInstallerCommand: "@islee23520/lfg internal grok-install",
      installerArgs: ["lazycodex-ai", "install"],
      lfpInstallerArgs: [],
    })
    expect(JSON.stringify(result.json)).toContain("fake lazycodex install")
    expect(JSON.stringify(result.json)).toContain("internal grok install")
    const installers = (result.json as { installers?: readonly { packageName: string }[] }).installers
    expect(installers?.[1]).toMatchObject({ packageName: "lfg-grok-install", exitCode: 0 })
    const stampPath = join(home, ".grok", "installed-plugins", "lazycodex", "lfg-install.json")
    await expect(readFile(stampPath, "utf8")).resolves.toContain("@islee23520/lfg")
    expect(result.json).toMatchObject({
      postInstallVerify: { ok: true, status: "verified" },
    })
  })

  test("setup run passes fetched model mapping to the upstream installer", async () => {
    await withModelServer(["gpt-4.1-mini", "o3-mini"], async (baseUrl) => {
      const home = await mkdtemp(join(tmpdir(), "lfg-home."))
      const fakeBin = await makeFakeNpx(0)
      const result = await runLfg(["--json", "setup", "--base-url", baseUrl, "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

      expect(result.exitCode).toBe(0)
      expect(result.json).toMatchObject({
        ok: true,
        status: "installed",
        modelDiscovery: {
          baseUrl,
          mapping: {
            default: "gpt-4.1-mini",
            reasoning: "o3-mini",
          },
        },
      })
      expect(JSON.stringify(result.json)).toContain(`LAZYCODEX_OPENAI_BASE_URL=${baseUrl}`)
      expect(JSON.stringify(result.json)).toContain("LAZYCODEX_MODEL_DEFAULT=gpt-4.1-mini")
      expect(JSON.stringify(result.json)).toContain("LAZYCODEX_MODEL_REASONING=o3-mini")
    })
  })

  test("setup run reports installer failure", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const fakeBin = await makeFakeNpx(7)
    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(1)
    expect(result.json).toMatchObject({
      ok: false,
      status: "install_failed",
      command: "setup",
      executed: true,
      installerCommand: "npx lazycodex-ai install",
      exitCode: 7,
    })
    expect(JSON.stringify(result.json)).toContain("fake lazycodex failure")
    const installers = (result.json as { installers?: readonly unknown[] }).installers
    expect(installers?.length).toBe(1)
  })

  test("setup run does not invoke lfp npx on fake PATH", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const fakeBin = await makeFakeNpxRejectsLfp()
    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(JSON.stringify(result.json)).not.toContain("fake lfp")
    expect(JSON.stringify(result.json)).not.toContain("@islee23520/lfp")
  })

  test("interactive setup only confirms the upstream installer run", async () => {
    await withModelServer(["gpt-4.1-mini", "o3-mini"], async (baseUrl) => {
      const result = await runLfgText(["setup"], `${baseUrl}\nn\n`, {})

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("lfg setup")
      expect(result.stdout).toContain("OpenAI-compatible base URL")
      expect(result.stdout).toContain("Found 2 models")
      expect(result.stdout).toContain("reasoning: o3-mini")
      expect(result.stdout).toContain("npx lazycodex-ai install")
      expect(result.stdout).toContain("@islee23520/lfg internal grok-install")
      expect(result.stdout).toContain("Install now? [y/N]")
      expect(result.stdout).toContain("Skipped install")
      expect(result.stdout).not.toContain("Restore previous Grok settings")
    })
  })

  test("unsupported commands advertise setup and doctor", async () => {
    for (const legacy of [["--json", "dry-setup"], ["--json", "install"], ["--json", "setup", "show"]] as const) {
      const result = await runLfg(legacy)
      expect(result.exitCode).toBe(1)
      expect(result.json).toMatchObject({
        ok: false,
        status: "error",
        code: "unsupported_command",
        supportedCommands: ["setup", "doctor", "project-local"],
      })
    }
  })

  test("help advertises only setup", async () => {
    const result = await runLfgText(["help"], "", {})

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("lfg setup")
    expect(result.stdout).toContain("npx @islee23520/lfg setup")
    expect(result.stdout).not.toContain("dry-setup")
    expect(result.stdout).toContain("doctor")
    expect(result.stdout).not.toContain("bunx")
  })

  test("npm pack tarball exposes lfg bin and doctor passes from npm install layout", async () => {
    const packDir = await mkdtemp(join(tmpdir(), "lfg-pack-out-"))
    const pack = await execFileResult("npm", ["pack", "--pack-destination", packDir, "--json"])
    expect(pack.exitCode).toBe(0)
    const packs = JSON.parse(pack.stdout) as readonly { readonly filename?: string }[]
    const tarball = join(packDir, packs[0]?.filename ?? "")
    expect(tarball).toMatch(/\.tgz$/)
    const installDir = await mkdtemp(join(tmpdir(), "lfg-npm-pack-"))
    const init = await execFileResult("npm", ["init", "-y"], installDir)
    expect(init.exitCode).toBe(0)
    const install = await execFileResult("npm", ["install", tarball], installDir)
    expect(install.exitCode).toBe(0)
    const home = await mkdtemp(join(tmpdir(), "lfg-npm-pack-home-"))
    const fixture = join(dirname(fileURLToPath(import.meta.url)), "..", "grok-install", "fixture-minimal")
    const pluginRoot = join(home, ".grok", "installed-plugins", "lazycodex")
    await mkdir(pluginRoot, { recursive: true })
    await cp(fixture, pluginRoot, { recursive: true })
    await writeFile(
      join(pluginRoot, "lfg-install.json"),
      `${JSON.stringify({ packageName: "@islee23520/lfg", version: "pack-test", platform: "grok" }, null, 2)}\n`,
    )
    const doctor = await execFileResultEnv("npx", ["lfg", "--json", "doctor"], installDir, { HOME: home })
    expect(doctor.exitCode).toBe(0)
    const json = JSON.parse(doctor.stdout) as { ok?: boolean; cli?: { ok?: boolean } }
    expect(json.ok).toBe(true)
    expect(json.cli?.ok).toBe(true)
    await rm(installDir, { recursive: true, force: true })
    await rm(packDir, { recursive: true, force: true })
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
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }
}

async function packDryRunFilePaths(): Promise<readonly string[]> {
  const result = await execFileResult("npm", ["pack", "--dry-run", "--json"])
  expect(result.exitCode).toBe(0)
  const parsed = JSON.parse(result.stdout) as readonly { readonly files?: readonly { readonly path?: string }[] }[]
  return parsed.flatMap((pack) => pack.files?.map((file) => file.path).filter((path): path is string => typeof path === "string") ?? [])
}

async function makeFakeNpx(exitCode: number): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "lfg-fake-npx."))
  const body =
    exitCode === 0
      ? "case \"$*\" in *lazycodex-ai*) echo fake lazycodex install: $*; echo LAZYCODEX_OPENAI_BASE_URL=${LAZYCODEX_OPENAI_BASE_URL:-}; echo LAZYCODEX_MODEL_DEFAULT=${LAZYCODEX_MODEL_DEFAULT:-}; echo LAZYCODEX_MODEL_REASONING=${LAZYCODEX_MODEL_REASONING:-} ;; *@islee23520/lfp*) echo unexpected lfp npx: $* >&2; exit 2 ;; *) echo unexpected npx: $* >&2; exit 2 ;; esac"
      : "echo fake lazycodex failure: $* >&2"
  await writeFile(join(bin, "npx"), `#!/usr/bin/env bash\n${body}\nexit ${exitCode}\n`)
  await chmod(join(bin, "npx"), 0o755)
  return bin
}

async function makeFakeNpxRejectsLfp(): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "lfg-fake-npx-no-lfp."))
  const body = `case "$*" in
  *lazycodex-ai*) echo fake lazycodex install: $* ;;
  *@islee23520/lfp*) echo unexpected lfp npx: $* >&2; exit 2 ;;
  *) echo unexpected npx: $* >&2; exit 2 ;;
esac`
  await writeFile(join(bin, "npx"), `#!/usr/bin/env bash\n${body}\nexit 0\n`)
  await chmod(join(bin, "npx"), 0o755)
  return bin
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
    execFile(file, [...args], { cwd, env: { ...process.env, ...env } }, (error, stdout) => {
      const exitCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : 0
      resolve({ exitCode, stdout })
    })
  })
}
