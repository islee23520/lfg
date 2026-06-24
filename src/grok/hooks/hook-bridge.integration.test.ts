import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { describe, expect, test } from "vitest"
import { resolveGrokHookBridgeAssetPath } from "./resolve-hook-bridge-asset"
import { runInternalGrokInstall } from "../install/run-internal"
import { verifyGrokInstallSurface } from "../doctor/post-install-verify"

describe("hook bridge integration", () => {
  test("setup repair installs bridge and runs rules session-start via bridge", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-bridge-int-"))
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

    await writeFile(
      join(pluginRoot, "lfg-install.json"),
      `${JSON.stringify({ packageName: "@islee23520/lfg", version: "test", platform: "grok" }, null, 2)}\n`,
    )

    await runInternalGrokInstall({ HOME: home })

    await expect(readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")).rejects.toThrow()
    const hooksRaw = await readFile(join(home, ".grok", "hooks", "lfg-hooks.json"), "utf8")
    expect(hooksRaw).toContain("lfg-native-rules.js")
    expect(hooksRaw).not.toContain("lfg-grok-hook-bridge.mjs")
    expect(hooksRaw).toContain(pluginRoot)

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

  test("bridge runs ultrawork UserPromptSubmit via bridge and receives directive", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-bridge-ulw-"))
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    await mkdir(join(pluginRoot, "hooks"), { recursive: true })
    await mkdir(join(pluginRoot, "components", "ultrawork", "dist"), { recursive: true })
    await writeFile(
      join(pluginRoot, "hooks", "hooks.json"),
      `${JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: "command",
                    command: 'node "${PLUGIN_ROOT}/components/ultrawork/dist/cli.js" hook user-prompt-submit',
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

    const stubCli = join(pluginRoot, "components", "ultrawork", "dist", "cli.js")
    await writeFile(
      stubCli,
      `#!/usr/bin/env node
let data='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',c=>data+=c);
process.stdin.on('end',()=>{
  const p=JSON.parse(data);
  if(p.hook_event_name!=='UserPromptSubmit'){process.exit(2);}
  if(!process.env.PLUGIN_ROOT){process.exit(3);}
  process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:'lfg-ulw-directive-ok'}})+'\\n');
});
`,
    )
    await chmod(stubCli, 0o755)

    await writeFile(
      join(pluginRoot, "lfg-install.json"),
      `${JSON.stringify({ packageName: "@islee23520/lfg", version: "test", platform: "grok" }, null, 2)}\n`,
    )

    await runInternalGrokInstall({ HOME: home })

    await expect(readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")).rejects.toThrow()
    const hooksRaw = await readFile(join(home, ".grok", "hooks", "lfg-hooks.json"), "utf8")
    expect(hooksRaw).toContain("lfg-native-ultrawork.js")
    expect(hooksRaw).not.toContain("lfg-grok-hook-bridge.mjs")

    const bridgePath = join(pluginRoot, "hooks", "lfg-grok-hook-bridge.mjs")
    const grokPayload = JSON.stringify({
      hookEventName: "user_prompt_submit",
      sessionId: "ulw-test",
      cwd: process.cwd(),
      prompt: "do the ultrawork",
    })

    const { exitCode, stderr } = await runBridgeCommand(
      [bridgePath, "node", stubCli, "hook", "user-prompt-submit"],
      grokPayload,
      {
        GROK_PLUGIN_ROOT: pluginRoot,
        GROK_PLUGIN_DATA: join(home, ".grok", "plugin-data", "lfg"),
        GROK_WORKSPACE_ROOT: process.cwd(),
        GROK_HOOK_EVENT: "user_prompt_submit",
      },
    )
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
  })

  test("bridge exits non-zero when child hook command fails", async () => {
    const bridgePath = await resolveGrokHookBridgeAssetPath()
    const grokPayload = JSON.stringify({
      hookEventName: "session_start",
      sessionId: "test-session",
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      source: "startup",
    })

    const { exitCode } = await runBridgeCommand(
      [bridgePath, "node", "-e", "process.stdin.resume(); process.stdin.on('end',()=>process.exit(7))"],
      grokPayload,
      {
        GROK_PLUGIN_ROOT: join(tmpdir(), "lfg-missing-plugin-root"),
        GROK_PLUGIN_DATA: join(tmpdir(), "lfg-missing-plugin-data"),
        GROK_WORKSPACE_ROOT: process.cwd(),
        GROK_HOOK_EVENT: "session_start",
      },
    )

    expect(exitCode).toBe(7)
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
