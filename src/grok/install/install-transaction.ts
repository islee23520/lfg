import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"

export type InstallSnapshotState = {
  readonly configPath: string
  readonly additionalAgentFiles: readonly string[]
  readonly marketplaceManifestPath: string
}

export type InstallSnapshotAgentBackup = {
  readonly filePath: string
  readonly backupPath: string
  readonly existed: boolean
}

export type InstallSnapshot = {
  readonly snapshotRoot: string
  readonly agents: readonly InstallSnapshotAgentBackup[]
  readonly configPath: string
  readonly configBackup: string
  readonly configExisted: boolean
  readonly marketplaceManifestPath: string
  readonly marketplaceManifestBackup: string
  readonly marketplaceManifestExisted: boolean
}

export function createInstallSnapshot(state: InstallSnapshotState): InstallSnapshot {
  const snapshotRoot = join(tmpdir(), `lfg-install-snapshot-${process.pid}-${Date.now()}`)
  const agentRoot = join(snapshotRoot, "agents")
  const configBackup = join(snapshotRoot, "config.toml")
  mkdirSync(agentRoot, { recursive: true })

  const agents = state.additionalAgentFiles.map((filePath) => {
    const backupPath = join(agentRoot, basename(filePath))
    const existed = existsSync(filePath)
    if (existed) cpSync(filePath, backupPath)
    return { filePath, backupPath, existed }
  })

  const configExisted = existsSync(state.configPath)
  if (configExisted) cpSync(state.configPath, configBackup)

  const marketplaceManifestBackup = join(snapshotRoot, "package.json")
  const marketplaceManifestExisted = existsSync(state.marketplaceManifestPath)
  if (marketplaceManifestExisted) cpSync(state.marketplaceManifestPath, marketplaceManifestBackup)

  return {
    snapshotRoot,
    agents,
    configPath: state.configPath,
    configBackup,
    configExisted,
    marketplaceManifestPath: state.marketplaceManifestPath,
    marketplaceManifestBackup,
    marketplaceManifestExisted,
  }
}

export function restoreInstallSnapshot(snapshot: InstallSnapshot): void {
  for (const agent of snapshot.agents) {
    if (agent.existed) {
      mkdirSync(dirname(agent.filePath), { recursive: true })
      rmSync(agent.filePath, { force: true })
      cpSync(agent.backupPath, agent.filePath)
    } else {
      rmSync(agent.filePath, { force: true })
    }
  }

  if (snapshot.configExisted) {
    mkdirSync(dirname(snapshot.configPath), { recursive: true })
    rmSync(snapshot.configPath, { force: true })
    cpSync(snapshot.configBackup, snapshot.configPath)
  } else {
    rmSync(snapshot.configPath, { force: true })
  }

  if (snapshot.marketplaceManifestExisted) {
    mkdirSync(dirname(snapshot.marketplaceManifestPath), { recursive: true })
    rmSync(snapshot.marketplaceManifestPath, { force: true })
    cpSync(snapshot.marketplaceManifestBackup, snapshot.marketplaceManifestPath)
  } else {
    rmSync(snapshot.marketplaceManifestPath, { force: true })
  }
}

export function cleanupInstallSnapshot(snapshot: InstallSnapshot): void {
  rmSync(snapshot.snapshotRoot, { recursive: true, force: true })
}
