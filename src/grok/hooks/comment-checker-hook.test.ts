import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
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

describe("comment-checker Grok PostToolUse", () => {
  afterEach(async () => {
    const roots = createdTempRoots.splice(0)
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
  })

  test("stays silent when an unrelated edit leaves a pre-existing noisy comment elsewhere", async () => {
    // Given: a project file already contains a noisy comment that the patch does not touch.
    const fixture = await createInstalledCommentCheckerFixture()
    await writeFile(
      fixture.targetFile,
      [
        "export function total(value: number): number {",
        "  // Add one to the value.",
        "  const base = value",
        "  return base + 1",
        "}",
        "",
      ].join("\n"),
      "utf8",
    )

    // When: Grok dispatches an unrelated apply_patch event for the same file.
    const commands = await commentCheckerCommandsForTool(fixture.home, "apply_patch")
    expect(
      commands,
      "expected a Grok-native comment-checker PostToolUse command registered for apply_patch",
    ).not.toEqual([])
    const results = await Promise.all(
      commands.map((command) =>
        runHookCommand(
          command,
          editPostToolUsePayload({
            projectRoot: fixture.projectRoot,
            targetFile: fixture.targetFile,
            patch: "@@ -1,5 +1,5 @@\n export function total(value: number): number {\n   // Add one to the value.\n-  const base = value\n+  const base = Math.max(value, 0)\n   return base + 1\n }\n",
          }),
          fixture,
        ),
      ),
    )

    // Then: the untouched pre-existing comment must not produce feedback.
    expect(results.every((result) => result.timedOut === false)).toBe(true)
    expect(results.every((result) => result.exitCode === 0)).toBe(true)
    expect(results.map((result) => result.stdout).join("\n").trim()).toBe("")
  })

  test("emits bounded actionable feedback when apply_patch adds an obvious bad comment", async () => {
    // Given: an installed lfg Grok plugin and a project file with a noisy comment.
    const fixture = await createInstalledCommentCheckerFixture()
    await writeFile(
      fixture.targetFile,
      [
        "export function total(value: number): number {",
        "  // Add one to the value.",
        "  return value + 1",
        "}",
        "",
      ].join("\n"),
      "utf8",
    )

    // When: Grok dispatches an edit-like PostToolUse event for apply_patch.
    const commands = await commentCheckerCommandsForTool(fixture.home, "apply_patch")

    // Then: a Grok-native comment-checker hook/runtime should emit bounded blocking feedback.
    expect(
      commands,
      "expected a Grok-native comment-checker PostToolUse command registered for apply_patch",
    ).not.toEqual([])
    const results = await Promise.all(
      commands.map((command) =>
        runHookCommand(
          command,
          editPostToolUsePayload({
            projectRoot: fixture.projectRoot,
            targetFile: fixture.targetFile,
            patch: "@@ -1,3 +1,4 @@\n export function total(value: number): number {\n+  // Add one to the value.\n   return value + 1\n }\n",
          }),
          fixture,
        ),
      ),
    )
    expect(results.every((result) => result.timedOut === false)).toBe(true)
    expect(results.every((result) => result.exitCode === 0)).toBe(true)
    const feedback = results.map((result) => `${result.stdout}\n${result.stderr}`).join("\n").trim()
    expect(feedback.length).toBeGreaterThan(0)
    expect(feedback.length).toBeLessThanOrEqual(6_000)
    expect(feedback.toLowerCase()).toContain("comment")
    expect(feedback.toLowerCase()).toMatch(/remove|rewrite|fix|explain/)
  })

  test("fails closed for malformed PostToolUse payloads", async () => {
    // Given: an installed lfg Grok plugin with the comment-checker hook registered.
    const fixture = await createInstalledCommentCheckerFixture()
    const commands = await commentCheckerCommandsForTool(fixture.home, "apply_patch")

    // When: Grok sends malformed PostToolUse JSON.
    expect(
      commands,
      "expected a Grok-native comment-checker PostToolUse command registered for apply_patch",
    ).not.toEqual([])
    const results = await Promise.all(commands.map((command) => runHookCommand(command, "{not-json", fixture)))

    // Then: malformed input should fail closed and must not fabricate feedback from raw text.
    expect(results.every((result) => result.timedOut === false)).toBe(true)
    expect(results.every((result) => result.exitCode !== 0)).toBe(true)
    expect(results.map((result) => result.stderr).join("\n")).toContain("malformed JSON payload")
    expect(results.map((result) => result.stdout).join("\n")).not.toContain("not-json")
  })

  test("registers comment-checker for multiEdit, MultiEdit, and multiedit tool names", async () => {
    // Given: an installed lfg Grok plugin with normalized hooks.
    const fixture = await createInstalledCommentCheckerFixture()

    // When: command selection is evaluated for Grok multi-edit spellings.
    const camelCaseCommands = await commentCheckerCommandsForTool(fixture.home, "multiEdit")
    const pascalCaseCommands = await commentCheckerCommandsForTool(fixture.home, "MultiEdit")
    const multieditCommands = await commentCheckerCommandsForTool(fixture.home, "multiedit")

    // Then: all tool name spellings match the comment-checker hook group.
    expect(camelCaseCommands).not.toEqual([])
    expect(pascalCaseCommands).not.toEqual([])
    expect(multieditCommands).not.toEqual([])
    expect(camelCaseCommands).toEqual(pascalCaseCommands)
    expect(camelCaseCommands).toEqual(multieditCommands)
  })
})

type CommentCheckerFixture = {
  readonly home: string
  readonly projectRoot: string
  readonly pluginRoot: string
  readonly targetFile: string
}

async function createInstalledCommentCheckerFixture(): Promise<CommentCheckerFixture> {
  const home = await mkdtemp(join(tmpdir(), "lfg-cchk-hook-"))
  createdTempRoots.push(home)
  const projectRoot = await mkdtemp(join(tmpdir(), "lfg-cchk-project-"))
  createdTempRoots.push(projectRoot)
  await mkdir(join(projectRoot, "src"), { recursive: true })
  await runInternalGrokInstall({ HOME: home })
  return {
    home,
    projectRoot,
    pluginRoot: join(home, ".grok", "plugins", "lfg"),
    targetFile: join(projectRoot, "src", "comment-fixture.ts"),
  }
}

async function commentCheckerCommandsForTool(home: string, toolName: string): Promise<readonly string[]> {
  const raw = await readFile(join(home, ".grok", "hooks", "lfg-hooks.json"), "utf8")
  const parsed = HooksFileSchema.parse(JSON.parse(raw))
  const groups = parsed.hooks.PostToolUse ?? []
  return groups
    .filter((group) => hookGroupMatchesTool(group, toolName))
    .flatMap((group) => group.hooks ?? [])
    .flatMap((handler) => {
      const parsedHandler = HookHandlerSchema.safeParse(handler)
      return parsedHandler.success ? [parsedHandler.data.command] : []
    })
    .filter(isCommentCheckerCommand)
}

function hookGroupMatchesTool(group: HookGroup, toolName: string): boolean {
  if (group.matcher === undefined) {
    return true
  }
  return new RegExp(group.matcher).test(toolName)
}

function isCommentCheckerCommand(command: string): boolean {
  return command.includes("/components/comment-checker/") || command.includes("/hooks/lfg-native-comment-checker")
}

type EditPayloadOptions = {
  readonly projectRoot: string
  readonly targetFile: string
  readonly patch: string
}

function editPostToolUsePayload(options: EditPayloadOptions): string {
  return JSON.stringify({
    hookEventName: "PostToolUse",
    sessionId: "comment-checker-hook",
    turnId: "turn-comment-checker-hook",
    cwd: options.projectRoot,
    workspaceRoot: options.projectRoot,
    toolName: "apply_patch",
    toolInput: {
      filePath: options.targetFile,
      patch: options.patch,
    },
    toolResponse: {
      success: true,
      filePath: options.targetFile,
    },
  })
}

function runHookCommand(command: string, stdinPayload: string, fixture: CommentCheckerFixture): Promise<CommandResult> {
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
        GROK_HOOK_EVENT: "post_tool_use",
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
