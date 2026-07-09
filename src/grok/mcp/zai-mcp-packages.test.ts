import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { writeZaiMcpApiKey } from "./zai-mcp-auth"
import {
  getZaiMcpPackageStatus,
  installZaiMcpPackages,
  resolveZaiPackageSpecs,
  uninstallZaiMcpPackages,
} from "./zai-mcp-packages"

async function tempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "lfg-zai-mcp-"))
}

describe("zai-mcp-packages", () => {
  test("resolveZaiPackageSpecs accepts all and named packages", () => {
    expect(resolveZaiPackageSpecs(["all"]).ok).toBe(true)
    expect(resolveZaiPackageSpecs(["vision", "zread"]).ok).toBe(true)
    const bad = resolveZaiPackageSpecs(["nope"])
    expect(bad.ok).toBe(false)
  })

  test("install writes stdio vision and remote packages into config.toml without printing secrets in status", async () => {
    const home = await tempHome()
    const env = { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" }
    await writeZaiMcpApiKey(join(home, ".grok", "zai-mcp-auth.json"), "sk-test-zai", "ZAI")

    const installed = await installZaiMcpPackages({
      home,
      env,
      targets: ["vision", "web-search", "web-reader", "zread"],
    })
    expect(installed.ok).toBe(true)
    expect(installed.installed).toEqual(["vision", "web-search", "web-reader", "zread"])

    const toml = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(toml).toContain("[mcp_servers.zai-vision]")
    expect(toml).toContain('"@z_ai/mcp-server"')
    expect(toml).toContain('Z_AI_MODE = "ZAI"')
    expect(toml).toContain("[mcp_servers.zai-web-search]")
    expect(toml).toContain("https://api.z.ai/api/mcp/web_search_prime/mcp")
    expect(toml).toContain("[mcp_servers.zai-web-reader]")
    expect(toml).toContain("[mcp_servers.zai-zread]")
    expect(toml).toContain("Bearer sk-test-zai")

    const status = await getZaiMcpPackageStatus({ home, env })
    expect([...status.configured].sort()).toEqual(["vision", "web-reader", "web-search", "zread"].sort())
    expect(JSON.stringify(status)).not.toContain("sk-test-zai")

    const removed = await uninstallZaiMcpPackages({ home, env, targets: ["vision"] })
    expect(removed.ok).toBe(true)
    const after = await readFile(join(home, ".grok", "config.toml"), "utf8")
    expect(after).not.toContain("[mcp_servers.zai-vision]")
    expect(after).toContain("[mcp_servers.zai-web-search]")
  })

  test("install fails closed without credentials", async () => {
    const home = await tempHome()
    const env = { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" }
    const result = await installZaiMcpPackages({ home, env, targets: ["vision"] })
    expect(result.ok).toBe(false)
    expect(result.status).toBe("zai_mcp_auth_required")
  })
})
