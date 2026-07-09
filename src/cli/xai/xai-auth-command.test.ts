import { mkdtemp } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, test } from "vitest"
import { dispatchXaiAuthCommand } from "./xai-auth-command"
import { readXaiMcpPackageAuth, resolveXaiMcpAuthPath, XAI_OAUTH_TOKEN_URL } from "../../grok/mcp/xai-mcp-auth"

describe("xai auth command", () => {
  test("set-api-key writes dedicated file without touching grok auth", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-xai-cli-"))
    const env = { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" }
    const prevHome = process.env.HOME
    const prevGate = process.env.LFG_ALLOW_TEST_GROK_HOME
    Object.assign(process.env, env)
    try {
      const result = await dispatchXaiAuthCommand("set-api-key", { json: true, apiKeyFlag: "sk-test-cli" })
      expect(result).toMatchObject({ ok: true, status: "xai_auth_saved" })
      const path = resolveXaiMcpAuthPath(process.env, home)
      const auth = await readXaiMcpPackageAuth(path)
      expect(auth?.apiKey).toBe("sk-test-cli")
    } finally {
      if (prevHome === undefined) delete process.env.HOME
      else process.env.HOME = prevHome
      if (prevGate === undefined) delete process.env.LFG_ALLOW_TEST_GROK_HOME
      else process.env.LFG_ALLOW_TEST_GROK_HOME = prevGate
    }
  })

  test("set-oauth writes dedicated oauth tokens without touching grok auth", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-xai-cli-"))
    const env = { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" }
    const prevHome = process.env.HOME
    const prevGate = process.env.LFG_ALLOW_TEST_GROK_HOME
    Object.assign(process.env, env)
    try {
      const result = await dispatchXaiAuthCommand("set-oauth", {
        json: true,
        apiKeyFlag: null,
        oauthAccessToken: "oauth-access-cli",
        oauthRefreshToken: "oauth-refresh-cli",
        oauthExpiresAt: "2099-01-01T00:00:00.000Z",
        oauthTokenEndpoint: XAI_OAUTH_TOKEN_URL,
        oauthTokenType: "Bearer",
      })
      expect(result).toMatchObject({ ok: true, status: "xai_oauth_saved", mode: "oauth" })
      const path = resolveXaiMcpAuthPath(process.env, home)
      const auth = await readXaiMcpPackageAuth(path)
      expect(auth).toMatchObject({
        provider: "xai-oauth",
        access: "oauth-access-cli",
        refresh: "oauth-refresh-cli",
        tokenEndpoint: XAI_OAUTH_TOKEN_URL,
      })
    } finally {
      if (prevHome === undefined) delete process.env.HOME
      else process.env.HOME = prevHome
      if (prevGate === undefined) delete process.env.LFG_ALLOW_TEST_GROK_HOME
      else process.env.LFG_ALLOW_TEST_GROK_HOME = prevGate
    }
  })

  test("set-oauth rejects arbitrary token endpoints", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-xai-cli-"))
    const env = { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" }
    const prevHome = process.env.HOME
    const prevGate = process.env.LFG_ALLOW_TEST_GROK_HOME
    Object.assign(process.env, env)
    try {
      await expect(
        dispatchXaiAuthCommand("set-oauth", {
          json: true,
          apiKeyFlag: null,
          oauthAccessToken: "oauth-access-cli",
          oauthRefreshToken: "oauth-refresh-cli",
          oauthExpiresAt: "2099-01-01T00:00:00.000Z",
          oauthTokenEndpoint: "https://auth.example.test/token",
          oauthTokenType: "Bearer",
        }),
      ).rejects.toThrow(`OAuth token endpoint must be ${XAI_OAUTH_TOKEN_URL}`)
    } finally {
      if (prevHome === undefined) delete process.env.HOME
      else process.env.HOME = prevHome
      if (prevGate === undefined) delete process.env.LFG_ALLOW_TEST_GROK_HOME
      else process.env.LFG_ALLOW_TEST_GROK_HOME = prevGate
    }
  })

  test("status reports grokHostAuthUntouched", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-xai-cli-"))
    const prevHome = process.env.HOME
    const prevGate = process.env.LFG_ALLOW_TEST_GROK_HOME
    Object.assign(process.env, { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" })
    try {
      const result = await dispatchXaiAuthCommand("status", { json: true, apiKeyFlag: null })
      expect(result).toMatchObject({ grokHostAuthUntouched: true, status: "xai_auth_status" })
    } finally {
      if (prevHome === undefined) delete process.env.HOME
      else process.env.HOME = prevHome
      if (prevGate === undefined) delete process.env.LFG_ALLOW_TEST_GROK_HOME
      else process.env.LFG_ALLOW_TEST_GROK_HOME = prevGate
    }
  })
})
