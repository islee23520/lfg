import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { writeGrokModelConfig } from "./lfg-grok-config"
import { fetchModelDiscovery } from "../models/lfg-models"

describe("model feature metadata from OpenAI-compatible /v1/models", () => {
  test("writes usable ULW feature metadata into Grok model sections", async () => {
    const original = globalThis.fetch
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("/v1/models")) {
        return new Response(
          JSON.stringify({
            data: [
              { id: "gpt-5.5", context_window: 400000, usable: true, features: ["ulw"] },
              { id: "gpt-5.4-mini", context_window: 200000, usable: true, features: ["chat"] },
            ],
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({}), { status: 404 })
    }

    try {
      const home = await mkdtemp(join(tmpdir(), "lfg-model-features-"))
      const discovery = await fetchModelDiscovery("https://cliproxy.linalab.io/v1")

      await writeGrokModelConfig(discovery, { home, apiKey: "sk-not-in-output" })

      const config = await readFile(join(home, ".grok", "config.toml"), "utf8")
      expect(section(config, 'model."gpt-5.5"')).toContain("usable = true")
      expect(section(config, 'model."gpt-5.5"')).toContain('features = ["ulw"]')
      expect(section(config, 'model."gpt-5.4-mini"')).toContain("usable = true")
      expect(section(config, 'model."gpt-5.4-mini"')).toContain('features = ["chat"]')
      expect(section(config, 'model."grok-build"')).toContain('features = ["ulw"]')
    } finally {
      globalThis.fetch = original
    }
  })
})

function section(source: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\[${escaped}\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`).exec(source)?.[0] ?? ""
}
