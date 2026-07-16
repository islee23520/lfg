import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { defaultBackendRoutingConfig } from "../../core/lfg/backend-routing"
import { readBackendRoutingConfig, writeBackendRoutingConfig } from "./lfg-grok-config"

describe("backend routing config", () => {
  test("round-trips routing through the lfg JSON file without writing config.toml", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-backend-routing-"))
    const defaults = defaultBackendRoutingConfig()
    const configured = {
      ...defaults,
      global: "grok" as const,
      agents: { ...defaults.agents, sisyphus: "grok" as const },
    }

    await writeBackendRoutingConfig(home, configured)

    await expect(readBackendRoutingConfig(home)).resolves.toEqual(configured)
    const json = JSON.parse(await readFile(join(home, ".grok", "lfg-backend-routing.json"), "utf8"))
    expect(json).toEqual(configured)
    await expect(readFile(join(home, ".grok", "config.toml"), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("applies only the optional global config.toml override and ignores legacy agent maps", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-backend-routing-override-"))
    const defaults = defaultBackendRoutingConfig()
    await writeBackendRoutingConfig(home, { ...defaults, global: "grok" })
    await writeFile(join(home, ".grok", "config.toml"), `[omo.backend_routing]\nglobal = "codex"\n\n[omo.backend_routing.agents]\nexplorer = "codex"\n`, "utf8")

    await expect(readBackendRoutingConfig(home)).resolves.toMatchObject({
      global: "codex",
      agents: { sisyphus: "grok" },
    })
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
