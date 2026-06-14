/// <reference types="node" />
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { readCodexProviderApiKey, resolveGrokApiKey } from "./grok-api-key"

describe("grok api key resolution", () => {
  test("prefers explicit OPENAI_API_KEY over Codex config", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-auth-explicit-"))
    await writeCodexConfig(home, "sk-from-codex")

    await expect(resolveGrokApiKey({ HOME: home, OPENAI_API_KEY: "sk-from-env" })).resolves.toBe("sk-from-env")
  })

  test("falls back to active Codex provider bearer token", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-auth-codex-"))
    await writeCodexConfig(home, "sk-from-codex")

    await expect(resolveGrokApiKey({ HOME: home, OPENAI_API_KEY: "" })).resolves.toBe("sk-from-codex")
  })

  test("reads quoted provider sections from Codex config", () => {
    const config = [
      'model_provider = "cliproxyapi"',
      "",
      '[model_providers."cliproxyapi"]',
      'experimental_bearer_token = "sk-provider-token"',
      "",
    ].join("\n")

    expect(readCodexProviderApiKey(config)).toBe("sk-provider-token")
  })
})

async function writeCodexConfig(home: string, token: string): Promise<void> {
  const codexHome = join(home, ".codex")
  await mkdir(codexHome, { recursive: true })
  await writeFile(
    join(codexHome, "config.toml"),
    [
      'model_provider = "cliproxyapi"',
      "",
      "[model_providers.cliproxyapi]",
      'base_url = "http://127.0.0.1:8317/v1"',
      `experimental_bearer_token = "${token}"`,
      "",
    ].join("\n"),
    "utf8",
  )
}
