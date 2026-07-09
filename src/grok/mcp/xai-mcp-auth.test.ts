import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, test } from "vitest"
import {
  clearXaiMcpAuth,
  getXaiMcpAuthStatus,
  readXaiMcpPackageAuth,
  resolveXaiMcpAuthPath,
  writeXaiMcpApiKey,
  writeXaiMcpOAuth,
  grokHostAuthPath,
  XAI_OAUTH_TOKEN_URL,
} from "./xai-mcp-auth"

describe("xai-mcp-auth", () => {
  const homes: string[] = []

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
  })

  test("dedicated api key file is separate from grok auth path", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-xai-auth-"))
    homes.push(home)
    const env = { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" }
    const dedicated = resolveXaiMcpAuthPath(env, home)
    expect(dedicated).toBe(join(home, ".grok", "xai-grok-mcp-auth.json"))
    expect(grokHostAuthPath(home)).toBe(join(home, ".grok", "auth.json"))
    expect(dedicated).not.toBe(grokHostAuthPath(home))
  })

  test("write and read dedicated api key", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-xai-auth-"))
    homes.push(home)
    const path = join(home, ".grok", "xai-grok-mcp-auth.json")
    await writeXaiMcpApiKey(path, "sk-test-xai")
    const parsed = await readXaiMcpPackageAuth(path)
    expect(parsed?.apiKey).toBe("sk-test-xai")
    const raw = JSON.parse(await readFile(path, "utf8")) as { auth_mode?: string }
    expect(raw.auth_mode).toBe("api_key")
    const grokAuth = join(home, ".grok", "auth.json")
    await expect(readFile(grokAuth, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("write and read dedicated oauth tokens", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-xai-auth-"))
    homes.push(home)
    const path = join(home, ".grok", "xai-grok-mcp-auth.json")
    const expires = Date.now() + 3600_000
    await writeXaiMcpOAuth(path, {
      provider: "xai-oauth",
      access: "oauth-access",
      refresh: "oauth-refresh",
      expires,
      tokenEndpoint: XAI_OAUTH_TOKEN_URL,
      tokenType: "Bearer",
    })
    const parsed = await readXaiMcpPackageAuth(path)
    expect(parsed).toMatchObject({
      provider: "xai-oauth",
      access: "oauth-access",
      refresh: "oauth-refresh",
      expires,
      tokenEndpoint: XAI_OAUTH_TOKEN_URL,
      tokenType: "Bearer",
    })
    const raw = JSON.parse(await readFile(path, "utf8")) as { auth_mode?: string; apiKey?: string }
    expect(raw.auth_mode).toBe("oauth")
    expect(raw.apiKey).toBeUndefined()
    await expect(readFile(grokHostAuthPath(home), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("rejects arbitrary oauth token endpoints", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-xai-auth-"))
    homes.push(home)
    const path = join(home, ".grok", "xai-grok-mcp-auth.json")
    await expect(
      writeXaiMcpOAuth(path, {
        provider: "xai-oauth",
        access: "oauth-access",
        refresh: "oauth-refresh",
        expires: Date.now() + 3600_000,
        tokenEndpoint: "https://auth.example.test/token",
        tokenType: "Bearer",
      }),
    ).rejects.toThrow(`OAuth token endpoint must be ${XAI_OAUTH_TOKEN_URL}`)
  })

  test("ignores stored oauth credentials with untrusted token endpoint", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-xai-auth-"))
    homes.push(home)
    const path = join(home, ".grok", "xai-grok-mcp-auth.json")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      path,
      JSON.stringify({
        provider: "xai-oauth",
        access: "oauth-access",
        refresh: "oauth-refresh",
        expires: Date.now() + 3600_000,
        tokenEndpoint: "https://auth.example.test/token",
        tokenType: "Bearer",
      }),
      "utf8",
    )
    await expect(readXaiMcpPackageAuth(path)).resolves.toBeNull()
  })

  test("auth writer rejects symlink and chmods existing files", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-xai-auth-"))
    homes.push(home)
    const path = join(home, ".grok", "xai-grok-mcp-auth.json")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(path, "{}", { mode: 0o644 })
    await writeXaiMcpApiKey(path, "sk-test")
    expect((await stat(path)).mode & 0o777).toBe(0o600)

    const target = join(home, "target.json")
    const link = join(home, ".grok", "link-auth.json")
    await writeFile(target, "{}", "utf8")
    await symlink(target, link)
    await expect(writeXaiMcpApiKey(link, "sk-test")).rejects.toThrow("Refusing to write xAI MCP auth through a symbolic link")
  })

  test("status prefers dedicated file over grok host oidc", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-xai-auth-"))
    homes.push(home)
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(
      grokHostAuthPath(home),
      JSON.stringify({
        "https://auth.x.ai::grok-cli": {
          auth_mode: "oidc",
          oidc_issuer: "https://auth.x.ai",
          oidc_client_id: "grok-cli",
          key: "host-access",
          refresh_token: "host-refresh",
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      }),
      "utf8",
    )
    const dedicated = resolveXaiMcpAuthPath({ HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" }, home)
    await writeXaiMcpApiKey(dedicated, "sk-dedicated")
    const status = await getXaiMcpAuthStatus({ HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" })
    expect(status.mode).toBe("api_key")
    expect(status.ok).toBe(true)
  })

  test("clear removes only dedicated file", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-xai-auth-"))
    homes.push(home)
    const path = join(home, ".grok", "xai-grok-mcp-auth.json")
    await writeXaiMcpApiKey(path, "sk-test")
    expect(await clearXaiMcpAuth(path)).toBe(true)
    expect(await readXaiMcpPackageAuth(path)).toBeNull()
  })
})
