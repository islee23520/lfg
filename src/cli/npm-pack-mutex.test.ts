import { describe, expect, test } from "vitest"
import { withNpmPackLock } from "./npm-pack-mutex"

describe("npm pack mutex", () => {
  test("serializes overlapping lock holders", async () => {
    const order: number[] = []
    const first = withNpmPackLock(async () => {
      order.push(1)
      await new Promise((r) => setTimeout(r, 30))
      order.push(2)
    })
    const second = withNpmPackLock(async () => {
      order.push(3)
    })
    await Promise.all([first, second])
    expect(order).toEqual([1, 2, 3])
  })
})