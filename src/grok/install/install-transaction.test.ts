import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import {
  cleanupInstallSnapshot,
  createInstallSnapshot,
  restoreInstallSnapshot,
  type InstallSnapshotState,
} from "./install-transaction"

const temps: string[] = []

afterEach(() => {
  for (const root of temps.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function makeHome(): string {
  const root = mkdtempSync(join(tmpdir(), "lfg-install-tx-"))
  temps.push(root)
  return root
}

function stateFor(home: string, agentFiles: string[]): InstallSnapshotState {
  const pluginRoot = join(home, ".grok", "plugins", "lfg")
  return {
    configPath: join(home, ".grok", "config.toml"),
    additionalAgentFiles: agentFiles,
    marketplaceManifestPath: join(pluginRoot, "package.json"),
  }
}

describe("install-transaction (LFP parity under ~/.grok)", () => {
  test("createInstallSnapshot backs up existing config, agents, and plugin package.json", () => {
    const home = makeHome()
    const agentsDir = join(home, ".grok", "agents")
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    mkdirSync(agentsDir, { recursive: true })
    mkdirSync(pluginRoot, { recursive: true })
    const agentPath = join(agentsDir, "explorer.toml")
    writeFileSync(join(home, ".grok", "config.toml"), 'model = "before"\n', "utf8")
    writeFileSync(agentPath, 'model = "agent-before"\n', "utf8")
    writeFileSync(join(pluginRoot, "package.json"), '{"name":"lfg","version":"0.0.1"}\n', "utf8")

    const snapshot = createInstallSnapshot(stateFor(home, [agentPath]))
    temps.push(snapshot.snapshotRoot)

    expect(snapshot.configExisted).toBe(true)
    expect(existsSync(snapshot.configBackup)).toBe(true)
    expect(readFileSync(snapshot.configBackup, "utf8")).toContain("before")
    expect(snapshot.agents).toHaveLength(1)
    expect(snapshot.agents[0]?.existed).toBe(true)
    expect(readFileSync(snapshot.agents[0]!.backupPath, "utf8")).toContain("agent-before")
    expect(snapshot.marketplaceManifestExisted).toBe(true)
    expect(readFileSync(snapshot.marketplaceManifestBackup, "utf8")).toContain("0.0.1")
  })

  test("restoreInstallSnapshot reverts mutations and deletes files that did not exist pre-install", () => {
    const home = makeHome()
    const agentsDir = join(home, ".grok", "agents")
    const pluginRoot = join(home, ".grok", "plugins", "lfg")
    mkdirSync(agentsDir, { recursive: true })
    mkdirSync(pluginRoot, { recursive: true })
    const existingAgent = join(agentsDir, "explorer.toml")
    const newAgent = join(agentsDir, "newcomer.toml")
    writeFileSync(join(home, ".grok", "config.toml"), 'model = "before"\n', "utf8")
    writeFileSync(existingAgent, 'model = "agent-before"\n', "utf8")
    writeFileSync(join(pluginRoot, "package.json"), '{"name":"lfg","version":"0.0.1"}\n', "utf8")

    const snapshot = createInstallSnapshot(stateFor(home, [existingAgent, newAgent]))
    temps.push(snapshot.snapshotRoot)

    writeFileSync(join(home, ".grok", "config.toml"), 'model = "after"\n', "utf8")
    writeFileSync(existingAgent, 'model = "agent-after"\n', "utf8")
    writeFileSync(newAgent, 'model = "brand-new"\n', "utf8")
    writeFileSync(join(pluginRoot, "package.json"), '{"name":"lfg","version":"9.9.9"}\n', "utf8")

    restoreInstallSnapshot(snapshot)

    expect(readFileSync(join(home, ".grok", "config.toml"), "utf8")).toContain("before")
    expect(readFileSync(existingAgent, "utf8")).toContain("agent-before")
    expect(existsSync(newAgent)).toBe(false)
    expect(readFileSync(join(pluginRoot, "package.json"), "utf8")).toContain("0.0.1")
  })

  test("cleanupInstallSnapshot removes snapshotRoot", () => {
    const home = makeHome()
    mkdirSync(join(home, ".grok"), { recursive: true })
    writeFileSync(join(home, ".grok", "config.toml"), "x = 1\n", "utf8")
    const snapshot = createInstallSnapshot(stateFor(home, []))
    expect(existsSync(snapshot.snapshotRoot)).toBe(true)
    cleanupInstallSnapshot(snapshot)
    expect(existsSync(snapshot.snapshotRoot)).toBe(false)
  })

  test("restore removes config when it did not exist pre-install", () => {
    const home = makeHome()
    mkdirSync(join(home, ".grok"), { recursive: true })
    const snapshot = createInstallSnapshot(stateFor(home, []))
    temps.push(snapshot.snapshotRoot)
    expect(snapshot.configExisted).toBe(false)
    writeFileSync(join(home, ".grok", "config.toml"), 'model = "created-by-install"\n', "utf8")
    restoreInstallSnapshot(snapshot)
    expect(existsSync(join(home, ".grok", "config.toml"))).toBe(false)
  })
})
