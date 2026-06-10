import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { readLazycodexAgentsFromGrokConfig } from "./read-lazycodex-agents-from-config"
import { FALLBACK_GLOBAL_LAZYCODEX_AGENTS, resolveGlobalLazycodexAgentConfig } from "./resolve-global-agent-config"

describe("readLazycodexAgentsFromGrokConfig", () => {
  test("reads three agent sections from config.toml", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-read-agents-"))
    const configDir = join(home, ".grok")
    await mkdir(configDir, { recursive: true })
    await writeFile(
      join(configDir, "config.toml"),
      `[lazycodex.agents.explorer]
model = "m-explorer"
reasoning_level = "low"

[lazycodex.agents.reasoning]
model = "m-reason"
reasoning_level = "xhigh"

[lazycodex.agents.coding]
model = "m-code"
reasoning_level = "medium"
`,
      "utf8",
    )
    const agents = await readLazycodexAgentsFromGrokConfig(home)
    expect(agents?.explorer.model).toBe("m-explorer")
    expect(agents?.reasoning.reasoningLevel).toBe("xhigh")
    expect(agents?.coding.model).toBe("m-code")
  })

  test("fills missing agent sections from lazycodex.models", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-read-agents-models-"))
    const configDir = join(home, ".grok")
    await mkdir(configDir, { recursive: true })
    await writeFile(
      join(configDir, "config.toml"),
      `[lazycodex.models]
default = "d"
reasoning = "r"
coding = "c"
`,
      "utf8",
    )
    const agents = await readLazycodexAgentsFromGrokConfig(home)
    expect(agents?.explorer.model).toBe("d")
    expect(agents?.reasoning.model).toBe("r")
    expect(agents?.coding.model).toBe("c")
  })
})

describe("resolveGlobalLazycodexAgentConfig", () => {
  test("null discovery uses config.toml when present", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-resolve-agents-"))
    const configDir = join(home, ".grok")
    await mkdir(configDir, { recursive: true })
    await writeFile(
      join(configDir, "config.toml"),
      `[lazycodex.agents.explorer]
model = "from-config"
reasoning_level = "high"

[lazycodex.agents.reasoning]
model = "from-config"
reasoning_level = "high"

[lazycodex.agents.coding]
model = "from-config"
reasoning_level = "high"
`,
      "utf8",
    )
    const resolved = await resolveGlobalLazycodexAgentConfig(home, null)
    expect(resolved.explorer.model).toBe("from-config")
  })

  test("null discovery without config uses grok-build fallback", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-resolve-fallback-"))
    const resolved = await resolveGlobalLazycodexAgentConfig(home, null)
    expect(resolved).toEqual(FALLBACK_GLOBAL_LAZYCODEX_AGENTS)
  })
})