import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { describe, expect, test } from "vitest"
import { installGrokPluginFromSource } from "./install"
import { mergePortedHooksIntoPlugin } from "./extension-hooks"

describe("extension-hooks", () => {
  test("normalize rewrites PLUGIN_ROOT in installed tree", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-ext-hooks-"))
    const source = join(import.meta.dirname, "fixture-minimal")
    const { pluginRoot } = await installGrokPluginFromSource({ home, sourceRoot: source })
    const hooksPath = join(pluginRoot, "hooks", "hooks.json")
    const withLegacy = {
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: "command",
                command: 'node "${PLUGIN_ROOT}/components/ultrawork/dist/cli.js" hook user-prompt-submit',
                timeout: 5,
              },
            ],
          },
        ],
      },
    }
    await writeFile(hooksPath, `${JSON.stringify(withLegacy, null, 2)}\n`, "utf8")
    await mergePortedHooksIntoPlugin(pluginRoot)
    const raw = await readFile(hooksPath, "utf8")
    expect(raw).toContain("${GROK_PLUGIN_ROOT}")
    expect(raw).not.toContain("${PLUGIN_ROOT}")
    expect(raw).toContain("lfg-native-ultrawork.js")
    expect(raw).toContain("lfg-config-loader.mjs")
  })

  test("second merge is stable (idempotent)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-ext-hooks-idem-"))
    const source = join(import.meta.dirname, "fixture-minimal")
    const { pluginRoot } = await installGrokPluginFromSource({ home, sourceRoot: source })
    await mergePortedHooksIntoPlugin(pluginRoot)
    const first = await readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")
    const firstActive = await readFile(join(home, ".grok", "hooks", "lfg-hooks.json"), "utf8")
    await mergePortedHooksIntoPlugin(pluginRoot)
    const second = await readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")
    const secondActive = await readFile(join(home, ".grok", "hooks", "lfg-hooks.json"), "utf8")
    expect(second).toBe(first)
    expect(secondActive).toBe(firstActive)
  })

  test("materializes active global hooks with absolute plugin paths for Grok runtime discovery", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-ext-hooks-active-"))
    const source = join(import.meta.dirname, "fixture-minimal")
    const { pluginRoot } = await installGrokPluginFromSource({ home, sourceRoot: source })
    await mergePortedHooksIntoPlugin(pluginRoot)

    const activeRaw = await readFile(join(home, ".grok", "hooks", "lfg-hooks.json"), "utf8")
    const active = JSON.parse(activeRaw) as { hooks: Record<string, readonly unknown[]> }
    expect(active.hooks.SessionStart).toBeDefined()
    expect(active.hooks.UserPromptSubmit).toBeDefined()
    expect(activeRaw).toContain(pluginRoot)
    expect(activeRaw).toContain("lfg-sisyphus-hooks.mjs")
    expect(activeRaw).not.toContain("${GROK_PLUGIN_ROOT}")
    expect(activeRaw).not.toContain("${PLUGIN_ROOT}")
    expect(activeRaw).not.toContain('"matcher": "^startup$"')
  })

  test("sisyphus orchestration hooks are injected on key events", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-ext-hooks-sisyphus-"))
    const source = join(import.meta.dirname, "fixture-minimal")
    const { pluginRoot } = await installGrokPluginFromSource({ home, sourceRoot: source })
    await mergePortedHooksIntoPlugin(pluginRoot)
    const raw = await readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")
    const parsed = JSON.parse(raw) as { hooks: Record<string, unknown[]> }
    expect(raw).toContain("lfg-sisyphus-hooks.mjs")
    expect(parsed.hooks.PreToolUse).toBeDefined()
    expect(parsed.hooks.PostToolUse).toBeDefined()
    expect(parsed.hooks.SubagentStop).toBeDefined()
    expect(parsed.hooks.Stop).toBeDefined()
    expect(parsed.hooks.PreCompact).toBeDefined()
    expect(parsed.hooks.Notification).toBeDefined()
    expect(parsed.hooks.SubagentStart).toBeDefined()
  })

  test("sisyphus hooks are idempotent across multiple merges", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-ext-hooks-sisyphus-idem-"))
    const source = join(import.meta.dirname, "fixture-minimal")
    const { pluginRoot } = await installGrokPluginFromSource({ home, sourceRoot: source })
    await mergePortedHooksIntoPlugin(pluginRoot)
    const first = await readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")
    const firstSisyphusCount = (first.match(/lfg-sisyphus-hooks\.mjs/g) ?? []).length
    await mergePortedHooksIntoPlugin(pluginRoot)
    await mergePortedHooksIntoPlugin(pluginRoot)
    const third = await readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8")
    const thirdSisyphusCount = (third.match(/lfg-sisyphus-hooks\.mjs/g) ?? []).length
    expect(thirdSisyphusCount).toBe(firstSisyphusCount)
    expect(thirdSisyphusCount).toBe(9)
  })

  test("invalid Grok hooks JSON fails closed during normalization", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-ext-hooks-invalid-"))
    const source = join(import.meta.dirname, "fixture-minimal")
    const { pluginRoot } = await installGrokPluginFromSource({ home, sourceRoot: source })
    await writeFile(
      join(pluginRoot, "hooks", "hooks.json"),
      `${JSON.stringify({ hooks: { BogusEvent: [{ hooks: [{ type: "command", command: "true" }] }] } }, null, 2)}\n`,
      "utf8",
    )

    await expect(mergePortedHooksIntoPlugin(pluginRoot)).rejects.toThrow("unknown Grok hook event")
  })

  test("config loader fails closed for malformed project .omo state", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-ext-hooks-omo-"))
    const source = join(import.meta.dirname, "fixture-minimal")
    const { pluginRoot } = await installGrokPluginFromSource({ home, sourceRoot: source })
    await mergePortedHooksIntoPlugin(pluginRoot)
    const projectRoot = await mkdtemp(join(tmpdir(), "lfg-ext-hooks-project-"))
    await mkdir(join(projectRoot, ".omo"), { recursive: true })
    await writeFile(join(projectRoot, ".omo", "boulder.json"), "{not-json", "utf8")

    const result = await runHookAsset(join(pluginRoot, "hooks", "lfg-config-loader.mjs"), {
      HOME: home,
      LFG_ALLOW_TEST_GROK_HOME: "1",
      GROK_HOOK_EVENT: "SessionStart",
    }, JSON.stringify({ hookEventName: "SessionStart", cwd: projectRoot }))

    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stdout).not.toContain("not-json")
    expect(result.stderr).toContain("LFG-OMO-LEDGER-ERROR")
    expect(result.stderr).toContain(join(projectRoot, ".omo", "boulder.json"))
  })
})

type HookAssetResult = {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

function runHookAsset(assetPath: string, env: Record<string, string>, stdin: string): Promise<HookAssetResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [assetPath], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", (error) => {
      reject(error)
    })
    child.on("close", (status) => {
      resolve({ status, stdout, stderr })
    })
    child.stdin.end(`${stdin}\n`)
  })
}
