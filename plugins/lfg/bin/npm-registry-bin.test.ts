import { describe, expect, test } from "vitest"
import {
  isLegacyRegistryBinLfg,
  parseNpmRegistryBinLfg,
  registryBinPublishContract,
} from "./npm-registry-bin"

describe("npm-registry-bin (#22)", () => {
  test("parseNpmRegistryBinLfg reads npm view bin.lfg line", () => {
    expect(parseNpmRegistryBinLfg("plugins/lfg/dist/lfg.js\n")).toBe("plugins/lfg/dist/lfg.js")
    expect(parseNpmRegistryBinLfg("plugins/lfg/lfg")).toBe("plugins/lfg/lfg")
  })

  test("parseNpmRegistryBinLfg rejects empty", () => {
    expect(parseNpmRegistryBinLfg("")).toBeNull()
    expect(parseNpmRegistryBinLfg("undefined")).toBeNull()
  })

  test("0.1.1 missing bin is not legacy wrong target (#22)", () => {
    const contract = registryBinPublishContract(null)
    expect(contract.legacyWrongTarget).toBe(false)
    expect(contract.matchesPublishContract).toBe(false)
    expect(contract.binLfg).toBeNull()
  })

  test("registry 0.1.3 bin is legacy wrong target", () => {
    const bin = "plugins/lfg/dist/lfg.js"
    expect(isLegacyRegistryBinLfg(bin)).toBe(true)
    const contract = registryBinPublishContract(bin)
    expect(contract.matchesPublishContract).toBe(false)
    expect(contract.legacyWrongTarget).toBe(true)
  })

  test("publish contract bin is not legacy", () => {
    const contract = registryBinPublishContract("plugins/lfg/lfg")
    expect(contract.matchesPublishContract).toBe(true)
    expect(contract.legacyWrongTarget).toBe(false)
  })

  test("live registry bin.lfg is legacy until 0.1.4+ ships (#22)", async () => {
    const { execFile } = await import("node:child_process")
    const { promisify } = await import("node:util")
    const execFileAsync = promisify(execFile)
    try {
      const { stdout } = await execFileAsync("npm", ["view", "@islee23520/lfg", "bin.lfg"], { encoding: "utf8" })
      const bin = parseNpmRegistryBinLfg(stdout)
      const contract = registryBinPublishContract(bin)
      expect(bin).toBe("plugins/lfg/dist/lfg.js")
      expect(contract.legacyWrongTarget).toBe(true)
      expect(contract.matchesPublishContract).toBe(false)
    } catch {
      expect.fail("npm view @islee23520/lfg bin.lfg should be reachable")
    }
  }, 15_000)
})