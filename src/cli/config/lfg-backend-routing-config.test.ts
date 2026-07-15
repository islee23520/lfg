import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { defaultBackendRoutingConfig } from "../../core/lfg/backend-routing"
import { readBackendRoutingConfig, writeBackendRoutingConfig } from "./lfg-grok-config"

describe("backend routing config.toml", () => {
  test("round-trips global and every slim native agent route", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-backend-routing-"))
    const defaults = defaultBackendRoutingConfig()
    const configured = {
      ...defaults,
      global: "grok" as const,
      agents: { ...defaults.agents, explorer: "codex" as const },
    }

    await writeBackendRoutingConfig(home, configured)

    await expect(readBackendRoutingConfig(home)).resolves.toEqual(configured)
    const toml = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(toml).toContain("[omo.backend_routing]")
    expect(toml).toContain("[omo.backend_routing.agents]")
    expect(toml).toContain('explorer = "codex"')
    expect(toml).not.toContain("oracle")
  })

  test("normalizes retired external backends to codex while reading", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-backend-routing-legacy-"))
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(join(home, ".grok", "config.toml"), [
      "[omo.backend_routing]",
      'global = "gemini"',
      "",
      "[omo.backend_routing.agents]",
      'multimodal-looker = "gemini"',
      'lazycodex = "claude"',
      "",
    ].join("\n"), "utf8")

    const result = await readBackendRoutingConfig(home)

    expect(result.global).toBe("codex")
    expect(result.categories).toEqual({})
    expect(Object.keys(result.agents)).not.toContain("lazycodex")
    expect(Object.keys(result.agents)).not.toContain("multimodal-looker")
  })
})
