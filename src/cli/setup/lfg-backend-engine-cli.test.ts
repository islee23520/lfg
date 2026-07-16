import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg } from "../test/test-process"

describe("setup backend engine CLI", () => {
  test("rejects unsupported backend engines without prompting", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-backend-invalid-"))

    const result = await runLfg(["--json", "setup", "--run", "--backend-engine", "other"], {
      LFG_ALLOW_TEST_GROK_HOME: "1",
      LFG_TEST_GROK_HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
    })

    expect(result.exitCode).toBe(1)
    expect(result.json).toMatchObject({
      ok: false,
      status: "invalid_backend_engine",
      supportedBackendEngines: ["grok", "codex"],
    })
  })

  test("persists an explicit backend engine during isolated automated setup", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-backend-run-"))

    const result = await runLfg(["--json", "setup", "--run", "--backend-engine", "codex"], {
      LFG_ALLOW_TEST_GROK_HOME: "1",
      LFG_TEST_GROK_HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
    })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({ backendEngine: { selected: "codex" } })
    const config = JSON.parse(await readFile(join(home, ".grok", "lfg-backend-routing.json"), "utf8"))
    expect(config).toMatchObject({ global: "codex" })
  })

  test("preserves and normalizes a legacy gemini backend on setup rerun without an explicit flag", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-backend-legacy-rerun-"))
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(join(home, ".grok", "config.toml"), "[omo.external_engine]\nbackend = \"gemini\"\n", "utf8")

    const result = await runLfg(["--json", "setup", "--run"], {
      LFG_ALLOW_TEST_GROK_HOME: "1",
      LFG_TEST_GROK_HOME: home,
      LFG_DISABLE_DEFAULT_MODELS_PROXY: "1",
    })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({ backendRouting: { global: "codex" } })
    const config = JSON.parse(await readFile(join(home, ".grok", "lfg-backend-routing.json"), "utf8"))
    expect(config).toMatchObject({ global: "codex" })
  })
})
