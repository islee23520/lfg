import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { getProviderConsentPath, readProviderConsent, saveProviderConsent } from "./provider-consent"

const temps: string[] = []

afterEach(() => {
  for (const root of temps.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function makeHome(): string {
  const root = mkdtempSync(join(tmpdir(), "lfg-provider-consent-"))
  temps.push(root)
  return root
}

describe("provider-consent (Grok ~/.grok ledger)", () => {
  test("readProviderConsent returns null when ledger file is missing", () => {
    const home = makeHome()
    expect(readProviderConsent({ home })).toBeNull()
    expect(existsSync(getProviderConsentPath({ home }))).toBe(false)
  })

  test("saveProviderConsent(true) persists under ~/.grok/.ledger/lfg and reads back true", () => {
    const home = makeHome()
    const path = saveProviderConsent(true, { home })
    expect(path).toBe(getProviderConsentPath({ home }))
    expect(path).toContain(join(".grok", ".ledger", "lfg"))
    const text = readFileSync(path, "utf8")
    expect(text).toMatch(/"installOpenAiCompatProvider": true/)
    expect(readProviderConsent({ home })).toBe(true)
  })

  test("saveProviderConsent(false) reads back false", () => {
    const home = makeHome()
    const path = saveProviderConsent(false, { home })
    expect(readProviderConsent({ home })).toBe(false)
    expect(readFileSync(path, "utf8")).toMatch(/"installOpenAiCompatProvider": false/)
  })

  test("malformed consent JSON fail-closes to null", () => {
    const home = makeHome()
    const path = getProviderConsentPath({ home })
    mkdirSync(join(path, ".."), { recursive: true })
    writeFileSync(path, "{not-json", "utf8")
    expect(readProviderConsent({ home })).toBeNull()
  })
})
