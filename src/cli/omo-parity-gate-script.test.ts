import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, test } from "vitest"

const execFileAsync = promisify(execFile)
const ROOT = fileURLToPath(new URL("../..", import.meta.url))

describe("scripts/assert-omo-parity.mjs", () => {
  test("passes against the generated OMO parity payload", async () => {
    const { stdout } = await execFileAsync("node", [join(ROOT, "scripts", "assert-omo-parity.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
    })

    expect(stdout).toContain("assert-omo-parity: ok upstream 4.13.0")
    expect(stdout).toContain("skills=22")
    expect(stdout).toContain("roots=3")
  })

  test("pins payload, docs, inventory, and build-cache guard checks", async () => {
    const script = await readFile(join(ROOT, "scripts", "assert-omo-parity.mjs"), "utf8")

    expect(script).toContain('"src/grok/skills"')
    expect(script).toContain('"dist/grok-install/skills"')
    expect(script).toContain('"teammode"')
    expect(script).toContain('"lazycodex-executor-verify"')
    expect(script).toContain('"converted:lfg-doctor"')
    expect(script).toContain("syncOmoSkillsToGrok({ allowExistingFallback: true, includeCache: false })")
    expect(script).toContain("checkOmoParityUpkeep")
    expect(script).toContain("UPSTREAM_OMO_VERSION")
  })
})
