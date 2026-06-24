import { describe, expect, test } from "vitest"
import { PUBLISHED_LFG_BIN_TARGET } from "./npm-publish-bin"
import { registryBinPublishContract } from "./npm-registry-bin"
import { evaluatePublishGap } from "./publish-readiness"

/** #22 — live registry 0.1.3 legacy bin vs local publish contract. */
describe("registry bin publish gap (#22)", () => {
  test("0.1.3 registry bin.lfg is legacy; local gap still publishReady at 0.1.4", () => {
    const registryBin = registryBinPublishContract("dist/lfg.js")
    expect(registryBin.legacyWrongTarget).toBe(true)
    expect(registryBin.matchesPublishContract).toBe(false)
    expect(PUBLISHED_LFG_BIN_TARGET).toBe("bin/lfg.js")
    const gap = evaluatePublishGap({
      packageName: "@islee23520/lfg",
      localVersion: "0.1.4",
      registryVersion: "0.1.3",
      hasBin: true,
    })
    expect(gap.publishReady).toBe(true)
  })

  test("contract bin matches publish target when registry ships shim", () => {
    const registryBin = registryBinPublishContract(PUBLISHED_LFG_BIN_TARGET)
    expect(registryBin.matchesPublishContract).toBe(true)
    expect(registryBin.legacyWrongTarget).toBe(false)
  })
})