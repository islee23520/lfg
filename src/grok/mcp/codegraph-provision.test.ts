import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir, homedir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  ensureCodegraphProvisioned,
  type CodegraphProvisionAsset,
  type CodegraphProvisionManifest,
} from "./codegraph-provision"

const PLATFORM = `${process.platform}-${process.arch}`
const VALID_BYTES = new TextEncoder().encode("fake-binary-content")

/** Fake extractor: writes the executableName into destDir so provisioning can locate it. */
async function fakeExtractor(tarballPath: string, destDir: string): Promise<void> {
  const name = tarballPath.endsWith(".cmd.tar.gz") ? "codegraph.cmd" : "codegraph"
  await mkdir(destDir, { recursive: true })
  await writeFile(join(destDir, name), "#!/bin/sh\nexit 0\n", { mode: 0o755 })
}

function manifestFor(hash: string): CodegraphProvisionManifest {
  const asset: CodegraphProvisionAsset = {
    executableName: process.platform === "win32" ? "codegraph.cmd" : "codegraph",
    sha256: hash,
    url: "memory://test",
  }
  return { assets: { [PLATFORM]: asset }, version: "1.0.1" }
}

function sha256(bytes: Uint8Array): string {
  const { createHash } = require("node:crypto") as typeof import("node:crypto")
  return createHash("sha256").update(bytes).digest("hex")
}

describe("ensureCodegraphProvisioned", () => {
  test("writes binary and marker when checksum matches", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "lfg-cg-prov-"))
    const lockDir = join(installDir, "locks")
    try {
      const validManifest = {
        assets: { [PLATFORM]: { executableName: "codegraph", sha256: sha256(VALID_BYTES), url: "memory://test" } },
        version: "1.0.1" as const,
      }
      const result = await ensureCodegraphProvisioned({
        installDir,
        lockDir,
        version: "1.0.1",
        manifest: validManifest,
        downloader: async () => VALID_BYTES,
        extractor: fakeExtractor,
      })
      expect(result.provisioned).toBe(true)
      expect(result.binPath).toBe(join(installDir, "bin", "codegraph"))
    } finally {
      await rm(installDir, { recursive: true, force: true })
    }
  })

  test("fails with checksum mismatch when hash differs", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "lfg-cg-bad-"))
    const lockDir = join(installDir, "locks")
    try {
      const result = await ensureCodegraphProvisioned({
        installDir,
        lockDir,
        version: "1.0.1",
        manifest: manifestFor("0".repeat(64)),
        downloader: async () => VALID_BYTES,
      })
      expect(result.provisioned).toBe(false)
      expect(result.error).toContain("checksum mismatch")
    } finally {
      await rm(installDir, { recursive: true, force: true })
    }
  })

  test("returns existing marker without re-downloading", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "lfg-cg-marker-"))
    const lockDir = join(installDir, "locks")
    let downloads = 0
    try {
      const validManifest = {
        assets: { [PLATFORM]: { executableName: "codegraph", sha256: sha256(VALID_BYTES), url: "memory://test" } },
        version: "1.0.1" as const,
      }
      const downloader = async () => {
        downloads += 1
        return VALID_BYTES
      }
      const first = await ensureCodegraphProvisioned({ installDir, lockDir, version: "1.0.1", manifest: validManifest, downloader, extractor: fakeExtractor })
      const second = await ensureCodegraphProvisioned({ installDir, lockDir, version: "1.0.1", manifest: validManifest, downloader, extractor: fakeExtractor })
      expect(first.provisioned).toBe(true)
      expect(second.provisioned).toBe(true)
      expect(second.binPath).toBe(first.binPath)
      expect(downloads).toBe(1)
    } finally {
      await rm(installDir, { recursive: true, force: true })
    }
  })

  test("fails for unknown platform key", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "lfg-cg-unknown-"))
    const lockDir = join(installDir, "locks")
    try {
      const result = await ensureCodegraphProvisioned({
        installDir,
        lockDir,
        version: "1.0.1",
        manifest: { assets: {}, version: "1.0.1" },
        platformKey: "unknown-platform",
      })
      expect(result.provisioned).toBe(false)
      expect(result.error).toContain("no codegraph asset")
    } finally {
      await rm(installDir, { recursive: true, force: true })
    }
  })
})
