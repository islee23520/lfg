import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))

describe("docs/grok-adapter-core-port-strategy.md", () => {
  test("codifies the upstream core/adapter split and lfg's strategic shift", async () => {
    const text = await readFile(join(ROOT, "docs/grok-adapter-core-port-strategy.md"), "utf8")
    // Product framing parity with sibling docs
    expect(text).toContain("GrokBuild port")
    expect(text).toContain("Grok Build plugin payload")
    expect(text).toContain("lfgIsPlugin: false")
    expect(text).toContain("not reported as a Grok plugin object")
    expect(text).toContain("setup --run")
    expect(text).toContain("~/.grok/plugins/lfg")
    expect(text).toContain("https://github.com/code-yeongyu/oh-my-openagent")

    // Upstream core/adapter architecture finding
    expect(text).toContain("core/adapter split")
    expect(text).toContain("omo-codex")
    expect(text).toContain("omo-opencode")
    expect(text).toContain("packaging/install reference")
    expect(text).toContain("architectural reference")

    // The strategic decision
    expect(text).toContain("Decision: shift from `omo-codex` 1:1 mapping to a core-consuming Grok adapter")
    expect(text).toContain("*-core")

    // Host seam map + Grok gaps
    expect(text).toContain("seam map")
    expect(text).toContain("PreToolUse")
    expect(text).toContain("PostToolUse")
    expect(text).toContain("experimental.chat.system.transform")
    expect(text).toContain("Real GrokBuild gaps")

    // Roadmap with codegraph as phase 0
    expect(text).toContain("## Port roadmap")
    expect(text).toContain("codegraph")
    expect(text).toContain("Phase 0")
    expect(text).toContain("rules-engine")
    expect(text).toContain("model-core")
    expect(text).toContain("prompts-core")
    expect(text).toContain("Shipped (partial)")
    expect(text).toContain("skills-loader-core")
    expect(text).toContain("Shipped (curated)")
    expect(text).toContain("@colbymchenry/codegraph")

    // Model family mapping risk
    expect(text).toContain("xai/grok-*")

    // Anti-patterns
    expect(text).toContain("## What lfg must not do")
    expect(text).toContain("manifest-only MCP stubs")
  })
})
