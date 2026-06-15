import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

describe("doctor publishGap fallback (#22)", () => {
  test("doctor.ts uses readPublishRootVersionFromBundle when registry version set", async () => {
    const path = join(fileURLToPath(new URL(".", import.meta.url)), "doctor.ts")
    const src = await readFile(path, "utf8")
    expect(src).toContain("readPublishRootVersionFromBundle")
    expect(src).toContain("doctorPublishGapJson")
    expect(src).toContain("registryVersion")
    expect(src).toContain("readLfgPackageVersionFromBundle")
  })
})