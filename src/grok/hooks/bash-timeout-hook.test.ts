import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { afterEach, describe, expect, test } from "vitest"
import { z } from "zod"
import { runInternalGrokInstall } from "../install/run-internal"

const COMMAND_TIMEOUT_MS = 5_000
const createdTempRoots: string[] = []

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

type HookGroup = z.infer<typeof HookGroupSchema>

type CommandResult = {
  readonly command: string
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
}

describe("bash-timeout Grok PreToolUse", () => {
  afterEach(async () => {
    const roots = createdTempRoots.splice(0)
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
  })

  test("registers a PreToolUse hook for the bash tool that points at the native asset", async () => {
    const fixture = await createInstalledBashTimeoutFixture()

    const commands = await bashTimeoutCommandsForTool(fixture.home, "bash")

    expect(commands, "expected a Grok-native bash-timeout PreToolUse command registered for bash").not.toEqual([])
    expect(commands.every((command) => command.includes("lfg-native-bash-timeout"))).toBe(true)
  })

  test("emits the timeout-policy context block when the agent calls bash", async () => {
    const fixture = await createInstalledBashTimeoutFixture()

    const commands = await bashTimeoutCommandsForTool(fixture.home, "bash")
    expect(commands).not.toEqual([])
    const results = await Promise.all(
      commands.map((command) =>
        runHookCommand(
          command,
          bashPreToolUsePayload({ projectRoot: fixture.projectRoot }),
          fixture,
        ),
      ),
    )

    expect(results.every((result) => result.timedOut === false)).toBe(true)
    expect(results.every((result) => result.exitCode === 0)).toBe(true)
    const emitted = results.map((result) => result.stdout).join("\n")
    expect(emitted).toContain("hookSpecificOutput")
    expect(emitted).toContain("additionalContext")
    expect(emitted).toContain("Bash Tool Timeout Policy")
  })

  test("fails closed (no context, exit 0) on malformed JSON so advisory guidance never blocks the call", async () => {
    const fixture = await createInstalledBashTimeoutFixture()

    const commands = await bashTimeoutCommandsForTool(fixture.home, "bash")
    expect(commands).not.toEqual([])
    const results = await Promise.all(
      commands.map((command) => runHookCommand(command, "{not-json", fixture)),
    )

    expect(results.every((result) => result.timedOut === false)).toBe(true)
    expect(results.every((result) => result.exitCode === 0)).toBe(true)
    expect(results.map((result) => result.stdout).join("").trim()).toBe("")
  })
})

type BashTimeoutFixture = {
  readonly home: string
  readonly projectRoot: string
  readonly pluginRoot: string
}

async function createInstalledBashTimeoutFixture(): Promise<BashTimeoutFixture> {
  const home = await mkdtemp(join(tmpdir(), "lfg-bash-hook-"))
  createdTempRoots.push(home)
  const projectRoot = await mkdtemp(join(tmpdir(), "lfg-bash-project-"))
  createdTempRoots.push(projectRoot)
  await runInternalGrokInstall({ HOME: home })
  return {
    home,
    projectRoot,
    pluginRoot: join(home, ".grok", "plugins", "lfg"),
  }
}

async function bashTimeoutCommandsForTool(
  home: string,
  toolName: string,
): Promise<readonly string[]> {
  const raw = await readFile(join(home, ".grok", "hooks", "lfg-hooks.json"), "utf8")
  const parsed = HooksFileSchema.parse(JSON.parse(raw))
  const groups = parsed.hooks.PreToolUse ?? []
  return groups
    .filter((group) => hookGroupMatchesTool(group, toolName))
    .flatMap((group) => group.hooks ?? [])
    .flatMap((handler) => {
      const parsedHandler = HookHandlerSchema.safeParse(handler)
      return parsedHandler.success ? [parsedHandler.data.command] : []
    })
    .filter((command) => command.includes("lfg-native-bash-timeout"))
}

function hookGroupMatchesTool(group: HookGroup, toolName: string): boolean {
  if (group.matcher === undefined) {
    return true
  }
  return new RegExp(group.matcher).test(toolName)
}

type BashPayloadOptions = {
  readonly projectRoot: string
}

function bashPreToolUsePayload(options: BashPayloadOptions): string {
  return JSON.stringify({
    hookEventName: "PreToolUse",
    sessionId: "bash-timeout-hook",
    turnId: "turn-bash-timeout-hook",
    cwd: options.projectRoot,
    workspaceRoot: options.projectRoot,
    toolName: "bash",
    toolInput: {
      command: "npm test",
    },
  })
}

function runHookCommand(
  command: string,
  stdinPayload: string,
  fixture: BashTimeoutFixture,
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
        GROK_HOOK_EVENT: "pre_tool_use",
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
      resolve({ command, exitCode: code ?? 1, stdout, stderr, timedOut: false })
    })
    child.on("error", () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({ command, exitCode: 1, stdout, stderr, timedOut: false })
    })
    child.stdin.end(stdinPayload)
  })
}
