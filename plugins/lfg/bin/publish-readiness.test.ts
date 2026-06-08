import { describe, expect, test } from "vitest"
import { evaluatePublishGap } from "./publish-readiness"

describe("publish-readiness", () => {
  test("publishReady when local ahead of registry and bin present (#22)", () => {
    const gap = evaluatePublishGap({
      packageName: "@islee23520/lfg",
      localVersion: "0.1.4",
      registryVersion: "0.1.3",
      hasBin: true,
    })
    expect(gap.publishReady).toBe(true)
    expect(gap.blockedReason).toBeNull()
  })

  test("blocked when bin missing (#22)", () => {
    const gap = evaluatePublishGap({
      packageName: "@islee23520/lfg",
      localVersion: "0.1.4",
      registryVersion: "0.1.3",
      hasBin: false,
    })
    expect(gap.publishReady).toBe(false)
    expect(gap.blockedReason).toContain("bin.lfg")
  })

  test("blocked when versions match", () => {
    const gap = evaluatePublishGap({
      packageName: "@islee23520/lfg",
      localVersion: "0.1.3",
      registryVersion: "0.1.3",
      hasBin: true,
    })
    expect(gap.publishReady).toBe(false)
    expect(gap.blockedReason).toContain("not ahead")
  })
})