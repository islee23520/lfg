import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { findExecutableInPath } from "../../shared/executable-path"
import { dispatchHandoffCommand } from "./handoff-command"
import type { AppServerClient } from "../../core/lfg/orchestrator/app-server"

const handoffTempRoots = new Set<string>()

afterEach(async () => {
  await Promise.all([...handoffTempRoots].map((root) => rm(root, { recursive: true, force: true })))
  handoffTempRoots.clear()
})

async function makeHandoffTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  handoffTempRoots.add(root)
  return root
}

describe("handoff plan command", () => {
  test("hands coding work to an attached project app-server thread", async () => {
    const root = await makeHandoffTempRoot("lfg-handoff-app-server-")
    const appServerClient: AppServerClient = {
      snapshot: async () => ({ availability: "available", daemonStarted: true, threads: [], error: null, recipes: [] }),
      handoff: async () => ({
        transport: "app-server",
        attached: true,
        thread: { id: "thread-1", sessionId: "session-1", cwd: root, name: null, preview: null, status: "active", updatedAt: 1 },
        turnId: "turn-1",
        error: null,
      }),
    }

    const result = await dispatchHandoffCommand([
      "plan", "--role", "coding", "--engine", "gpt", "--cwd", root, "--focus", "Implement the handoff",
    ], { json: true, noProbe: true, env: {}, appServerClient })

    expect(result).toMatchObject({
      ok: true,
      executed: true,
      transport: { transport: "app-server", attached: true, thread: { id: "thread-1" }, turnId: "turn-1" },
      orchestrator: { appServerThreadId: "thread-1" },
    })
  })

  test("reports the honest codex exec fallback when app-server is unavailable", async () => {
    const appServerClient: AppServerClient = {
      snapshot: async () => ({ availability: "missing", daemonStarted: false, threads: [], error: "missing", recipes: [] }),
      handoff: async () => ({
        transport: "codex-exec-fallback",
        attached: false,
        thread: null,
        turnId: null,
        error: "daemon unavailable",
      }),
    }

    const result = await dispatchHandoffCommand([
      "plan", "--role", "coding", "--engine", "gpt", "--focus", "Implement the fallback",
    ], { json: true, noProbe: true, env: {}, appServerClient })

    expect(result).toMatchObject({
      ok: true,
      executed: false,
      transport: { transport: "codex-exec-fallback", error: "daemon unavailable" },
    })
    expect((result.handoff as { launch: { argv: readonly string[] } }).launch.argv.slice(0, 2)).toEqual(["codex", "exec"])
  })

  test("returns the stable JSON plan when all supported inputs are provided", async () => {
    const result = await dispatchHandoffCommand([
      "plan",
      "--role", "review",
      "--engine", "agy",
      "--focus", "Review this",
      "--deliverable", "Findings",
      "--result-path", ".omo/result.md",
      "--payload-file", ".omo/payload.md",
      "--model", "agy-test",
      "--cwd", "/repo",
      "--scope", "src",
      "--scope", "tests",
      "--out-of-scope", "dist",
      "--accept", "No regressions",
      "--image", "screen.png",
      "--verify", "npm test",
      "--read-only",
    ], { json: true, noProbe: true, env: {} })

    expect(Object.keys(result)).toEqual([
      "ok", "status", "command", "subcommand", "dryRun", "executed", "handoff", "readiness", "visionConfirmation", "transport", "orchestrator", "lfgIsPlugin",
    ])
    expect(result).toMatchObject({
      ok: true,
      status: "planned",
      command: "handoff",
      subcommand: "plan",
      dryRun: true,
      executed: false,
      handoff: {
        role: "review",
        engine: "gpt",
        focus: "Review this",
        deliverable: "Findings",
        resultPath: ".omo/result.md",
        scopePaths: ["src", "tests"],
        outOfScopePaths: ["dist"],
        acceptanceCriteria: ["No regressions"],
        imagePaths: ["screen.png"],
        verifyCommands: ["npm test"],
        launch: {
          cwd: "/repo",
          stdinSource: { kind: "file", path: ".omo/payload.md" },
        },
      },
      readiness: { checked: false, ok: true, status: "skipped", binary: "codex", commandPath: null },
      visionConfirmation: { requested: false, optional: true, blocking: false, status: "skipped", binary: "agy" },
      lfgIsPlugin: false,
    })
  })

  test("keeps handoff successful when optional agy confirmation is skipped because it is unavailable", async () => {
    // Given
    const bin = await makeHandoffTempRoot("lfg-handoff-no-agy-")

    // When
    const result = await dispatchHandoffCommand([
      "plan", "--role", "vision", "--image", "screen.png",
    ], { json: true, noProbe: false, env: { PATH: bin } })

    // Then
    expect(result).toMatchObject({
      visionConfirmation: { requested: true, optional: true, blocking: false, status: "skipped" },
    })
  })

  test.each([
    { output: "PASS visual criteria confirmed", status: "pass" },
    { output: "FAIL spacing differs", status: "fail" },
    { output: "Could not determine", status: "uncertain" },
  ])("classifies optional agy output as $status", async ({ output, status }) => {
    const bin = await makeHandoffTempRoot("lfg-handoff-agy-")
    const agy = join(bin, "agy")
    await writeFile(agy, "#!/bin/sh\nexit 0\n", { mode: 0o755 })

    const result = await dispatchHandoffCommand([
      "plan", "--role", "vision", "--image", "screen.png",
    ], {
      json: true,
      noProbe: false,
      env: { PATH: bin },
      visionConfirmationRunner: async () => ({ stdout: output }),
    })

    expect(result).toMatchObject({ visionConfirmation: { status, blocking: false } })
    expect((result.visionConfirmation as { contextBlock: string }).contextBlock).toContain("<lfg-agy-vision-confirm")
  })

  test("degrades agy runner errors to uncertain", async () => {
    const bin = await makeHandoffTempRoot("lfg-handoff-agy-error-")
    await writeFile(join(bin, "agy"), "#!/bin/sh\nexit 0\n", { mode: 0o755 })

    const result = await dispatchHandoffCommand([
      "plan", "--role", "vision", "--image", "screen.png",
    ], {
      json: true,
      noProbe: false,
      env: { PATH: bin },
      visionConfirmationRunner: async () => { throw new Error("timed out") },
    })

    expect(result).toMatchObject({ visionConfirmation: { status: "uncertain", blocking: false } })
  })

  test("checks an executable without invoking it", async () => {
    const bin = await makeHandoffTempRoot("lfg-handoff-bin-")
    const marker = join(bin, "invoked")
    const command = join(bin, "codex")
    await writeFile(command, `#!/bin/sh\ntouch '${marker}'\n`)
    await chmod(command, 0o755)

    const result = await dispatchHandoffCommand(["plan", "--role", "coding"], {
      json: true,
      noProbe: false,
      env: { PATH: bin },
    })

    expect(result).toMatchObject({
      ok: true,
      status: "planned",
      readiness: { checked: true, ok: true, status: "ready", binary: "codex", commandPath: command },
    })
    await expect(access(marker)).rejects.toThrow()
  })

  test("retains the handoff when the binary is missing", async () => {
    const bin = await makeHandoffTempRoot("lfg-handoff-empty-bin-")

    const result = await dispatchHandoffCommand(["plan", "--role", "oracle"], {
      json: true,
      noProbe: false,
      env: { PATH: bin },
    })

    expect(result).toMatchObject({
      ok: false,
      status: "not_ready",
      handoff: { role: "oracle", engine: "gpt" },
      readiness: { checked: true, ok: false, status: "missing", binary: "codex", commandPath: null },
      executed: false,
    })
  })

  test("uses the setup backend engine when --engine is omitted and preserves explicit override precedence", async () => {
    const home = await makeHandoffTempRoot("lfg-handoff-config-")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(join(home, ".grok", "config.toml"), "[omo.external_engine]\nbackend = \"agy\"\n", "utf8")
    const env = { LFG_ALLOW_TEST_GROK_HOME: "1", LFG_TEST_GROK_HOME: home }

    const configured = await dispatchHandoffCommand(["plan", "--role", "coding"], {
      json: true,
      noProbe: true,
      env,
    })
    const explicit = await dispatchHandoffCommand(["plan", "--role", "coding", "--engine", "gpt"], {
      json: true,
      noProbe: true,
      env,
    })
    const legacyGemini = await makeHandoffTempRoot("lfg-handoff-legacy-gemini-")
    await mkdir(join(legacyGemini, ".grok"), { recursive: true })
    await writeFile(join(legacyGemini, ".grok", "config.toml"), "[omo.external_engine]\nbackend = \"gemini\"\n", "utf8")
    const aliased = await dispatchHandoffCommand(["plan", "--role", "coding"], {
      json: true,
      noProbe: true,
      env: { LFG_ALLOW_TEST_GROK_HOME: "1", LFG_TEST_GROK_HOME: legacyGemini },
    })

    expect(configured).toMatchObject({ handoff: { engine: "gpt" } })
    expect(explicit).toMatchObject({ handoff: { engine: "gpt" } })
    expect(aliased).toMatchObject({ handoff: { engine: "gpt", launch: { binary: "codex" } } })
  })

  test("supports absolute commands and Windows PATHEXT lookup", async () => {
    const bin = await makeHandoffTempRoot("lfg-handoff-win-bin-")
    const command = join(bin, "claude.CMD")
    await writeFile(command, "@echo off\r\n")

    await expect(findExecutableInPath(command, {}, "win32")).resolves.toBe(command)
    await expect(findExecutableInPath("claude", { PATH: bin, PATHEXT: ".EXE;.CMD" }, "win32")).resolves.toBe(command)
  })

  test.each([
    { name: "requires JSON", argv: ["plan"], json: false, error: "requires --json" },
    { name: "requires a subcommand", argv: [], json: true, error: "requires the plan subcommand" },
    { name: "rejects unknown subcommands", argv: ["run"], json: true, error: "Unsupported handoff subcommand" },
    { name: "rejects unknown flags", argv: ["plan", "--mode", "fast"], json: true, error: "Unknown handoff flag" },
    { name: "rejects missing values", argv: ["plan", "--role"], json: true, error: "requires a value" },
    { name: "rejects flag-shaped values", argv: ["plan", "--role", "--engine", "gpt"], json: true, error: "requires a value" },
    { name: "rejects duplicate singleton flags", argv: ["plan", "--role", "coding", "--role", "review"], json: true, error: "may only be provided once" },
    { name: "rejects positional input", argv: ["plan", "coding"], json: true, error: "Unknown handoff argument" },
  ])("$name", async ({ argv, json, error }) => {
    const result = await dispatchHandoffCommand(argv, { json, noProbe: true, env: {} })

    expect(result).toMatchObject({ ok: false, status: "invalid_handoff", command: "handoff", executed: false })
    expect(result.error).toContain(error)
  })

  test("advertises GPT as the only first-class handoff engine", async () => {
    const result = await dispatchHandoffCommand(["plan", "--engine", "gjc"], {
      json: true,
      noProbe: true,
      env: {},
    })

    expect(result).toMatchObject({
      ok: false,
      usage: "lfg --json handoff plan [--role ROLE] [--engine gpt] [flags]",
    })
  })

  test.each([
    { argv: ["plan", "--role", "sisyphus"], error: "orchestrator role" },
    { argv: ["plan", "--role", "unknown"], error: "unknown OMO worker role" },
    { argv: ["plan", "--engine", "gjc"], error: "unknown engine" },
    { argv: ["plan", "--role", "review", "--yolo"], error: "write-capable role" },
    { argv: ["plan", "--role", "coding", "--read-only", "--yolo"], error: "write-capable role" },
  ])("returns a typed planning error for $argv", async ({ argv, error }) => {
    const result = await dispatchHandoffCommand(argv, { json: true, noProbe: true, env: {} })

    expect(result).toMatchObject({ ok: false, status: "invalid_handoff", command: "handoff", subcommand: "plan" })
    expect(result.error).toContain(error)
  })

  test("preserves typed remediation detail from the handoff planner", async () => {
    const result = await dispatchHandoffCommand([
      "plan",
      "--role", "review",
      "--focus", "Inspect $(synthetic-secret)",
    ], { json: true, noProbe: true, env: {} })

    expect(result).toMatchObject({
      ok: false,
      status: "invalid_handoff",
      detail: {
        code: "unsafe_inline_prompt",
        remediation: "use_payload_file",
        flag: "--payload-file",
      },
    })
  })

  test("reports only an unknown flag key when its token contains a value", async () => {
    const secret = "sk-synthetic-equals-secret"
    const result = await dispatchHandoffCommand([
      "plan",
      `--api-key=${secret}`,
    ], { json: true, noProbe: true, env: {} })

    expect(result.error).toBe("Unknown handoff flag: --api-key")
    expect(JSON.stringify(result)).not.toContain(secret)
  })
})
