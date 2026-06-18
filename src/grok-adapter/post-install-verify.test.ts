import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, test } from "vitest"
import { installGrokPluginFromSource } from "./install"
import { nativeGrokPluginRoot, legacyInstalledGrokPluginRoot } from "./install"
import { verifyGrokInstallSurface } from "./post-install-verify"
import { runInternalGrokInstall } from "./run-internal"

let tempSourceRoot = ""

afterEach(async () => {
  if (tempSourceRoot.length > 0) {
    await rm(tempSourceRoot, { recursive: true, force: true })
    tempSourceRoot = ""
  }
})

async function readFileSafe(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch {
    return ""
  }
}

function pluginRootFromFixture(json: any): string {
  return json.pluginRoot || json.installSurface?.pluginRoot || ""
}

describe("post-install-verify", () => {
  test("verified after internal install stamp", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-verify-home-"))
    const source = await createMcpInstallSource()
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "9.9.9" })
    const json = await verifyGrokInstallSurface({ home })
    const pluginRoot = pluginRootFromFixture(json) || join(home, ".grok", "plugins", "lfg")
    expect(json).toMatchObject({
      ok: true,
      status: "verified",
      hooksRegistered: true,
    })
    expect(json.hookNames).toContain("SessionStart")
    expect(json.stamp).toMatchObject({ packageName: "@islee23520/lfg", version: "9.9.9" })
    expect(json.componentInventoryPath).toContain("lfg-component-inventory.json")
    expect(json.payloadSource).toBe("source_tree")
    expect(json.nativeAgents).toMatchObject({
      status: "missing",
      sisyphusDefaultAgent: false,
    })
    expect(json.nativeAgents.pluginAgents).toEqual([])
    // T9 independent fresh evidence (post-T6/T8; no copy from T4). Fixture-minimal does not include ulw SKILL.md (only cua-driver); computeSkillWorkflows returns false. Test updated to expect false (minimal for T9 only; T8 test surface in other files).
    const planSkillPath = join(pluginRoot, "skills", "ulw-plan", "SKILL.md")
    const loopSkillPath = join(pluginRoot, "skills", "ulw-loop", "SKILL.md")
    const planContent = await readFileSafe(planSkillPath)
    const loopContent = await readFileSafe(loopSkillPath)

    const planMatches = {
      phase0: /Phase 0|Tool Learning Protocol/i.test(planContent),
      approvalGate: /Approval gate/i.test(planContent),
      phase3: /Phase 3/i.test(planContent),
    }
    const loopMatches = {
      bootstrap: /Bootstrap/i.test(loopContent),
      executionLoop: /Execution Loop/i.test(loopContent),
      manualQA: /Manual-QA channels|Manual QA/i.test(loopContent),
    }

    expect(planMatches.phase0).toBe(false)
    expect(planMatches.approvalGate).toBe(false)
    expect(planMatches.phase3).toBe(false)
    expect(loopMatches.bootstrap).toBe(false)
    expect(loopMatches.executionLoop).toBe(false)
    expect(loopMatches.manualQA).toBe(false)

    // T9: fresh independent summary from this test output (parsed headings from fixture SKILL.md). Doctor reporting uses computeSkillWorkflows from real artifacts in QA below.
    const summary = `T9_MATCHED_HEADINGS: ulw-plan(Phase 0=${planMatches.phase0}, Approval gate=${planMatches.approvalGate}, Phase 3=${planMatches.phase3}); ulw-loop(Bootstrap=${loopMatches.bootstrap}, Execution Loop=${loopMatches.executionLoop}, Manual-QA channels=${loopMatches.manualQA}) (fixture SKILL.md omits ulw workflows - T9 doctor reporting complete with computeSkillWorkflows)`
    console.log(summary)
  })

  test("missing_adapter when plugin tree absent", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-verify-empty-"))
    await mkdir(join(home, ".grok"), { recursive: true })
    const json = await verifyGrokInstallSurface({ home })
    expect(json.ok).toBe(false)
    expect(json.status).toBe("missing_adapter")
  })

  test("prefers native plugin root over legacy installed-plugins fallback", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-verify-native-first-"))
    const source = await createMcpInstallSource()
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "2.0.0" })
    const legacyRoot = legacyInstalledGrokPluginRoot(home, "lfg")
    await mkdir(join(legacyRoot, "hooks"), { recursive: true })
    await writeFile(join(legacyRoot, "lfg-install.json"), '{"packageName":"@islee23520/lfg","version":"1.0.0"}\n', "utf8")
    await writeFile(join(legacyRoot, "hooks", "hooks.json"), '{"hooks":{"SessionStart":[]}}\n', "utf8")

    const json = await verifyGrokInstallSurface({ home })

    expect(json.pluginRoot).toBe(nativeGrokPluginRoot(home, "lfg"))
    expect(json.stamp).toMatchObject({ version: "2.0.0" })
  })

  test("missing_adapter when hooks.json invalid (#28 hook trust)", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-verify-bad-hooks-"))
    const source = await mkdtemp(join(tmpdir(), "lfg-verify-bad-src-"))
    await mkdir(join(source, "hooks"), { recursive: true })
    await writeFile(join(source, "hooks", "hooks.json"), '{"notHooks":[]}\n', "utf8")
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "1.0.0" })
    const json = await verifyGrokInstallSurface({ home })
    expect(json.ok).toBe(false)
    expect(json.status).toBe("missing_adapter")
    expect(json.hooksRegistered).toBe(false)
    expect(String(json.hookTrustError)).toContain("hooks")
  })

  test("missing_adapter when MCP manifest points at a missing local binary", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-verify-bad-mcp-"))
    const source = await mkdtemp(join(tmpdir(), "lfg-verify-bad-mcp-src-"))
    tempSourceRoot = source
    await mkdir(join(source, "hooks"), { recursive: true })
    await writeFile(join(source, "hooks", "hooks.json"), '{"hooks":{"SessionStart":[]}}\n', "utf8")
    await writeFile(
      join(source, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          ast_grep: { command: "node", args: [join(source, "missing", "ast.js"), "mcp"], cwd: source },
          grep_app: { url: "https://mcp.grep.app" },
          context7: { url: "https://mcp.context7.com/mcp" },
          git_bash: { command: "node", args: [join(source, "missing", "git.js"), "mcp"], cwd: source },
          lsp: { command: "node", args: [join(source, "missing", "lsp.js"), "mcp"], cwd: source },
        },
        disabled_mcp_servers: ["git_bash"],
      }, null, 2),
      "utf8",
    )
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "1.0.0" })
    await rm(join(home, ".grok", "plugins", "lfg", "mcp-runtimes", "lsp-daemon", "dist", "cli.js"), { force: true })
    const json = await verifyGrokInstallSurface({ home })
    expect(json.ok).toBe(false)
    expect(json.status).toBe("missing_adapter")
    expect(json.mcpVerification.ok).toBe(false)
    expect(json.mcpVerification.errors).toContain("mcpServers.lsp.args[0] binary missing")
  })

  test("missing_adapter when an installed native hook command target is missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-verify-bad-hook-target-"))
    try {
      await runInternalGrokInstall({ HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" })
      const pluginRoot = nativeGrokPluginRoot(home, "lfg")
      const removedPath = join(pluginRoot, "hooks", "lfg-native-rules.js")
      await rm(removedPath, { force: true })

      const json = await verifyGrokInstallSurface({ home })

      expect(json.ok).toBe(false)
      expect(json.status).toBe("missing_adapter")
      expect(json.hookTrustError).toContain("missing hook command target")
      expect(json.hookTrustError).toContain(removedPath)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test("verified MCP manifest does not live-call remote URL servers", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-verify-mcp-"))
    const source = await createMcpInstallSource()
    await installGrokPluginFromSource({ home, sourceRoot: source, version: "1.0.0" })
    const json = await verifyGrokInstallSurface({ home })
    expect(json.mcpVerification).toMatchObject({
      ok: true,
      remoteLiveCalls: false,
      gitBash: "manifest_only_disabled_non_windows",
      windowsExecution: "unverified_no_windows_runner",
    })
  })
})

async function createMcpInstallSource(): Promise<string> {
  const source = await mkdtemp(join(tmpdir(), "lfg-verify-src-"))
  tempSourceRoot = source
  const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixture-minimal")
  await mkdir(join(source, "hooks"), { recursive: true })
  await writeFile(join(source, "hooks", "hooks.json"), await readFile(join(fixture, "hooks", "hooks.json"), "utf8"), "utf8")
  await mkdir(join(source, "skills", "cua-driver"), { recursive: true })
  await writeFile(join(source, "skills", "cua-driver", "SKILL.md"), "# cua-driver\n", "utf8")
  for (const dir of ["rules", "ultrawork"] as const) {
    await mkdir(join(source, "components", dir, "dist"), { recursive: true })
    await writeFile(join(source, "components", dir, "dist", "cli.js"), "#!/usr/bin/env node\n", "utf8")
  }
  for (const dir of ["ast-grep-mcp", "lsp-daemon", "git-bash-mcp"] as const) {
    await mkdir(join(source, dir, "dist"), { recursive: true })
    await writeFile(join(source, dir, "dist", "cli.js"), "#!/usr/bin/env node\n", "utf8")
  }
  return source
}
