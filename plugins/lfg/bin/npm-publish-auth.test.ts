import { describe, expect, test } from "vitest"
import { evaluateNpmPublishAuth } from "./npm-publish-auth"

describe("npm-publish-auth", () => {
  test("blocked when whoami missing (#22)", () => {
    const auth = evaluateNpmPublishAuth(null)
    expect(auth.ok).toBe(false)
    expect(auth.blockedReason).toContain("npm login")
  })

  test("ok when npm user present", () => {
    const auth = evaluateNpmPublishAuth("islee23520")
    expect(auth).toEqual({ ok: true, npmUser: "islee23520", blockedReason: null })
  })
})