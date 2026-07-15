import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

describe("codex app-server watch documentation", () => {
  test("documents the honest local control plane and RESULT fallback", async () => {
    const text = await readFile(join(process.cwd(), "docs/codex-app-server-watch.md"), "utf8")
    expect(text).toContain("optional local Codex CLI control plane")
    expect(text).toContain("does not give Grok native `codex_app` tools")
    expect(text).toContain("`thread/list`")
    expect(text).toContain("`thread/status/changed` events")
    expect(text).toContain("lfg --json orchestrator watch")
    expect(text).toContain("RESULT files remain the fail-closed fallback")
    expect(text).not.toMatch(/\/Users\/[A-Za-z0-9._-]+/)
  })
})
