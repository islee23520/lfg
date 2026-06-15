import { describe, expect, test } from "vitest"
import { doctorPublishGapJson } from "./doctor-publish-gap"

describe("doctor-publish-gap", () => {
  test("reports publishReady when local ahead (#22)", () => {
    const json = doctorPublishGapJson("0.1.4", "0.1.3", true)
    expect(json).toMatchObject({ publishReady: true, blockedReason: null })
  })

  test("null when registry not supplied", () => {
    expect(doctorPublishGapJson("0.1.4", null, true)).toBeNull()
  })

  test("null when local version not resolved (#22)", () => {
    expect(doctorPublishGapJson(null, "0.1.3", true)).toBeNull()
  })

  test("not publishReady when cli bin layout invalid (#22)", () => {
    const json = doctorPublishGapJson("0.1.4", "0.1.3", false)
    expect(json).toMatchObject({ publishReady: false })
    expect(String(json?.blockedReason)).toContain("bin/lfg.js")
  })

  test("includes hasBin gate via evaluatePublishGap localVersion (#22)", () => {
    const json = doctorPublishGapJson("0.1.4", "0.1.3", true)
    expect(json).toMatchObject({ localVersion: "0.1.4", registryVersion: "0.1.3" })
  })
})