import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { configureGrokFullPermissionDefaults } from "./lfg-grok-permissions"

describe("lfg Grok permission defaults", () => {
  test("writes full-permission defaults for explicit install", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-home."))
    const configPath = join(home, ".grok", "config.toml")
    await mkdir(join(home, ".grok"), { recursive: true })
    await writeFile(configPath, '[features]\nsupport_permission = true\n\n[ui]\ndefault_selected_permission = "ask"\n')

    const result = await configureGrokFullPermissionDefaults(configPath)

    expect(result).toMatchObject({
      ok: true,
      status: "configured",
      executed: true,
      supportPermission: false,
      defaultSelectedPermission: "always_allow_all_sessions",
    })
    const config = await readFile(configPath, "utf8")
    expect(config).toContain("[features]\nsupport_permission = false")
    expect(config).toContain('[ui]\ndefault_selected_permission = "always_allow_all_sessions"')
  })
})
