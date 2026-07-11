/**
 * SubagentStop evidence verifier e2e registration (T2 RED → T3 GREEN).
 *
 * Pure function MVP: `subagent-stop-evidence-verifier.ts` (unit-tested).
 * T3 wires the same pure-verifier markers into installed `lfg-sisyphus-hooks.mjs`
 * SubagentStop (`verifySubagentStopEvidence` for coding|hephaestus|builder +
 * .omo/evidence + fail-closed malformed JSON).
 *
 * These tests:
 * 1. Characterize install/hook surface after T3 wiring.
 * 2. Assert e2e registration contract (must PASS after T3).
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { afterEach, describe, expect, test } from "vitest"
import { z } from "zod"
import { runInternalGrokInstall } from "../install/run-internal"
import { COMPONENTS } from "../payload/component-inventory"
import { verifySubagentStopEvidence } from "./subagent-stop-evidence-verifier"

const COMMAND_TIMEOUT_MS = 5_000
const createdTempRoots: string[] = []

/** Markers that only the pure `.omo/evidence` verifier emits (not Sisyphus regex guidance). */
const PURE_VERIFIER_WARNING_MARKERS = [
  "WARNING: Grok SubagentStop evidence verifier (MVP)",
  "no receipt in",
  "Target agents: coding, hephaestus, builder",
] as const

const PURE_VERIFIER_VERIFIED_MARKER =
  "Evidence receipt VERIFIED for Grok agent" as const

const PURE_VERIFIER_FAIL_CLOSED_MARKERS = [
  "malformed JSON payload",
  "Evidence verifier fail-closed",
] as const

const HookHandlerSchema = z.object({
  type: z.literal("command"),
  command: z.string().min(1),
})

const HookGroupSchema = z.object({
  matcher: z.string().optional(),
  hooks: z.array(z.unknown()).optional(),
})

const HooksFileSchema = z.object({
  hooks: z.record(z.string(), z.array(HookGroupSchema)),
})

type CommandResult = {
  readonly command: string
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
}

type InstallFixture = {
  readonly home: string
  readonly projectRoot: string
  readonly pluginRoot: string
  readonly evidenceDir: string
}

describe("SubagentStop evidence verifier — current surface (characterization; PASS)", () => {
  afterEach(async () => {
    await cleanupTemps()
  })

  test("pure function still warns for coding agent without .omo/evidence receipt", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-ssv-pure-"))
    createdTempRoots.push(projectRoot)
    const result = verifySubagentStopEvidence(
      {
        hookEventName: "SubagentStop",
        agentName: "coding",
        cwd: projectRoot,
      },
      projectRoot,
    )
    expect(result.hasReceipt).toBe(false)
    expect(result.additionalContext).toContain(PURE_VERIFIER_WARNING_MARKERS[0])
  })

  test("sisyphus SubagentStop keeps regex evidence labels and surfaces pure-verifier markers for coding", async () => {
    const assetPath = join(import.meta.dirname, "..", "assets", "hooks", "lfg-sisyphus-hooks.mjs")
    const mod = await import(assetPath)
    const emptyProject = await mkdtemp(join(tmpdir(), "lfg-ssv-char-"))
    createdTempRoots.push(emptyProject)
    const ctx = mod.subagentStopContext({
      hookEventName: "SubagentStop",
      agentName: "coding",
      cwd: emptyProject,
      last_assistant_message: "Done.",
    })
    expect(ctx.body).toContain("Evidence verification: missing_evidence")
    // T3: pure .omo/evidence path is wired alongside lightweight regex guidance.
    expect(ctx.body).toContain(PURE_VERIFIER_WARNING_MARKERS[0])
    expect(ctx.body).toContain(PURE_VERIFIER_WARNING_MARKERS[2])
  })

  test("install registers SubagentStop with sisyphus hooks only (no dedicated evidence-verifier component)", async () => {
    const fixture = await createInstallFixture()
    const commands = await subagentStopCommands(fixture.home)
    expect(commands.length, "SubagentStop must be registered after install").toBeGreaterThan(0)
    expect(commands.some((c) => c.includes("lfg-sisyphus-hooks"))).toBe(true)
    // Residual: no dedicated lazycodex-executor-verify / evidence-verifier CLI yet (wired via sisyphus).
    expect(commands.every((c) => !c.includes("lazycodex-executor-verify"))).toBe(true)
    expect(commands.every((c) => !c.includes("subagent-stop-evidence-verifier"))).toBe(true)
  })

  test("inventory keeps lazycodex-executor-verify Deferred (T3 residual: no dedicated host-enforced CLI)", () => {
    const row = COMPONENTS.find((c) => c.id === "lazycodex-executor-verify")
    expect(row).toBeDefined()
    expect(row?.status).toBe("Deferred")
    expect(row?.evidence ?? "").toMatch(/MVP|pure function|T3|sisyphus/i)
  })

  test("installed sisyphus asset wires pure verifySubagentStopEvidence", async () => {
    const fixture = await createInstallFixture()
    const installed = await readFile(
      join(fixture.pluginRoot, "hooks", "lfg-sisyphus-hooks.mjs"),
      "utf8",
    )
    expect(installed).toContain("verifySubagentEvidence")
    expect(installed).toContain("verifySubagentStopEvidence")
    expect(installed).toContain("WARNING: Grok SubagentStop evidence verifier (MVP)")
  })
})

describe("SubagentStop evidence verifier — e2e registration contract (T3 GREEN)", () => {
  afterEach(async () => {
    await cleanupTemps()
  })

  test("after install, SubagentStop for coding without evidence emits pure-verifier WARNING via additionalContext", async () => {
    const fixture = await createInstallFixture()
    const commands = await subagentStopCommands(fixture.home)
    expect(commands.length).toBeGreaterThan(0)

    const payload = JSON.stringify({
      hookEventName: "SubagentStop",
      agentName: "coding",
      cwd: fixture.projectRoot,
      workspaceRoot: fixture.projectRoot,
      last_assistant_message: "Done without writing evidence.",
    })

    const results = await Promise.all(
      commands.map((command) => runHookCommand(command, payload, fixture, "SubagentStop")),
    )
    expect(results.every((r) => r.timedOut === false)).toBe(true)
    expect(results.every((r) => r.exitCode === 0)).toBe(true)

    const combined = results.map((r) => r.stdout).join("\n")
    // T3 contract: host SubagentStop path must surface pure verifier missing-receipt warning.
    for (const marker of PURE_VERIFIER_WARNING_MARKERS) {
      expect(combined, `expected pure-verifier marker after install hook run: ${marker}`).toContain(marker)
    }
  })

  test("after install, SubagentStop for hephaestus with .omo/evidence receipt emits pure-verifier VERIFIED", async () => {
    const fixture = await createInstallFixture()
    await mkdir(fixture.evidenceDir, { recursive: true })
    await writeFile(
      join(fixture.evidenceDir, "task-e2e-hephaestus-receipt.txt"),
      "Concrete evidence: vitest green, build passed.\n",
      "utf8",
    )

    const commands = await subagentStopCommands(fixture.home)
    const payload = JSON.stringify({
      hookEventName: "SubagentStop",
      agentName: "hephaestus",
      cwd: fixture.projectRoot,
      workspaceRoot: fixture.projectRoot,
      // Intentionally weak message so regex-only path would NOT "verify" without pure fn + receipt.
      last_assistant_message: "Done.",
    })

    const results = await Promise.all(
      commands.map((command) => runHookCommand(command, payload, fixture, "SubagentStop")),
    )
    expect(results.every((r) => r.timedOut === false)).toBe(true)
    expect(results.every((r) => r.exitCode === 0)).toBe(true)

    const combined = results.map((r) => r.stdout).join("\n")
    expect(combined, "T3: pure verifier must report VERIFIED when .omo/evidence has a receipt").toContain(
      PURE_VERIFIER_VERIFIED_MARKER,
    )
    expect(combined).toContain("hephaestus")
  })

  test("after install, SubagentStop for builder still applies pure verifier (target agent set)", async () => {
    const fixture = await createInstallFixture()
    const commands = await subagentStopCommands(fixture.home)
    const payload = JSON.stringify({
      hookEventName: "SubagentStop",
      agent: "builder",
      cwd: fixture.projectRoot,
      last_assistant_message: "shipped",
    })

    const results = await Promise.all(
      commands.map((command) => runHookCommand(command, payload, fixture, "SubagentStop")),
    )
    const combined = results.map((r) => r.stdout).join("\n")
    expect(combined, "T3: builder is a pure-verifier target agent").toContain(
      PURE_VERIFIER_WARNING_MARKERS[0],
    )
  })

  test("after install, malformed SubagentStop JSON fail-closes with pure-verifier ERROR context", async () => {
    const fixture = await createInstallFixture()
    const commands = await subagentStopCommands(fixture.home)
    expect(commands.length).toBeGreaterThan(0)

    // Invalid JSON string on stdin — pure verifier throws / returns fail-closed; Sisyphus today
    // parseJson → null and still injects generic SubagentStop guidance when GROK_HOOK_EVENT is set.
    const results = await Promise.all(
      commands.map((command) =>
        runHookCommand(command, "invalid json {", fixture, "SubagentStop"),
      ),
    )

    const combined = results.map((r) => `${r.stdout}\n${r.stderr}`).join("\n")
    const hasFailClosed = PURE_VERIFIER_FAIL_CLOSED_MARKERS.some((m) => combined.includes(m))
    expect(
      hasFailClosed,
      `T3: installed SubagentStop path must fail-closed on malformed JSON; got:\n${combined.slice(0, 800)}`,
    ).toBe(true)
  })

  test("install surface receipt: SubagentStop registration invokes pure evidence verifier for target agents", async () => {
    const fixture = await createInstallFixture()
    const activeRaw = await readFile(join(fixture.home, ".grok", "hooks", "lfg-hooks.json"), "utf8")
    const sourceRaw = await readFile(
      join(fixture.pluginRoot, "hooks", "hooks.source.json"),
      "utf8",
    ).catch(() => "")
    const installedSisyphus = await readFile(
      join(fixture.pluginRoot, "hooks", "lfg-sisyphus-hooks.mjs"),
      "utf8",
    )

    // T3 install-surface receipt: pure verifier must be reachable from registered SubagentStop path.
    // Accept either: (a) sisyphus asset wires pure verifier, or (b) dedicated command/component is registered.
    const wiredInSisyphus =
      installedSisyphus.includes("verifySubagentStopEvidence") ||
      installedSisyphus.includes("subagent-stop-evidence-verifier") ||
      installedSisyphus.includes("WARNING: Grok SubagentStop evidence verifier (MVP)")
    const wiredInHooksJson =
      activeRaw.includes("subagent-stop-evidence") ||
      activeRaw.includes("lazycodex-executor-verify") ||
      sourceRaw.includes("subagent-stop-evidence") ||
      sourceRaw.includes("lazycodex-executor-verify")

    expect(
      wiredInSisyphus || wiredInHooksJson,
      "T3: after install, SubagentStop path must register pure evidence verifier (sisyphus wire or dedicated hook command)",
    ).toBe(true)
  })
})

async function createInstallFixture(): Promise<InstallFixture> {
  const home = await mkdtemp(join(tmpdir(), "lfg-ssv-e2e-home-"))
  createdTempRoots.push(home)
  const projectRoot = await mkdtemp(join(tmpdir(), "lfg-ssv-e2e-proj-"))
  createdTempRoots.push(projectRoot)
  await mkdir(join(projectRoot, ".omo"), { recursive: true })
  await runInternalGrokInstall({ HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" })
  return {
    home,
    projectRoot,
    pluginRoot: join(home, ".grok", "plugins", "lfg"),
    evidenceDir: join(projectRoot, ".omo", "evidence"),
  }
}

async function cleanupTemps(): Promise<void> {
  const roots = createdTempRoots.splice(0)
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
}

async function subagentStopCommands(home: string): Promise<readonly string[]> {
  const raw = await readFile(join(home, ".grok", "hooks", "lfg-hooks.json"), "utf8")
  const parsed = HooksFileSchema.parse(JSON.parse(raw))
  const groups = parsed.hooks.SubagentStop ?? []
  return groups
    .flatMap((group) => group.hooks ?? [])
    .flatMap((handler) => {
      const parsedHandler = HookHandlerSchema.safeParse(handler)
      return parsedHandler.success ? [parsedHandler.data.command] : []
    })
}

function runHookCommand(
  command: string,
  stdinPayload: string,
  fixture: InstallFixture,
  event: string,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: fixture.projectRoot,
      env: {
        ...process.env,
        HOME: fixture.home,
        LFG_ALLOW_TEST_GROK_HOME: "1",
        GROK_PLUGIN_ROOT: fixture.pluginRoot,
        GROK_PLUGIN_DATA: join(fixture.home, ".grok", "plugin-data", "lfg"),
        GROK_WORKSPACE_ROOT: fixture.projectRoot,
        GROK_HOOK_EVENT: event,
      },
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill("SIGKILL")
      resolve({ command, exitCode: 1, stdout, stderr, timedOut: true })
    }, COMMAND_TIMEOUT_MS)
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on("close", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({
        command,
        exitCode: code ?? 1,
        stdout,
        stderr,
        timedOut: false,
      })
    })
    child.on("error", (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({
        command,
        exitCode: 1,
        stdout,
        stderr: `${stderr}\n${String(error)}`,
        timedOut: false,
      })
    })
    child.stdin.write(stdinPayload)
    child.stdin.end()
  })
}
