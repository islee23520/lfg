import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { assert, assertDeepEqual, assertEqual, isRecord } from "../assert"
import { parseJson } from "../command"
import type { SmokeCheck, SmokeContext } from "../types"

function readJson(path: string): unknown {
  return parseJson(readFileSync(path, "utf8"), path)
}

function readText(path: string): string {
  return readFileSync(path, "utf8")
}

function pluginPath(context: SmokeContext, rel: string): string {
  return join(context.paths.pluginRoot, rel)
}

function repoPath(context: SmokeContext, rel: string): string {
  return join(context.paths.repoRoot, rel)
}

export const manifestAndFileChecks: SmokeCheck = {
  name: "manifest-and-file-checks",
  run(context) {
    for (const rel of [".grok-plugin/plugin.json", ".claude-plugin/plugin.json", "hooks/hooks.json", ".mcp.json", ".lsp.json", "catalog/omo-skill-map.json", "src/mcp/tools.json"]) {
      readJson(pluginPath(context, rel))
    }

    for (const rel of [
      "skills/lfg/SKILL.md",
      "agents/sisyphus.md",
      "agents/sisyphus-junior.md",
      "agents/prometheus.md",
      "agents/atlas.md",
      "agents/hephaestus.md",
      "agents/oracle.md",
      "src/agents/harness.toml",
      "hooks/scripts/lfg-audit-hook.sh",
      "hooks/scripts/lfg-goal-harness.ts",
      "hooks/scripts/lfg-audit-hook.ts",
      "bin/lfg.ts",
      "bin/lfg-mcp.ts",
      "bin/self-test.ts",
      "src/runtime-ts/index.ts",
      "src/runtime-ts/index.test.ts",
      "src/hooks-ts/index.ts",
      "src/mcp-ts/server.ts",
      "src/smoke-ts/runner.ts",
    ]) {
      assert(existsSync(pluginPath(context, rel)), `missing ${rel}`)
    }

    for (const obsolete of ["Cargo.toml", "Cargo.lock", "src", "scripts"]) {
      assert(!existsSync(repoPath(context, obsolete)), `root ${obsolete} must be removed`)
    }
    assert(existsSync(repoPath(context, "tests/AGENTS.md")), "missing tests/AGENTS.md")
    assert(!existsSync(pluginPath(context, "bin/self-test.sh")), "shell smoke scripts are forbidden")
    assert(!existsSync(pluginPath(context, "bin/self-test.py")), "Python smoke scripts must be removed after cutover")

    const agents = new Set(readdirSync(pluginPath(context, "agents")).filter((path) => path.endsWith(".md")).map((path) => path.replace(/\.md$/, "")))
    for (const requiredAgent of ["sisyphus", "sisyphus-junior", "prometheus", "atlas", "hephaestus", "oracle", "builtin-agents"]) {
      assert(agents.has(requiredAgent), `missing Grok-discoverable plugin agent: ${requiredAgent}`)
    }

    const hooksJson = readJson(pluginPath(context, "hooks/hooks.json"))
    assert(isRecord(hooksJson), "hooks.json must be an object")
    const hooks = hooksJson.hooks
    assert(isRecord(hooks), "hooks.json must contain hooks object")
    const hookCommands = new Set<string>()
    for (const entries of Object.values(hooks)) {
      if (!Array.isArray(entries)) continue
      for (const entry of entries) {
        if (!isRecord(entry) || !Array.isArray(entry.hooks)) continue
        for (const hook of entry.hooks) {
          if (isRecord(hook) && typeof hook.command === "string") hookCommands.add(hook.command)
        }
      }
    }
    assert(hookCommands.has("scripts/lfg-audit-hook.ts"), `missing Bun audit hook: ${Array.from(hookCommands).join(",")}`)
    assert(hookCommands.has("scripts/lfg-goal-harness.ts"), `missing Bun goal hook: ${Array.from(hookCommands).join(",")}`)

    const workflow = readText(repoPath(context, ".github/workflows/smoke.yml"))
    assert(workflow.includes("bun plugins/lfg/bin/self-test.ts"), "smoke workflow must run Bun self-test")
    assert(workflow.includes("actions/checkout@v5"), "workflow must use actions/checkout@v5")
    assert(workflow.includes("sudo apt-get install -y tmux"), "workflow must install tmux")
    assert(workflow.includes("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24"), "workflow must force Node 24 actions")

    const releaseNotes = readText(repoPath(context, "docs/MARKETPLACE_RELEASE_NOTES.md"))
    assert(releaseNotes.includes("islee23520/lfg"), "release notes must include package")
    assert(releaseNotes.includes("lfg 0.1.0"), "release notes must include version surface")
    assert(releaseNotes.includes("/plugins"), "release notes must mention /plugins")
    assert(existsSync(repoPath(context, "docs/MARKETPLACE_INSTALL.md")), "missing marketplace install docs")

    for (const rel of [".grok/plugins/marketplace.json", ".agents/plugins/marketplace.json"]) {
      const data = readJson(repoPath(context, rel))
      assert(isRecord(data), `${rel} must be an object`)
      assert(Array.isArray(data.plugins), `${rel} plugins must be an array`)
      assertEqual(data.plugins.length, 1, `${rel} must contain one plugin`)
      const plugin = data.plugins[0]
      assert(isRecord(plugin), `${rel} plugin must be an object`)
      assertEqual(plugin.name, "lfg", rel)
      assert(isRecord(plugin.source), `${rel} source must be an object`)
      assertEqual(plugin.source.path, "plugins/lfg", rel)
      assert(isRecord(plugin.metadata), `${rel} metadata must be an object`)
      assertEqual(plugin.metadata.packageName, "islee23520/lfg", rel)
      assertEqual(plugin.metadata.reference, "https://github.com/code-yeongyu/oh-my-openagent", rel)
    }

    const rawTools = readJson(pluginPath(context, "src/mcp/tools.json"))
    assert(Array.isArray(rawTools), "tools.json must be an array")
    const rawToolNames = rawTools.map((tool) => {
      assert(isRecord(tool) && typeof tool.name === "string", "tool must have a string name")
      return tool.name
    })
    assertEqual(rawToolNames.length, new Set(rawToolNames).size, "MCP tool names must be unique")
    const tsServerSource = readText(pluginPath(context, "src/mcp-ts/tools.ts"))
    for (const shortName of rawToolNames) assert(tsServerSource.includes(shortName), `missing MCP handler for ${shortName}`)

    assertDeepEqual(readJson(pluginPath(context, ".grok-plugin/plugin.json")), readJson(pluginPath(context, ".claude-plugin/plugin.json")), "grok plugin manifest must stay materialized from claude plugin manifest")
    const grokMarket = readJson(repoPath(context, ".grok/plugins/marketplace.json"))
    const agentsMarket = readJson(repoPath(context, ".agents/plugins/marketplace.json"))
    assert(isRecord(grokMarket) && isRecord(agentsMarket), "marketplaces must be objects")
    assertEqual(grokMarket.name, agentsMarket.name, "marketplace name alignment")
    assertEqual(grokMarket.description, agentsMarket.description, "marketplace description alignment")
    assert(Array.isArray(grokMarket.plugins) && Array.isArray(agentsMarket.plugins), "marketplace plugins must be arrays")
    const grokPlugin = grokMarket.plugins[0]
    const agentsPlugin = agentsMarket.plugins[0]
    assert(isRecord(grokPlugin) && isRecord(agentsPlugin), "marketplace plugin entries must be objects")
    assertEqual(grokPlugin.name, agentsPlugin.name, "marketplace plugin name alignment")
    assertDeepEqual(grokPlugin.source, agentsPlugin.source, "marketplace source alignment")
    assertDeepEqual(grokPlugin.metadata, agentsPlugin.metadata, "marketplace metadata alignment")

    return [
      "manifest-and-file-checks=ok",
      "marketplace-metadata=ok",
      "manifest-reference-alignment=ok",
      "marketplace-reference-alignment=ok",
      "release-notes=ok",
      "marketplace-source=ok",
    ]
  },
}

export const agentsGuidesValidity: SmokeCheck = {
  name: "agents-guides-valid",
  run(context) {
    const guides: [string, string[]][] = [
      [repoPath(context, "AGENTS.md"), ["## OVERVIEW", "## CONVENTIONS", "## COMMANDS"]],
      [repoPath(context, "docs/AGENTS.md"), ["## OVERVIEW", "## CONVENTIONS", "## COMMANDS"]],
      [repoPath(context, "tests/AGENTS.md"), ["## OVERVIEW", "## CONVENTIONS", "## COMMANDS"]],
      [pluginPath(context, "AGENTS.md"), ["## OVERVIEW", "## CONVENTIONS", "## COMMANDS"]],
      [pluginPath(context, "scripts/AGENTS.md"), ["## OVERVIEW", "## CONVENTIONS", "## COMMANDS"]],
    ]
    for (const [path, markers] of guides) {
      const text = readText(path)
      assert(text.split("\n").length >= 12, `AGENTS guide too short: ${path}`)
      for (const marker of markers) assert(text.includes(marker), `missing ${marker} in ${path}`)
    }
    const pluginAgents = readText(pluginPath(context, "AGENTS.md"))
    assert(!pluginAgents.includes("self-test.sh"), "plugins/lfg/AGENTS.md must reference self-test.ts only, not .sh")
    assert(!pluginAgents.includes("grok_build_* tools"), "plugins/lfg/AGENTS.md must describe short MCP tool names as canonical")
    const scriptsAgents = readText(pluginPath(context, "scripts/AGENTS.md"))
    for (const removed of ["verify-release-readiness", "install-lfg-symlink.sh", "verify-team-*.sh", "verify-grok-*.sh", "verify-state-schema.sh"]) {
      assert(!scriptsAgents.includes(removed), `plugins/lfg/scripts/AGENTS.md must not describe removed shell gate ${removed}`)
    }
    return ["agents-guides-valid=ok"]
  },
}
