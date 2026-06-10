import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { describe, expect, test } from "vitest"
import { resolveGrokHookBridgeAssetPath } from "./resolve-hook-bridge-asset"
import { runInternalGrokInstall } from "./run-internal"
import { verifyGrokInstallSurface } from "./post-install-verify"

describe("hook bridge integration", () => {
  test("setup repair installs bridge and runs rules session-start via bridge", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-bridge-int-"))
    const pluginRoot = join(home, ".grok", "installed-plugins", "lfg")
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
                    timeout: 10,
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

    const stubCli = join(pluginRoot, "components", "rules", "dist", "cli.js")
    await writeFile(
      stubCli,
      `#!/usr/bin/env node
let data='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',c=>data+=c);
process.stdin.on('end',()=>{
  const p=JSON.parse(data);
  if(p.hook_event_name!=='SessionStart'){process.exit(2);}
  if(!process.env.PLUGIN_ROOT){process.exit(3);}
  process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:'ok'}})+'\\n');
});
`,
    )
    await chmod(stubCli, 0o755)

    await runInternalGrokInstall({ HOME: home })

    const hooksRaw = await readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")
    expect(hooksRaw).toContain("lfg-grok-hook-bridge.mjs")
    expect(hooksRaw).toContain("GROK_PLUGIN_ROOT")

    const bridgePath = join(pluginRoot, "hooks", "lfg-grok-hook-bridge.mjs")
    const bridgeOnDisk = await readFile(bridgePath, "utf8")
    expect(bridgeOnDisk.length).toBeGreaterThan(100)

    const verify = await verifyGrokInstallSurface({ home })
    expect(verify.hooksRegistered).toBe(true)

    const grokPayload = JSON.stringify({
      hookEventName: "session_start",
      sessionId: "test-session",
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      model: "grok-build",
      permissionMode: "always-approve",
      source: "startup",
    })

    const commandLine = hooksRaw.match(/"command":\s*"([^"]+)"/)?.[1]
    expect(commandLine).toBeDefined()
    const { exitCode, stderr } = await runBridgeCommand(
      [bridgePath, "node", stubCli, "hook", "session-start"],
      grokPayload,
      {
      GROK_PLUGIN_ROOT: pluginRoot,
      GROK_PLUGIN_DATA: join(home, ".grok", "plugin-data", "lfg"),
      GROK_WORKSPACE_ROOT: process.cwd(),
      GROK_HOOK_EVENT: "session_start",
    })
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
  })
})

function runBridgeCommand(
  argv: string[],
  stdinPayload: string,
  env: Record<string, string>,
): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, argv, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let err = ""
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString()
    })
    child.stdin.write(stdinPayload)
    child.stdin.end()
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stderr: err }))
    child.on("error", () => resolve({ exitCode: 1, stderr: err }))
  })
}