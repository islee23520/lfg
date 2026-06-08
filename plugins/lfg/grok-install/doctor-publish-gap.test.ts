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
})