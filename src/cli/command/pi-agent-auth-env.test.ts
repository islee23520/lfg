import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { buildPiAgentLfgAuthEnv } from "./pi-agent-auth-env"

describe("pi-agent auth env", () => {
  test("replaces an existing OpenAI key when the OpenAI base URL defaults to xAI", async () => {
    // Given: dedicated xAI credentials and an unrelated OpenAI key in the parent env.
    const home = await mkdtemp(join(tmpdir(), "lfg-pi-agent-auth-"))
    await writeDedicatedApiKey(home, "sk-test-xai-dedicated")

    // When: the pi-agent launch env is built without an explicit OpenAI base URL.
    const result = await buildPiAgentLfgAuthEnv({ OPENAI_API_KEY: "sk-test-openai-parent" }, home)

    // Then: OpenAI-compatible env points at xAI with the xAI key, not the parent OpenAI key.
    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.env.OPENAI_BASE_URL).toBe("https://api.x.ai/v1")
      expect(result.env.OPENAI_API_KEY).toBe("sk-test-xai-dedicated")
      expect(result.env.XAI_API_KEY).toBe("sk-test-xai-dedicated")
      expect(result.env.OPENAI_API_KEY).not.toBe("sk-test-openai-parent")
    }
  })

  test("uses XAI_API_KEY as the explicit xAI-compatible source before host auth", async () => {
    // Given: provider-specific xAI credentials and an unrelated OpenAI key in the parent env.
    const home = await mkdtemp(join(tmpdir(), "lfg-pi-agent-auth-"))

    // When: no dedicated auth file exists.
    const result = await buildPiAgentLfgAuthEnv(
      { XAI_API_KEY: "sk-test-xai-env", OPENAI_API_KEY: "sk-test-openai-parent" },
      home,
    )

    // Then: the xAI env key is the OpenAI-compatible key forwarded to pi-agent.
    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.env.LFG_PI_AGENT_AUTH_SOURCE).toBe("xai-api-key-env")
      expect(result.env.OPENAI_BASE_URL).toBe("https://api.x.ai/v1")
      expect(result.env.OPENAI_API_KEY).toBe("sk-test-xai-env")
      expect(result.env.OPENAI_API_KEY).not.toBe("sk-test-openai-parent")
    }
  })

  test("removes a parent OpenAI key when xAI is the default base URL and no xAI credential exists", async () => {
    // Given: only an unrelated OpenAI key is present in the parent env.
    const home = await mkdtemp(join(tmpdir(), "lfg-pi-agent-auth-"))

    // When: no dedicated, env, or host xAI credential exists and the OpenAI base URL defaults to xAI.
    const result = await buildPiAgentLfgAuthEnv({ OPENAI_API_KEY: "sk-test-openai-parent" }, home)

    // Then: pi-agent does not receive the parent OpenAI key on the xAI-compatible route.
    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.env.OPENAI_BASE_URL).toBeUndefined()
      expect(result.env.OPENAI_API_KEY).toBeUndefined()
      expect(result.env.XAI_API_KEY).toBeUndefined()
    }
  })

  test("preserves an OpenAI key when the OpenAI base URL is explicitly non-xAI", async () => {
    // Given: dedicated xAI credentials and an explicit non-xAI OpenAI-compatible endpoint.
    const home = await mkdtemp(join(tmpdir(), "lfg-pi-agent-auth-"))
    await writeDedicatedApiKey(home, "sk-test-xai-dedicated")

    // When: the parent env explicitly routes OPENAI_* to another provider.
    const result = await buildPiAgentLfgAuthEnv(
      { OPENAI_BASE_URL: "https://api.openai.com/v1", OPENAI_API_KEY: "sk-test-openai-parent" },
      home,
    )

    // Then: xAI credentials stay provider-specific and the explicit OpenAI route remains intact.
    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.env.OPENAI_BASE_URL).toBe("https://api.openai.com/v1")
      expect(result.env.OPENAI_API_KEY).toBe("sk-test-openai-parent")
      expect(result.env.XAI_API_KEY).toBe("sk-test-xai-dedicated")
    }
  })
})

async function writeDedicatedApiKey(home: string, apiKey: string): Promise<void> {
  const grokDir = join(home, ".grok")
  await mkdir(grokDir, { recursive: true })
  await writeFile(join(grokDir, "xai-grok-mcp-auth.json"), JSON.stringify({ apiKey }), "utf8")
}
