import { spawn } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import {
  addNativeOrchestratorInboxHooks,
  NATIVE_ORCHESTRATOR_INBOX_FILE,
} from "./native-orchestrator-inbox-hook-registration"

const hookPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "assets",
  "hooks",
  NATIVE_ORCHESTRATOR_INBOX_FILE,
)

async function runHook(
  payload: Readonly<Record<string, unknown>>,
  env: Readonly<Record<string, string>> = {},
): Promise<{ readonly exitCode: number; readonly stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookPath], {
      env: { ...process.env, LFG_MCP_READY_TIMEOUT_MS: "20", LFG_MONITOR_BOARD_AUTO_EXECUTE: "0", ...env },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (stderr.length > 0 && (code ?? 1) !== 0) {
        reject(new Error(stderr))
        return
      }
      resolve({ exitCode: code ?? 1, stdout })
    })
    child.stdin.end(JSON.stringify(payload))
  })
}

async function readEventually(path: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await readFile(path, "utf8")
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }
  return readFile(path, "utf8")
}

async function readEventuallyContaining(path: string, expected: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = await readEventually(path)
    if (value.includes(expected)) return value
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return readFile(path, "utf8")
}

describe("native orchestrator inbox hook", () => {
  test("registers SessionStart, UserPromptSubmit, and Stop once", () => {
    const once = addNativeOrchestratorInboxHooks({})
    const twice = addNativeOrchestratorInboxHooks(once)

    for (const eventName of ["SessionStart", "UserPromptSubmit", "Stop"] as const) {
      const groups = twice[eventName]
      expect(Array.isArray(groups)).toBe(true)
      expect(JSON.stringify(groups).match(new RegExp(NATIVE_ORCHESTRATOR_INBOX_FILE, "g"))).toHaveLength(1)
    }
  })

  test("injects the Codex monitor gate on Stop without recording a prompt ask", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-orchestrator-stop-"))

    const result = await runHook({
      hookEventName: "Stop",
      cwd: projectRoot,
      prompt: "must not become an ask",
    })

    expect(result.exitCode).toBe(0)
    const response = JSON.parse(result.stdout) as {
      readonly hookSpecificOutput?: {
        readonly hookEventName?: string
        readonly additionalContext?: string
      }
    }
    expect(response.hookSpecificOutput?.hookEventName).toBe("Stop")
    expect(response.hookSpecificOutput?.additionalContext).toContain("<lfg-always-on-monitors>")
    expect(response.hookSpecificOutput?.additionalContext).toContain("<lfg-stop-codex-monitor-gate>")

    const inbox = JSON.parse(
      await readFile(join(projectRoot, ".omo", "orchestrator", "inbox.json"), "utf8"),
    ) as { readonly asks?: readonly unknown[] }
    expect(inbox.asks).toEqual([])
  })

  test("auto-resumes recoverable asks and planned threads on SessionStart", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-orchestrator-resume-work-"))
    const inboxPath = join(projectRoot, ".omo", "orchestrator", "inbox.json")
    await mkdir(dirname(inboxPath), { recursive: true })
    await writeFile(
      inboxPath,
      JSON.stringify({
        version: 1,
        updatedAt: "2026-07-15T00:00:00.000Z",
        asks: [
          {
            id: "ask-recover-1",
            userText: "finish prior work",
            createdAt: "2026-07-15T00:00:00.000Z",
            updatedAt: "2026-07-15T00:00:00.000Z",
            status: "in_progress",
            userAnsweredAt: null,
            answerSummary: null,
            threadIds: ["thr-recover-1"],
          },
        ],
        threads: [
          {
            id: "thr-recover-1",
            role: "coding",
            resultPath: ".omo/orchestrator/prior-result.md",
            status: "planned",
          },
        ],
      }),
    )

    const result = await runHook({ hookEventName: "SessionStart", source: "startup", cwd: projectRoot })
    const response = JSON.parse(result.stdout) as {
      readonly hookSpecificOutput?: { readonly additionalContext?: string }
      readonly statusMessage?: string
    }
    const context = response.hookSpecificOutput?.additionalContext ?? ""

    expect(context).toContain('<lfg-session-auto-resume force="true">')
    expect(context).toContain("orchestrator status")
    expect(context).toContain("orchestrator poll")
    expect(context).toContain("orchestrator watch")
    expect(context).toContain("ask-recover-1")
    expect(context).toContain("thr-recover-1")
    expect(context).toContain(".omo/orchestrator/prior-result.md")
    expect(response.statusMessage).toBe("LFG monitor: running=1 ready=0 failed=0")
  })

  test("rechecks orchestrator once on empty resume SessionStart", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-orchestrator-resume-empty-"))

    const result = await runHook({ hookEventName: "SessionStart", source: "resume", cwd: projectRoot })
    const response = JSON.parse(result.stdout) as {
      readonly hookSpecificOutput?: { readonly additionalContext?: string }
    }
    const context = response.hookSpecificOutput?.additionalContext ?? ""

    expect(context).toContain('<lfg-session-auto-resume force="true">')
    expect(context).toContain("orchestrator status")
    expect(context).toContain("orchestrator poll")
    expect(context).toContain("orchestrator watch")
  })

  test("forces monitor startup on an empty startup SessionStart", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-orchestrator-startup-empty-"))

    const result = await runHook({ hookEventName: "SessionStart", source: "startup", cwd: projectRoot })
    const response = JSON.parse(result.stdout) as {
      readonly hookSpecificOutput?: { readonly additionalContext?: string }
    }
    const context = response.hookSpecificOutput?.additionalContext ?? ""

    expect(context).toContain('<lfg-session-monitor-start force="true">')
    expect(context).toContain("lfg --json orchestrator status")
    expect(context).toContain("lfg --json orchestrator poll")
    expect(context).toContain("lfg --json orchestrator watch")
  })

  test("launches codex exec resume and writes a SessionStart continuation receipt", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-sessionstart-continue-"))
    const binDir = join(projectRoot, "bin")
    const argvPath = join(projectRoot, "codex-argv.json")
    const inboxPath = join(projectRoot, ".omo", "orchestrator", "inbox.json")
    await mkdir(binDir, { recursive: true })
    await mkdir(dirname(inboxPath), { recursive: true })
    await writeFile(
      join(binDir, "codex"),
      `#!/bin/sh\nprintf '%s\\n' "$@" > "${argvPath}"\n`,
      "utf8",
    )
    await chmod(join(binDir, "codex"), 0o755)
    await writeFile(
      inboxPath,
      JSON.stringify({
        version: 1,
        updatedAt: "2026-07-15T00:00:00.000Z",
        asks: [],
        threads: [{
          id: "thr-prior",
          binary: "codex",
          focus: "finish the prior implementation",
          resultPath: ".omo/orchestrator/prior-result.md",
          status: "running",
          sessionHint: "019-session-prior",
          appServerThreadId: null,
          appServerSessionId: null,
          appServerStatus: null,
        }],
      }),
    )

    const result = await runHook(
      { hookEventName: "SessionStart", source: "startup", cwd: projectRoot },
      { LFG_CODEX_BINARY: join(binDir, "codex"), LFG_MCP_READY: "1" },
    )

    const response = JSON.parse(result.stdout) as {
      readonly hookSpecificOutput?: { readonly additionalContext?: string }
    }
    expect(response.hookSpecificOutput?.additionalContext).toContain("<lfg-sessionstart-continue-work")
    await expect(readEventually(argvPath)).resolves.toMatch(/^exec\nresume\n019-session-prior\n/)
    const receipt = JSON.parse(
      await readFile(join(projectRoot, ".omo", "orchestrator", "sessionstart-continue-work-receipt.json"), "utf8"),
    ) as { readonly action?: string; readonly threadId?: string; readonly argv?: readonly string[] }
    expect(receipt).toMatchObject({
      action: "codex_exec_resume",
      threadId: "thr-prior",
    })
    expect(receipt.argv?.slice(0, 4)).toEqual(["codex", "exec", "resume", "019-session-prior"])
  })

  test("resumes when the Codex app-server thread channel answers thread/list", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-sessionstart-mcp-ready-"))
    const pluginRoot = join(projectRoot, "plugin")
    const binDir = join(projectRoot, "bin")
    const codexArgvPath = join(projectRoot, "codex-argv.json")
    const inboxPath = join(projectRoot, ".omo", "orchestrator", "inbox.json")
    await mkdir(pluginRoot, { recursive: true })
    await mkdir(binDir, { recursive: true })
    await mkdir(dirname(inboxPath), { recursive: true })
    await writeFile(
      join(pluginRoot, ".mcp.json"),
      JSON.stringify({ mcpServers: { ast_grep: {}, lsp: {} } }),
      "utf8",
    )
    await writeFile(
      join(binDir, "codex"),
      `#!/bin/sh
if [ "$1" = "app-server" ]; then
  while IFS= read -r line; do
    case "$line" in
      *'"id":1'*) printf '%s\\n' '{"id":1,"result":{}}' ;;
      *'"id":2'*) printf '%s\\n' '{"id":2,"result":{"data":[]}}'; exit 0 ;;
    esac
  done
  exit 1
fi
printf '%s\\n' "$@" > "${codexArgvPath}"
`,
      "utf8",
    )
    await chmod(join(binDir, "codex"), 0o755)
    await writeFile(
      inboxPath,
      JSON.stringify({
        version: 1,
        updatedAt: "2026-07-15T00:00:00.000Z",
        asks: [],
        threads: [{
          id: "thr-mcp-ready",
          focus: "resume after MCP load",
          resultPath: ".omo/orchestrator/mcp-ready-result.md",
          status: "running",
          sessionHint: "019-session-mcp-ready",
        }],
      }),
    )

    const result = await runHook(
      { hookEventName: "SessionStart", source: "startup", cwd: projectRoot },
      {
        GROK_PLUGIN_ROOT: pluginRoot,
        LFG_CODEX_BINARY: join(binDir, "codex"),
        LFG_MCP_READY_TIMEOUT_MS: "1000",
      },
    )

    const response = JSON.parse(result.stdout) as {
      readonly hookSpecificOutput?: { readonly additionalContext?: string }
    }
    expect(response.hookSpecificOutput?.additionalContext).toContain('<lfg-mcp-ready-gate status="mcp_ready">')
    expect(response.hookSpecificOutput?.additionalContext).toContain("Grok-Codex thread channel readiness confirmed")
    await expect(readEventually(codexArgvPath)).resolves.toMatch(/^exec\nresume\n019-session-mcp-ready\n/)
    const receipt = JSON.parse(
      await readFile(join(projectRoot, ".omo", "orchestrator", "sessionstart-mcp-ready-receipt.json"), "utf8"),
    ) as { readonly action?: string; readonly channel?: string; readonly readinessSource?: string }
    expect(receipt).toMatchObject({
      action: "mcp_ready",
      channel: "grok_codex",
      readinessSource: "codex_app_server",
    })
  })

  test("soft-waits without force-resuming when the Grok-Codex channel times out", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-sessionstart-mcp-timeout-"))
    const binDir = join(projectRoot, "bin")
    const codexArgvPath = join(projectRoot, "codex-argv.json")
    const inboxPath = join(projectRoot, ".omo", "orchestrator", "inbox.json")
    await mkdir(binDir, { recursive: true })
    await mkdir(dirname(inboxPath), { recursive: true })
    await writeFile(join(binDir, "mcp-probe"), "#!/bin/sh\nexit 1\n", "utf8")
    await chmod(join(binDir, "mcp-probe"), 0o755)
    await writeFile(
      inboxPath,
      JSON.stringify({
        version: 1,
        updatedAt: "2026-07-15T00:00:00.000Z",
        asks: [],
        threads: [{
          id: "thr-mcp-timeout",
          focus: "do not resume before MCP load",
          resultPath: ".omo/orchestrator/mcp-timeout-result.md",
          status: "running",
          sessionHint: "019-session-mcp-timeout",
        }],
      }),
    )

    const result = await runHook(
      { hookEventName: "SessionStart", source: "startup", cwd: projectRoot },
      {
        LFG_MCP_READY_PROBE: join(binDir, "mcp-probe"),
        LFG_MCP_READY_TIMEOUT_MS: "20",
        LFG_CODEX_BINARY: join(binDir, "missing-codex"),
        PATH: binDir,
      },
    )

    const response = JSON.parse(result.stdout) as {
      readonly hookSpecificOutput?: { readonly additionalContext?: string }
    }
    expect(response.hookSpecificOutput?.additionalContext).toContain('<lfg-mcp-ready-gate status="mcp_timeout">')
    expect(response.hookSpecificOutput?.additionalContext).toContain("Grok-Codex channel readiness timed out")
    expect(response.hookSpecificOutput?.additionalContext).toContain("do not force prior-work resume")
    await expect(readFile(codexArgvPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    const receipt = JSON.parse(
      await readFile(join(projectRoot, ".omo", "orchestrator", "sessionstart-mcp-ready-receipt.json"), "utf8"),
    ) as { readonly action?: string; readonly channel?: string; readonly guidance?: string }
    expect(receipt).toMatchObject({
      action: "mcp_timeout",
      channel: "grok_codex",
      guidance: "soft_wait",
    })
  })

  test("marks stale live metadata as soft guidance without suppressing codex exec resume", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-sessionstart-live-"))
    const binDir = join(projectRoot, "bin")
    const argvPath = join(projectRoot, "codex-live-argv.json")
    const inboxPath = join(projectRoot, ".omo", "orchestrator", "inbox.json")
    await mkdir(binDir, { recursive: true })
    await mkdir(dirname(inboxPath), { recursive: true })
    await writeFile(join(binDir, "codex"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${argvPath}"\n`, "utf8")
    await chmod(join(binDir, "codex"), 0o755)
    await writeFile(
      inboxPath,
      JSON.stringify({
        version: 1,
        updatedAt: "2026-07-15T00:00:00.000Z",
        asks: [],
        threads: [{
          id: "thr-live",
          binary: "codex",
          focus: "live prior work",
          resultPath: ".omo/orchestrator/live-result.md",
          status: "stale",
          sessionHint: "019-session-live",
          appServerThreadId: "thread-live",
          appServerSessionId: "019-session-live",
          appServerStatus: "active",
        }],
      }),
    )

    const result = await runHook(
      { hookEventName: "SessionStart", source: "resume", cwd: projectRoot },
      { LFG_CODEX_BINARY: join(binDir, "codex"), LFG_MCP_READY: "1" },
    )

    const response = JSON.parse(result.stdout) as {
      readonly hookSpecificOutput?: { readonly additionalContext?: string }
    }
    expect(response.hookSpecificOutput?.additionalContext).toContain('guidance="soft_stale_live"')
    await expect(readEventually(argvPath)).resolves.toMatch(/^exec\nresume\n019-session-live\n/)
    const receipt = JSON.parse(
      await readFile(join(projectRoot, ".omo", "orchestrator", "sessionstart-continue-work-receipt.json"), "utf8"),
    ) as { readonly action?: string; readonly guidance?: string; readonly threadId?: string }
    expect(receipt).toMatchObject({
      action: "codex_exec_resume",
      guidance: "soft_stale_live",
      threadId: "thr-live",
    })
  })

  test("always injects SessionStart continuation state and writes a no-work receipt", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-sessionstart-no-work-"))

    const result = await runHook(
      { hookEventName: "SessionStart", source: "startup", cwd: projectRoot },
      { LFG_MCP_READY: "1" },
    )

    const response = JSON.parse(result.stdout) as {
      readonly hookSpecificOutput?: { readonly additionalContext?: string }
    }
    expect(response.hookSpecificOutput?.additionalContext).toContain('action="no_prior_work"')
    const receipt = JSON.parse(
      await readFile(join(projectRoot, ".omo", "orchestrator", "sessionstart-continue-work-receipt.json"), "utf8"),
    ) as { readonly action?: string }
    expect(receipt.action).toBe("no_prior_work")
  })

  test("records UserPromptSubmit asks while auto-resume support is enabled", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-orchestrator-prompt-"))

    await runHook({ hookEventName: "UserPromptSubmit", cwd: projectRoot, prompt: "continue this ask" })

    const inbox = JSON.parse(
      await readFile(join(projectRoot, ".omo", "orchestrator", "inbox.json"), "utf8"),
    ) as { readonly asks?: readonly { readonly userText?: string }[] }
    expect(inbox.asks?.[0]?.userText).toBe("continue this ask")
  })

  test.each(["SessionStart", "UserPromptSubmit", "Stop"] as const)("refreshes the live Codex app-server monitor on every %s tick", async (hookEventName) => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-orchestrator-live-watch-"))
    const binDir = join(projectRoot, "bin")
    const argvPath = join(projectRoot, "watch-argv.txt")
    await mkdir(binDir, { recursive: true })
    await writeFile(join(binDir, "lfg"), `#!/bin/sh\nprintf '%s\\n' "$@" >> "${argvPath}"\nprintf '%s\\n' -- >> "${argvPath}"\nprintf '%s\\n' '{"ok":true,"status":"orchestrator_app_server_synced","appServer":{"availability":"available"}}'\n`, "utf8")
    await chmod(join(binDir, "lfg"), 0o755)

    const result = await runHook(
      { hookEventName, cwd: projectRoot, prompt: hookEventName === "UserPromptSubmit" ? "monitor this work" : "" },
      { LFG_CLI_BINARY: join(binDir, "lfg"), LFG_MONITOR_BOARD_AUTO_EXECUTE: "1", LFG_MCP_READY: "1" },
    )

    const argv = await readEventuallyContaining(argvPath, "goal\n--focus\nrepair the broken hooks")
    expect(argv).toContain("orchestrator\npoll")
    expect(argv).toContain("orchestrator\nwatch")
    if (hookEventName === "SessionStart") expect(argv).not.toContain("--no-start-daemon")
    else expect(argv).toContain("--no-start-daemon")
    const board = JSON.parse(await readFile(join(projectRoot, ".omo", "orchestrator", "monitor-board.json"), "utf8"))
    expect(board).toMatchObject({
      source: "hook",
      appServer: "available",
      counts: { unanswered: hookEventName === "UserPromptSubmit" ? 1 : 0 },
      duty: hookEventName === "UserPromptSubmit" ? "auto_goal_required" : "HEARTBEAT_OK",
    })
    expect(JSON.parse(result.stdout).hookSpecificOutput.additionalContext).toContain('<lfg-monitor-board source="hook" force="true">')
  })

  test("automatically starts a goal for a newly recorded ask", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-orchestrator-auto-goal-"))
    const binDir = join(projectRoot, "bin")
    const argvPath = join(projectRoot, "goal-argv.txt")
    await mkdir(binDir, { recursive: true })
    await writeFile(join(binDir, "lfg"), `#!/bin/sh\nprintf '%s\\n' "$@" >> "${argvPath}"\nprintf '%s\\n' -- >> "${argvPath}"\nprintf '%s\\n' '{"ok":true,"status":"goal_driven","transport":"app-server"}'\n`, "utf8")
    await chmod(join(binDir, "lfg"), 0o755)

    await runHook(
      { hookEventName: "UserPromptSubmit", cwd: projectRoot, prompt: "repair the broken hooks" },
      { LFG_CLI_BINARY: join(binDir, "lfg"), LFG_MONITOR_BOARD_AUTO_EXECUTE: "1" },
    )

    const argv = await readEventually(argvPath)
    expect(argv).toContain("goal\n--focus\nrepair the broken hooks")
    expect(argv).toContain("--ask-id\n")
  })

  test("does not stall SessionStart when the Codex channel is unavailable", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-sessionstart-fast-timeout-"))
    const startedAt = Date.now()

    const result = await runHook(
      { hookEventName: "SessionStart", source: "startup", cwd: projectRoot },
      { LFG_MCP_READY_TIMEOUT_MS: "", LFG_CODEX_BINARY: join(projectRoot, "missing-codex"), PATH: "/usr/bin:/bin" },
    )

    expect(result.exitCode).toBe(0)
    expect(Date.now() - startedAt).toBeLessThan(4_500)
    expect(JSON.parse(result.stdout).hookSpecificOutput.additionalContext).toContain('status="mcp_timeout"')
  })
})
