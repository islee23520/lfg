import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { z } from "zod"
import { validateGrokHooksJson } from "./hook-trust"
import { OMO_HOOK_PARITY_EVENTS, OMO_HOOK_PARITY_MATRIX } from "./hook-parity"
import { runInternalGrokInstall } from "../install/run-internal"
import { verifyGrokInstallSurface } from "../doctor/post-install-verify"

describe("post-install ported hooks (#32)", () => {
  test("repair on lazycodex-ai-shaped tree registers Grok hook events", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-post-hooks-"))
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    await mkdir(join(pluginRoot, "hooks"), { recursive: true })
    await mkdir(join(pluginRoot, "components", "rules", "dist"), { recursive: true })
    await writeFile(
      join(pluginRoot, "hooks", "hooks.json"),
      `${JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                hooks: [
                  {
                    type: "command",
                    command: 'node "${PLUGIN_ROOT}/components/rules/dist/cli.js" hook session-start',
                    timeout: 5,
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
    )
    // Write our stamp so this is recognized as a tree we own → triggers clean repair path
    // (mergePortedHooksIntoPlugin) instead of full re-install from fixture.
    await writeFile(
      join(pluginRoot, "lfg-install.json"),
      `${JSON.stringify({ packageName: "@islee23520/lfg", version: "test", platform: "grok" }, null, 2)}\n`,
    )
    await runInternalGrokInstall({ HOME: home })
    const json = await verifyGrokInstallSurface({ home })
    expect(json.hookNames).toEqual([
      "Notification",
      "PostCompact",
      "PostToolUse",
      "PreCompact",
      "PreToolUse",
      "SessionStart",
      "Stop",
      "SubagentStart",
      "SubagentStop",
      "UserPromptSubmit",
    ])
    expect(json.hooksRegistered).toBe(true)
    await expect(readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")).rejects.toThrow()
    const raw = await readFile(join(pluginRoot, "hooks", "hooks.source.json"), "utf8")
    expect(raw).toContain("GROK_PLUGIN_ROOT")
    const activeRaw = await readFile(join(home, ".grok", "hooks", "lfg-hooks.json"), "utf8")
    expect(activeRaw).toContain(pluginRoot)
    expect(activeRaw).not.toContain("GROK_PLUGIN_ROOT")
    expect(await readFile(join(pluginRoot, "hooks", "lfg-project-omo-ledger.mjs"), "utf8")).toContain("inspectProjectOmoLedger")
  })

  test("installed global lfg-hooks.json parses as Grok event map", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-post-hooks-json-"))
    await runInternalGrokInstall({ HOME: home })
    const hooksPath = join(home, ".grok", "hooks", "lfg-hooks.json")
    const parsed: unknown = JSON.parse(await readFile(hooksPath, "utf8"))
    const trust = validateGrokHooksJson(parsed)
    expect(trust.ok).toBe(true)
    expect(trust.hookNames).toContain("SessionStart")
    await expect(readFile(join(home, ".grok", "plugins", "lfg", "hooks", "hooks.json"), "utf8")).rejects.toThrow()
  })

  test("event matrix covers upstream OmO hook events with explicit local decisions", () => {
    const covered = new Set(OMO_HOOK_PARITY_MATRIX.map((row) => row.event))
    expect([...covered].sort()).toEqual([...OMO_HOOK_PARITY_EVENTS].sort())
    expect(OMO_HOOK_PARITY_MATRIX).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "SessionStart", upstreamMatcher: null, status: "Grok-adapted" }),
        expect.objectContaining({ event: "UserPromptSubmit", upstreamCommand: expect.stringContaining("ultrawork") }),
        expect.objectContaining({ event: "PreToolUse", upstreamMatcher: "^Bash$" }),
        expect.objectContaining({ event: "PostToolUse", upstreamMatcher: expect.stringContaining("apply_patch") }),
        expect.objectContaining({ event: "PostCompact", upstreamMatcher: "manual|auto" }),
        expect.objectContaining({ event: "Stop", upstreamCommand: expect.stringContaining("start-work-continuation") }),
        expect.objectContaining({ event: "SubagentStop", upstreamCommand: expect.stringContaining("start-work-continuation") }),
      ]),
    )
    expect(OMO_HOOK_PARITY_MATRIX.find((row) => row.upstreamCommand.includes("telemetry"))?.status).toBe("Unsupported")
    expect(OMO_HOOK_PARITY_MATRIX.find((row) => row.upstreamCommand.includes("auto-update"))?.status).toBe("Unsupported")
    const commentChecker = OMO_HOOK_PARITY_MATRIX.find((row) => row.upstreamCommand.includes("comment-checker"))
    expect(commentChecker).toEqual(
      expect.objectContaining({
        localCommand: 'node "${GROK_PLUGIN_ROOT}/hooks/lfg-native-comment-checker.mjs"',
        status: "Grok-adapted",
      }),
    )
    expect(commentChecker?.localTargetDecision).toContain("addCommentCheckerHook")
  })

  test("generated hook commands resolve to installed files or approved bridge targets", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-post-hooks-targets-"))
    await runInternalGrokInstall({ HOME: home })
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    const hooksPath = join(home, ".grok", "hooks", "lfg-hooks.json")
    const parsed = parseHooksJson(await readFile(hooksPath, "utf8"))
    const commands = collectHookCommands(parsed)
    expect(commands.length).toBeGreaterThan(0)
    for (const command of commands) {
      await expectCommandTargetsInstalled(pluginRoot, command)
    }
  })
})

type HooksPayload = {
  readonly hooks: readonly (readonly HookHandler[])[]
}

const HookHandlerSchema = z.object({
  type: z.literal("command"),
  command: z.string().min(1),
})

type HookHandler = z.infer<typeof HookHandlerSchema>

const HookGroupSchema = z.object({
  hooks: z.array(z.unknown()).optional(),
})

const HooksPayloadSchema = z.object({
  hooks: z.record(z.string(), z.array(HookGroupSchema)),
})

function parseHooksJson(raw: string): HooksPayload {
  const parsed = HooksPayloadSchema.parse(JSON.parse(raw))
  const groups: HookHandler[][] = []
  for (const eventGroups of Object.values(parsed.hooks)) {
    for (const group of eventGroups) {
      groups.push((group.hooks ?? []).flatMap(parseCommandHandler))
    }
  }
  return { hooks: groups }
}

function collectHookCommands(payload: HooksPayload): readonly string[] {
  const commands: string[] = []
  for (const handlers of payload.hooks) {
    for (const handler of handlers) {
      commands.push(handler.command)
    }
  }
  return commands
}

function parseCommandHandler(value: unknown): readonly HookHandler[] {
  const parsed = HookHandlerSchema.safeParse(value)
  return parsed.success ? [parsed.data] : []
}

async function expectCommandTargetsInstalled(pluginRoot: string, command: string): Promise<void> {
  const quotedTargets = [...command.matchAll(/(['"])(.*?)\1/g)].map((match) => match[2] ?? "")
  const fileTargets = quotedTargets
    .map((target) => target.replace(/\$\{GROK_PLUGIN_ROOT\}|\$\{PLUGIN_ROOT\}/g, pluginRoot))
    .filter((target) => target === pluginRoot || target.startsWith(`${pluginRoot}/`))
  expect(fileTargets.length).toBeGreaterThan(0)
  for (const target of fileTargets) {
    await access(target)
  }
  if (command.includes("lfg-grok-hook-bridge.mjs")) {
    expect(fileTargets[0]).toContain("lfg-grok-hook-bridge.mjs")
    expect(fileTargets.length).toBeGreaterThan(1)
  }
}
