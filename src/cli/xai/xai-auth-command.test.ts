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

  test("set-api-key without flag auto-discovers local codex CLI proxy credentials", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-xai-cli-auto-"))
    const { mkdir, writeFile } = await import("node:fs/promises")
    await mkdir(join(home, ".codex"), { recursive: true })
    await writeFile(
      join(home, ".codex", "config.toml"),
      [
        'model_provider = "9router"',
        "",
        "[model_providers.9router]",
        'base_url = "http://127.0.0.1:20128/v1"',
        'experimental_bearer_token = "sk-auto-9router"',
        "",
      ].join("\n"),
      "utf8",
    )
    const prevHome = process.env.HOME
    const prevGate = process.env.LFG_ALLOW_TEST_GROK_HOME
    const prevXai = process.env.XAI_API_KEY
    const prevOpenai = process.env.OPENAI_API_KEY
    Object.assign(process.env, { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" })
    delete process.env.XAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      const result = await dispatchXaiAuthCommand("set-api-key", {
        json: true,
        apiKeyFlag: null,
        noProbe: true,
      })
      expect(result).toMatchObject({
        ok: true,
        status: "xai_auth_saved",
        baseUrl: "http://127.0.0.1:20128/v1",
        source: "codex:model_providers.9router",
      })
      expect(result).toMatchObject({
        detection: {
          algorithm: "lfg-xai-cli-proxy-detect/v1",
          phases: ["collect", "normalize", "score", "select"],
        },
      })
      const path = resolveXaiMcpAuthPath(process.env, home)
      const auth = await readXaiMcpPackageAuth(path)
      expect(auth?.apiKey).toBe("sk-auto-9router")
      expect(auth?.baseUrl).toBe("http://127.0.0.1:20128/v1")
      expect(auth?.source).toBe("codex:model_providers.9router")
    } finally {
      if (prevHome === undefined) delete process.env.HOME
      else process.env.HOME = prevHome
      if (prevGate === undefined) delete process.env.LFG_ALLOW_TEST_GROK_HOME
      else process.env.LFG_ALLOW_TEST_GROK_HOME = prevGate
      if (prevXai === undefined) delete process.env.XAI_API_KEY
      else process.env.XAI_API_KEY = prevXai
      if (prevOpenai === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = prevOpenai
    }
  })

  test("detect returns algorithm report without writing secrets", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-xai-cli-detect-"))
    const { mkdir, writeFile } = await import("node:fs/promises")
    await mkdir(join(home, ".codex"), { recursive: true })
    await writeFile(
      join(home, ".codex", "config.toml"),
      [
        'model_provider = "cliproxyapi"',
        "",
        "[model_providers.cliproxyapi]",
        'base_url = "http://127.0.0.1:8317/v1"',
        'experimental_bearer_token = "sk-detect-only"',
        "",
      ].join("\n"),
      "utf8",
    )
    const prevHome = process.env.HOME
    const prevGate = process.env.LFG_ALLOW_TEST_GROK_HOME
    const prevXai = process.env.XAI_API_KEY
    const prevOpenai = process.env.OPENAI_API_KEY
    Object.assign(process.env, { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" })
    delete process.env.XAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      const result = await dispatchXaiAuthCommand("detect", { json: true, apiKeyFlag: null, noProbe: true })
      expect(result).toMatchObject({
        ok: true,
        status: "xai_auth_detect",
        algorithm: "lfg-xai-cli-proxy-detect/v1",
      })
      const text = JSON.stringify(result)
      expect(text).not.toContain("sk-detect-only")
      expect(text).toContain("keyFingerprint")
    } finally {
      if (prevHome === undefined) delete process.env.HOME
      else process.env.HOME = prevHome
      if (prevGate === undefined) delete process.env.LFG_ALLOW_TEST_GROK_HOME
      else process.env.LFG_ALLOW_TEST_GROK_HOME = prevGate
      if (prevXai === undefined) delete process.env.XAI_API_KEY
      else process.env.XAI_API_KEY = prevXai
      if (prevOpenai === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = prevOpenai
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
