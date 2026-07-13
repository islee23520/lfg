import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { ensureGrokBinLfgWrapper, renderGrokBinLfgWrapper } from "./grok-bin-lfg-wrapper"

describe("renderGrokBinLfgWrapper (~/.grok/bin/lfg grokbuild wrapper)", () => {
  const wrapper = renderGrokBinLfgWrapper()

  test("routes lfg subcommands to the lfg tool via npx", () => {
    expect(wrapper).toContain("exec npx -y @islee23520/lfg")
    for (const sub of ["setup", "xai", "zai", "mcp", "claude", "ulw", "ulw-loop"]) {
      expect(wrapper).toContain(sub)
    }
  })

  test("forwards everything else to the grok binary", () => {
    expect(wrapper).toContain('exec "$HOME/.grok/bin/grok" "$@"')
    expect(wrapper).not.toMatch(/--model\b.*npx/)
  })

  test("is valid POSIX sh", () => {
    expect(wrapper.startsWith("#!/bin/sh\n")).toBe(true)
    expect(wrapper).toMatch(/set -eu/)
    const tmp = spawnSync("sh", ["-n"], { input: wrapper })
    expect(tmp.status).toBe(0)
  })
})

describe("ensureGrokBinLfgWrapper", () => {
  test("writes an executable ~/.grok/bin/lfg", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-bin-wrapper-"))
    const wrapperPath = await ensureGrokBinLfgWrapper(home)

    expect(wrapperPath).toBe(join(home, ".grok", "bin", "lfg"))
    const content = await readFile(wrapperPath, "utf8")
    expect(content).toContain("exec npx -y @islee23520/lfg")

    const mode = (await stat(wrapperPath)).mode
    expect(mode & 0o111).not.toBe(0)
  })

  test("is idempotent (re-write produces the same wrapper)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-bin-wrapper-idem-"))
    await ensureGrokBinLfgWrapper(home)
    await ensureGrokBinLfgWrapper(home)
    const content = await readFile(join(home, ".grok", "bin", "lfg"), "utf8")
    expect(content).toBe(renderGrokBinLfgWrapper())
  })

  test("passthrough end-to-end: non-lfg args reach grok, not npx", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "lfg-bin-wrapper-run-"))
    const wrapper = renderGrokBinLfgWrapper().replaceAll("$HOME/.grok/bin/grok", "/bin/echo")
    const script = join(tmp, "lfg")
    await writeFile(script, wrapper, { mode: 0o755 })

    const grokPassthrough = spawnSync("sh", [script, "-p", "hello", "--model", "grok-4.5"])
    expect(grokPassthrough.status).toBe(0)
    expect(grokPassthrough.stdout.toString().trim()).toBe("-p hello --model grok-4.5")
  })
})
