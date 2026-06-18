import { createHash, randomUUID } from "node:crypto"
import { chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { CODEGRAPH_PROVISION_MANIFEST } from "./codegraph-manifest"

/**
 * Codegraph provisioning (sha256-verified download + atomic install).
 *
 * Ported (host-neutral) from `oh-my-openagent` `packages/utils/src/codegraph/provision.ts`
 * so lfg can provision the external `@colbymchenry/codegraph` binary into
 * `~/.omo/codegraph` the same way the upstream OpenCode/Codex adapters do.
 *
 * Used by the codegraph SessionStart bootstrap hook. See
 * `docs/grok-adapter-core-port-strategy.md` (Phase 0).
 */

export interface CodegraphProvisionAsset {
  readonly executableName: string
  readonly sha256: string
  readonly url: string
}

export interface CodegraphProvisionManifest {
  readonly assets: Record<string, CodegraphProvisionAsset>
  readonly version: string
}

export interface EnsureCodegraphProvisionedOptions {
  readonly downloader?: (asset: CodegraphProvisionAsset) => Promise<Uint8Array>
  readonly downloadTimeoutMs?: number
  readonly extractor?: (tarballPath: string, destDir: string) => Promise<void>
  readonly installDir?: string
  readonly lockDir: string
  readonly lockStaleMs?: number
  readonly lockWaitMs?: number
  readonly manifest?: CodegraphProvisionManifest
  readonly platformKey?: string
  readonly version: "1.0.1"
}

export interface CodegraphProvisionResult {
  readonly binPath?: string
  readonly error?: string
  readonly provisioned: boolean
}

const DEFAULT_LOCK_WAIT_MS = 5_000
const DEFAULT_LOCK_STALE_MS = 120_000
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 60_000
const execFileAsync = promisify(execFile)

function platformKey(): string {
  return `${process.platform}-${process.arch}`
}

function markerPath(installDir: string, version: string): string {
  return join(installDir, ".provisioned", `codegraph-${version}.json`)
}

function defaultInstallDir(): string {
  return join(homedir(), ".omo", "codegraph")
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

async function removeEmptyDirectory(path: string): Promise<void> {
  try {
    await rm(path, { recursive: false })
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") return
    if (isErrnoException(error) && error.code === "ENOTEMPTY") return
    throw error
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function defaultDownloader(asset: CodegraphProvisionAsset, timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS): Promise<Uint8Array> {
  const response = await fetch(asset.url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`download failed with HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function readMarker(path: string): Promise<string | null> {
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(await readFile(path, "utf8"))
    if (typeof raw === "object" && raw !== null && "binPath" in raw) {
      const value = raw.binPath
      return typeof value === "string" && existsSync(value) ? value : null
    }
    return null
  } catch (error) {
    if (error instanceof Error) return null
    throw error
  }
}

async function writeMarker(path: string, binPath: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true })
  await writeFile(path, `${JSON.stringify({ binPath, provisionedAt: new Date().toISOString() })}\n`, "utf8")
}

async function acquireLock(lockDir: string, staleMs: number, waitMs: number): Promise<string | null> {
  await mkdir(lockDir, { recursive: true })
  const lockPath = join(lockDir, "provision.lock")
  const token = randomUUID()
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    try {
      await writeFile(lockPath, token, { flag: "wx" })
      return lockPath
    } catch (error) {
      if (!isErrnoException(error) || error.code !== "EEXIST") throw error
      const stats = await stat(lockPath).catch(() => null)
      if (stats !== null && Date.now() - stats.mtimeMs > staleMs) {
        await rm(lockPath, { force: true })
        continue
      }
      await sleep(100)
    }
  }
  return null
}

async function extractTarball(tarballPath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true })
  // List entries first and reject path traversal before extraction.
  const { stdout } = await execFileAsync("tar", ["-tzf", tarballPath], { maxBuffer: 1024 * 1024 })
  const entries = stdout.split(/\r?\n/).filter((line) => line.length > 0)
  for (const entry of entries) {
    if (!isSafeTarEntry(entry)) {
      throw new Error(`tar entry escapes dest dir: ${entry}`)
    }
  }
  await execFileAsync("tar", ["-xzf", tarballPath, "-C", destDir])
}

function isSafeTarEntry(entry: string): boolean {
  if (entry.startsWith("/")) return false
  if (entry.startsWith("\\")) return false
  // Reject Windows drive roots (e.g. C:\) and parent traversal.
  if (/^[a-zA-Z]:[\\/]/.test(entry)) return false
  const parts = entry.split("/")
  for (const part of parts) {
    if (part === "..") return false
  }
  return true
}

/**
 * Ensure the codegraph binary is provisioned for the current platform.
 * Downloads the platform tarball, verifies the sha256, extracts, and atomically
 * promotes into `<installDir>/bin/`. Returns the bin path on success.
 */
export async function ensureCodegraphProvisioned(options: EnsureCodegraphProvisionedOptions): Promise<CodegraphProvisionResult> {
  const manifest = options.manifest ?? CODEGRAPH_PROVISION_MANIFEST
  const key = options.platformKey ?? platformKey()
  const installDir = options.installDir ?? defaultInstallDir()
  const lockDir = options.lockDir
  const version = options.version

  const marker = markerPath(installDir, version)
  const existing = await readMarker(marker)
  if (existing !== null) return { provisioned: true, binPath: existing }

  const asset = manifest.assets[key]
  if (asset === undefined) {
    return { provisioned: false, error: `no codegraph asset for platform ${key}` }
  }

  const lockPath = await acquireLock(lockDir, options.lockStaleMs ?? DEFAULT_LOCK_STALE_MS, options.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS)
  if (lockPath === null) {
    return { provisioned: false, error: "could not acquire provisioning lock" }
  }

  try {
    const downloader = options.downloader ?? defaultDownloader
    const bytes = await downloader(asset)
    const hash = sha256(bytes)
    if (hash !== asset.sha256) {
      return { provisioned: false, error: `checksum mismatch for ${asset.url} (expected ${asset.sha256}, got ${hash})` }
    }

    const staging = join(installDir, ".staging", randomUUID())
    await mkdir(staging, { recursive: true })
    const tarballPath = join(staging, `${asset.executableName}.tar.gz`)
    await writeFile(tarballPath, bytes)
    const extractor = options.extractor ?? extractTarball
    await extractor(tarballPath, staging)

    // Locate the extracted binary (may be at staging root or in a nested bin/).
    const binDir = join(installDir, "bin")
    const candidate = await locateExecutable(staging, asset.executableName)
    if (candidate === null) {
      await rm(staging, { recursive: true, force: true })
      return { provisioned: false, error: `extracted tarball did not contain ${asset.executableName}` }
    }

    await mkdir(binDir, { recursive: true })
    const finalPath = join(binDir, asset.executableName)
    await rename(candidate, finalPath)
    if (process.platform !== "win32") await chmod(finalPath, 0o755)
    await rm(staging, { recursive: true, force: true })
    await writeMarker(marker, finalPath)
    return { provisioned: true, binPath: finalPath }
  } catch (error) {
    return { provisioned: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    await rm(lockPath, { force: true }).catch(() => {})
    await removeEmptyDirectory(join(installDir, ".staging")).catch(() => {})
  }
}

async function locateExecutable(dir: string, executableName: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.name === executableName && entry.isFile()) return fullPath
    if (entry.isDirectory()) {
      const nested = await locateExecutable(fullPath, executableName)
      if (nested !== null) return nested
    }
  }
  return null
}
