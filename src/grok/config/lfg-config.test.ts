import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  applyLfgConfigToAgentOverrides,
  ensureLfgConfigFiles,
  lfgConfigPath,
  lfgRuntimeConfigPath,
  readLfgConfigFile,
  removeRetiredLfgConfigFiles,
} from "./lfg-config"

describe("lfg-config (config.toml sole settings surface)", () => {
  test("ensureLfgConfigFiles points at config.toml and does not write retired JSON files", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-config-home-"))
    const result = await ensureLfgConfigFiles(home, { explorer: { model: "gpt-5.4-mini", reasoningLevel: "low" } })

    expect(result.configPath).toBe(join(home, ".grok", "config.toml"))
    expect(result.schemaPath).toBeNull()
    expect(result.runtimeConfigPath).toBeNull()
    expect(result.removedRetiredPaths).toEqual([])
    // Path helpers still name the retired files for migration awareness only.
    expect(lfgConfigPath(home)).toBe(join(home, ".grok", "lfg-config.jsonc"))
    expect(lfgRuntimeConfigPath(home)).toBe(join(home, ".grok", "lfg.json"))
  })

  test("ensureLfgConfigFiles deletes retired lfg.json / jsonc / schema on setup", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-config-retire-"))
    await mkdir(join(home, ".grok"), { recursive: true })
    const retired = [
      join(home, ".grok", "lfg.json"),
      join(home, ".grok", "lfg-config.jsonc"),
      join(home, ".grok", "lfg-config.schema.json"),
    ]
    for (const path of retired) {
      await writeFile(path, "{}\n", "utf8")
    }
    // Keep config.toml — must not be deleted.
    await writeFile(join(home, ".grok", "config.toml"), '[models]\ndefault = "grok-4.5"\n', "utf8")

    const result = await ensureLfgConfigFiles(home, {})

    expect([...result.removedRetiredPaths].sort()).toEqual(retired.sort())
    for (const path of retired) {
      await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    }
    await expect(readFile(join(home, ".grok", "config.toml"), "utf8")).resolves.toContain("grok-4.5")
  })

  test("removeRetiredLfgConfigFiles is idempotent when files already gone", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-config-retire-idem-"))
    expect(await removeRetiredLfgConfigFiles(home)).toEqual([])
    expect(await removeRetiredLfgConfigFiles(home)).toEqual([])
  })

  test("readLfgConfigFile always returns null (JSONC retired)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-config-null-"))
    expect(await readLfgConfigFile(home)).toBeNull()
  })

  test("applyLfgConfigToAgentOverrides is a no-op passthrough", () => {
    const base = { explorer: { model: "grok-4.5", reasoningLevel: "low" as const } }
    expect(
      applyLfgConfigToAgentOverrides(
        base,
        {
          explorer: { model: "x", reasoningLevel: "low" },
          reasoning: { model: "x", reasoningLevel: "high" },
          coding: { model: "x", reasoningLevel: "medium" },
        },
        null,
      ),
    ).toEqual(base)
  })
})
