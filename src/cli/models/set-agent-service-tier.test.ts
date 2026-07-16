import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { applyAgentServiceTier } from "./set-agent-service-tier"

describe("applyAgentServiceTier (Grok model-id tier flip)", () => {
  test("flips Sisyphus role model from *-fast to default without writing service_tier into role TOML", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-set-tier-"))
    await mkdir(join(home, ".grok", "roles"), { recursive: true })
    await writeFile(
      join(home, ".grok", "roles", "sisyphus.toml"),
      [
        'description = "LazyCodex explorer agent"',
        'model = "grok-composer-2.5-fast"',
        'reasoning_effort = "high"',
        "",
      ].join("\n"),
      "utf8",
    )
    await writeFile(
      join(home, ".grok", "omo-agent-overrides.json"),
      JSON.stringify(
        {
          version: 1,
          overrides: {
            sisyphus: {
              model: "grok-composer-2.5-fast",
              reasoning_level: "high",
              service_tier: "fast",
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    )

    const result = await applyAgentServiceTier({
      home,
      agent: "sisyphus",
      tier: "default",
      modelIds: ["grok-composer-2.5", "grok-composer-2.5-fast", "grok-4.5"],
    })

    expect(result.agent).toBe("sisyphus")
    expect(result.tier).toBe("default")
    expect(result.fromModel).toBe("grok-composer-2.5-fast")
    expect(result.toModel).toBe("grok-composer-2.5")
    expect(result.rolePath).toBe(join(home, ".grok", "roles", "sisyphus.toml"))

    const role = await readFile(result.rolePath, "utf8")
    expect(role).toContain('model = "grok-composer-2.5"')
    expect(role).not.toMatch(/service_tier\s*=/)

    const overrides = JSON.parse(await readFile(join(home, ".grok", "omo-agent-overrides.json"), "utf8")) as {
      overrides: Record<string, { model: string; service_tier?: string }>
    }
    expect(overrides.overrides.sisyphus.model).toBe("grok-composer-2.5")
    expect(overrides.overrides.sisyphus.service_tier).toBe("default")
  })

  test("flips explorer role model to *-fast when catalog has sibling", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-set-tier-fast-"))
    await mkdir(join(home, ".grok", "roles"), { recursive: true })
    await writeFile(
      join(home, ".grok", "roles", "explorer.toml"),
      'model = "grok-composer-2.5"\nreasoning_effort = "high"\n',
      "utf8",
    )
    await writeFile(
      join(home, ".grok", "omo-agent-overrides.json"),
      JSON.stringify({
        version: 1,
        overrides: {
          explorer: { model: "grok-composer-2.5", reasoning_level: "high", service_tier: "default" },
        },
      }),
      "utf8",
    )

    const result = await applyAgentServiceTier({
      home,
      agent: "explorer",
      tier: "fast",
      modelIds: ["grok-composer-2.5", "grok-composer-2.5-fast"],
    })

    expect(result.toModel).toBe("grok-composer-2.5-fast")
    const role = await readFile(result.rolePath, "utf8")
    expect(role).toContain('model = "grok-composer-2.5-fast"')
    expect(role).not.toMatch(/service_tier\s*=/)
  })

  test("fails closed when role TOML is missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-set-tier-missing-"))
    await expect(
      applyAgentServiceTier({ home, agent: "explorer", tier: "default", modelIds: [] }),
    ).rejects.toThrow(/explorer\.toml|role|missing/i)
  })

  test("without modelIds catalog, still flips via deterministic *-fast sibling seed", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-set-tier-seed-"))
    await mkdir(join(home, ".grok", "roles"), { recursive: true })
    await writeFile(
      join(home, ".grok", "roles", "explorer.toml"),
      'model = "grok-composer-2.5-fast"\nreasoning_effort = "high"\n',
      "utf8",
    )
    await writeFile(
      join(home, ".grok", "omo-agent-overrides.json"),
      JSON.stringify({
        version: 1,
        overrides: {
          explorer: { model: "grok-composer-2.5-fast", reasoning_level: "high", service_tier: "fast" },
        },
      }),
      "utf8",
    )

    const result = await applyAgentServiceTier({ home, agent: "explorer", tier: "default" })
    expect(result.toModel).toBe("grok-composer-2.5")
    const role = await readFile(result.rolePath, "utf8")
    expect(role).toContain('model = "grok-composer-2.5"')
    expect(role).not.toMatch(/service_tier\s*=/)
  })
})
