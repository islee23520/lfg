import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))

describe("docs/grok-adapter-agent-model-source-map.md", () => {
  test("is linked from the parity document", async () => {
    const text = await readFile(join(ROOT, "docs/grok-adapter-parity.md"), "utf8")

    expect(text).toContain("Agent/Model Source Map")
    expect(text).toContain("docs/grok-adapter-agent-model-source-map.md")
  })

  test("maps every T5 upstream declaration file to a Grok target or no equivalent", async () => {
    const text = await readFile(join(ROOT, "docs/grok-adapter-agent-model-source-map.md"), "utf8")

    for (const upstream of [
      "dist/plugin/event.d.ts",
      "dist/plugin/tool-registry.d.ts",
      "dist/plugin/system-transform.d.ts",
      "dist/plugin/messages-transform.d.ts",
      "dist/plugin/session-agent-resolver.d.ts",
      "dist/plugin/chat-message/start-work-message.d.ts",
      "dist/agents/builtin-agents/general-agents.d.ts",
      "dist/agents/builtin-agents/model-resolution.d.ts",
    ] as const) {
      expect(text).toContain(upstream)
    }

    expect(text).toContain("local Grok target")
    expect(text).toContain("no Grok equivalent")
    expect(text).toContain("src/grok-adapter/native-omo-agents.ts")
    expect(text).toContain("src/grok-adapter/sync-lazycodex-agents-to-grok.ts")
    expect(text).toContain("src/grok-adapter/lazycodex-agent-overrides.ts")
    expect(text).toContain("src/cli/lfg-setup-tui-agents.ts")
    expect(text).toContain("prompt injection")
    expect(text).toContain(".omo/evidence/grokbuild-omo-porting/task-5-upstream-dts.txt")
  })
})
