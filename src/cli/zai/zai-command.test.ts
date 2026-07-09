import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { dispatchZaiCommand } from "./zai-command"

const previousHome = process.env.HOME
const previousGate = process.env.LFG_ALLOW_TEST_GROK_HOME
const previousKey = process.env.Z_AI_API_KEY

afterEach(() => {
  if (previousHome === undefined) delete process.env.HOME
  else process.env.HOME = previousHome
  if (previousGate === undefined) delete process.env.LFG_ALLOW_TEST_GROK_HOME
  else process.env.LFG_ALLOW_TEST_GROK_HOME = previousGate
  if (previousKey === undefined) delete process.env.Z_AI_API_KEY
  else process.env.Z_AI_API_KEY = previousKey
})

describe("dispatchZaiCommand", () => {
  test("set-api-key and install all registers packages", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-zai-cli-"))
    process.env.HOME = home
    process.env.LFG_ALLOW_TEST_GROK_HOME = "1"
    delete process.env.Z_AI_API_KEY

    const saved = await dispatchZaiCommand("auth", "set-api-key", {
      json: true,
      apiKeyFlag: "sk-test-cli",
      modeFlag: "ZAI",
      rest: [],
    })
    expect(saved).toMatchObject({ ok: true, status: "zai_auth_saved" })

    const installed = await dispatchZaiCommand("mcp", "install", {
      json: true,
      apiKeyFlag: null,
      modeFlag: null,
      rest: ["all"],
    })
    expect(installed).toMatchObject({ ok: true, status: "zai_mcp_installed" })
    if (typeof installed === "string") throw new Error("expected json")
    expect(installed.installed).toEqual(["vision", "web-search", "web-reader", "zread"])

    const toml = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(toml).toContain("[mcp_servers.zai-vision]")
    expect(toml).toContain("[mcp_servers.zai-web-search]")
  })
})
