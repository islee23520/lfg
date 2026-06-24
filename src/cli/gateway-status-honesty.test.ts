import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg } from "./test/test-process"

describe("gateway status honesty", () => {
  test("install-only setup reports missing native agents without overclaiming plugin identity", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-gateway-honesty-"))
    const result = await runLfg(["--json", "setup", "--run", "--install-only"], {
      HOME: home,
      OPENAI_API_KEY: "sk-test",
    })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      lfgIsPlugin: false,
      companionPackage: "lfg-grok-install",
      postInstallVerify: {
        nativeHookStatus: "native_grok_events",
        bridgeFallback: false,
        nativeAgents: { status: "missing" },
      },
    })
    expect(JSON.stringify(result.json)).not.toContain("@islee23520/lfp")
    const hooksRaw = await readFile(join(home, ".grok", "hooks", "lfg-hooks.json"), "utf8")
    expect(hooksRaw).toContain("lfg-native-rules.js")
    expect(hooksRaw).toContain("lfg-native-ultrawork.js")
    expect(hooksRaw).toContain("lfg-sisyphus-hooks.mjs")
  })
})
