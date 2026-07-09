import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import {
  createRestoredUserOverrideConfig,
  getCanonicalUserOverridePath,
  getLegacyUserOverridePath,
  migrateLegacyUserOverrideConfig,
  restoreSavedUserOverrideConfigIfPresent,
  saveUserOverrideConfig,
} from "./user-model-overrides"

const temps: string[] = []

afterEach(() => {
  for (const root of temps.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function makeHome(): string {
  const root = mkdtempSync(join(tmpdir(), "lfg-user-overrides-"))
  temps.push(root)
  mkdirSync(join(root, ".grok"), { recursive: true })
  return root
}

function overrideJson(model: string): string {
  return `${JSON.stringify(
    {
      version: 1,
      overrides: {
        explorer: {
          model,
          reasoning_level: "low",
        },
      },
    },
    null,
    2,
  )}\n`
}

describe("user-model-overrides migrate/restore under ~/.grok", () => {
  test("migrateLegacyUserOverrideConfig copies legacy lazycodex file into omo canonical path", () => {
    const home = makeHome()
    const legacy = getLegacyUserOverridePath(home)
    writeFileSync(legacy, overrideJson("legacy-model"), "utf8")

    const migrated = migrateLegacyUserOverrideConfig({ home })
    expect(migrated).toBe(getCanonicalUserOverridePath(home))
    const body = JSON.parse(readFileSync(migrated!, "utf8")) as {
      overrides: { explorer: { model: string } }
    }
    expect(body.overrides.explorer.model).toBe("legacy-model")
  })

  test("migrateLegacyUserOverrideConfig prefers existing canonical omo overrides over legacy", () => {
    const home = makeHome()
    writeFileSync(getCanonicalUserOverridePath(home), overrideJson("canonical-model"), "utf8")
    writeFileSync(getLegacyUserOverridePath(home), overrideJson("legacy-model"), "utf8")

    const migrated = migrateLegacyUserOverrideConfig({ home })
    expect(migrated).toBe(getCanonicalUserOverridePath(home))
    const body = JSON.parse(readFileSync(migrated!, "utf8")) as {
      overrides: { explorer: { model: string } }
    }
    expect(body.overrides.explorer.model).toBe("canonical-model")
  })

  test("saveUserOverrideConfig writes canonical path", () => {
    const home = makeHome()
    const path = saveUserOverrideConfig(home, {
      explorer: { model: "saved-model", reasoningLevel: "medium" },
    } as never)
    expect(path).toBe(getCanonicalUserOverridePath(home))
    expect(readFileSync(path, "utf8")).toContain("saved-model")
  })

  test("restoreSavedUserOverrideConfigIfPresent restores from saved snapshot path", () => {
    const home = makeHome()
    const saved = join(home, "saved-user-overrides.json")
    writeFileSync(saved, overrideJson("restored-model"), "utf8")
    const target = getCanonicalUserOverridePath(home)
    writeFileSync(target, overrideJson("clobbered"), "utf8")

    expect(restoreSavedUserOverrideConfigIfPresent(target, saved)).toBe(true)
    expect(readFileSync(target, "utf8")).toContain("restored-model")
    expect(createRestoredUserOverrideConfig(home, saved)).toBe(target)
  })

  test("restore returns false when saved path missing", () => {
    const home = makeHome()
    expect(
      restoreSavedUserOverrideConfigIfPresent(
        getCanonicalUserOverridePath(home),
        join(home, "missing.json"),
      ),
    ).toBe(false)
  })
})
