import { chmod, mkdtemp, readlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runLfg } from "./test-process"

describe("lfg machine lazycodex install", () => {
  test("setup run links machine lazycodex install into Grok", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const codexHome = join(home, ".codex")
    const fakeBin = await makeFakeMachineNpx(codexHome)
    const adapterRoot = join(codexHome, "plugins", "cache", "sisyphuslabs", "omo", "0.1.0")

    const result = await runLfg(["--json", "setup", "--run"], { HOME: home, CODEX_HOME: codexHome, PATH: `${fakeBin}:${process.env.PATH ?? ""}` })

    expect(result.exitCode).toBe(0)
    expect(result.json).toMatchObject({
      ok: true,
      status: "installed",
      stablePluginLinks: [
        { status: "linked", name: "lfg", targetPath: adapterRoot },
        { status: "linked", name: "lazycodex", targetPath: adapterRoot },
      ],
    })
    await expect(readlink(join(home, ".grok", "installed-plugins", "lazycodex"))).resolves.toBe(adapterRoot)
  })
})

async function makeFakeMachineNpx(codexHome: string): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), "lfg-fake-npx."))
  const adapterRoot = join(codexHome, "plugins", "cache", "sisyphuslabs", "omo", "0.1.0")
  await writeFile(
    join(bin, "npx"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `mkdir -p "${adapterRoot}/.codex-plugin" "${adapterRoot}/skills"`,
      `printf '%s\\n' '{"name":"omo","version":"0.1.0"}' > "${adapterRoot}/.codex-plugin/plugin.json"`,
      `printf '%s\\n' '{"mcpServers":{}}' > "${adapterRoot}/.mcp.json"`,
      'echo fake machine lazycodex install: "$@"',
      "",
    ].join("\n"),
  )
  await chmod(join(bin, "npx"), 0o755)
  return bin
}
