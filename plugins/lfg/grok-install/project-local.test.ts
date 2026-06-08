import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { inspectProjectLocalGrok } from "./project-local"

describe("project-local", () => {
  test("absent when no .grok in project", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-proj-"))
    const json = await inspectProjectLocalGrok({ projectRoot: root })
    expect(json.status).toBe("absent")
    expect(String(json.repair)).toContain("N/A")
  })

  test("present when config exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-proj2-"))
    await mkdir(join(root, ".grok"), { recursive: true })
    await writeFile(join(root, ".grok", "config.toml"), "[ui]\n", "utf8")
    const json = await inspectProjectLocalGrok({ projectRoot: root })
    expect(json).toMatchObject({ status: "present", configExists: true })
  })
})