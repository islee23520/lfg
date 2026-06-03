import { cp, lstat, mkdir, rm } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"

export type ExistingGrokSetting = {
  readonly label: string
  readonly path: string
}

export type GrokSettingsSnapshot = {
  readonly root: string
  readonly entries: readonly GrokSettingsSnapshotEntry[]
}

type GrokSettingsSnapshotEntry = {
  readonly setting: ExistingGrokSetting
  readonly backupPath: string
}

export async function findExistingGrokSettings(): Promise<readonly ExistingGrokSetting[]> {
  const home = homedir()
  const candidates = [
    { label: "Global Grok agents", path: join(home, ".grok", "agents") },
    { label: "Global Grok config", path: join(home, ".grok", "config.toml") },
    { label: "Stable lfg installed plugin", path: join(home, ".grok", "installed-plugins", "lfg") },
    { label: "lazycodex installed plugin", path: join(home, ".grok", "installed-plugins", "0-1-0-ff47fdd7") },
    { label: "Project Grok agents", path: resolve(process.cwd(), ".grok", "agents") },
  ] as const
  const seen = new Set<string>()
  const settings: ExistingGrokSetting[] = []
  for (const candidate of candidates) {
    const path = resolve(candidate.path)
    if (seen.has(path) || !(await pathExists(path))) continue
    seen.add(path)
    settings.push({ label: candidate.label, path })
  }
  return settings
}

export async function snapshotGrokSettings(settings: readonly ExistingGrokSetting[]): Promise<GrokSettingsSnapshot> {
  const root = join(homedir(), ".grok", "lfg-backups", timestamp())
  await mkdir(root, { recursive: true })
  const entries: GrokSettingsSnapshotEntry[] = []
  for (const setting of settings) {
    const backupPath = join(root, safeBackupName(setting))
    await cp(setting.path, backupPath, { recursive: true, force: true, verbatimSymlinks: true })
    entries.push({ setting, backupPath })
  }
  return { root, entries }
}

export async function restoreGrokSettings(snapshot: GrokSettingsSnapshot): Promise<readonly ExistingGrokSetting[]> {
  const restored: ExistingGrokSetting[] = []
  for (const entry of snapshot.entries) {
    await rm(entry.setting.path, { recursive: true, force: true })
    await mkdir(dirname(entry.setting.path), { recursive: true })
    await cp(entry.backupPath, entry.setting.path, { recursive: true, force: true, verbatimSymlinks: true })
    restored.push(entry.setting)
  }
  return restored
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false
    throw error
  }
}

function safeBackupName(setting: ExistingGrokSetting): string {
  const name = basename(setting.path) || "root"
  return `${setting.label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${name}`
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(/[-:TZ.]/g, "").slice(0, 14)
}
