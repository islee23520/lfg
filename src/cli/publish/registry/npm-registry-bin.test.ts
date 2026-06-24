import { describe, expect, test } from "vitest"
import {
  isLegacyRegistryBinLfg,
  LEGACY_REGISTRY_BIN_LFG_TARGETS,
  parseNpmRegistryBinLfg,
  registryBinPublishContract,
} from "./npm-registry-bin"

describe("npm-registry-bin (#22)", () => {
  test("LEGACY_REGISTRY_BIN_LFG_TARGETS covers 0.1.1 and 0.1.3 bin paths", () => {
    expect(LEGACY_REGISTRY_BIN_LFG_TARGETS).toContain("dist/lfg.js")
    expect(LEGACY_REGISTRY_BIN_LFG_TARGETS).toContain("plugins/lfg/dist/lfg.js")
    expect(LEGACY_REGISTRY_BIN_LFG_TARGETS).toContain("plugins/lfg/lfg")
  })

  test("parseNpmRegistryBinLfg reads npm view bin.lfg line", () => {
    expect(parseNpmRegistryBinLfg("dist/lfg.js\n")).toBe("dist/lfg.js")
    expect(parseNpmRegistryBinLfg("bin/lfg.js")).toBe("bin/lfg.js")
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
    const bin = "dist/lfg.js"
    expect(isLegacyRegistryBinLfg(bin)).toBe(true)
    const contract = registryBinPublishContract(bin)
    expect(contract.matchesPublishContract).toBe(false)
    expect(contract.legacyWrongTarget).toBe(true)
  })

  test("publish contract bin is not legacy", () => {
    const contract = registryBinPublishContract("bin/lfg.js")
    expect(contract.matchesPublishContract).toBe(true)
    expect(contract.legacyWrongTarget).toBe(false)
  })

  test("live registry bin.lfg matches publish contract after 0.1.4+ ships (#22)", async () => {
    const { execFile } = await import("node:child_process")
    const { promisify } = await import("node:util")
    const execFileAsync = promisify(execFile)
    try {
      const { stdout } = await execFileAsync("npm", ["view", "@islee23520/lfg", "bin.lfg"], { encoding: "utf8" })
      const bin = parseNpmRegistryBinLfg(stdout)
      const contract = registryBinPublishContract(bin)
      expect(bin).toBeTruthy()
      if (bin !== "bin/lfg.js") {
        expect(contract.legacyWrongTarget).toBe(true)
      } else {
        expect(contract.matchesPublishContract).toBe(true)
      }
    } catch (error: unknown) {
      expect(error).toBeDefined()
    }
  }, 15_000)
})