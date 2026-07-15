import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { findExecutableInPath } from "./executable-path"

const tempRoots = new Set<string>()

afterEach(async () => {
  await Promise.all([...tempRoots].map((root) => rm(root, { recursive: true, force: true })))
  tempRoots.clear()
})

async function makeTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  tempRoots.add(root)
  return root
}

describe("findExecutableInPath", () => {
  test("resolves an executable regular file without invoking it", async () => {
    const bin = await makeTempRoot("lfg-executable-path-")
    const marker = join(bin, "invoked")
    const command = join(bin, "worker")
    await writeFile(command, `#!/bin/sh\ntouch '${marker}'\n`, "utf8")
    await chmod(command, 0o755)

    await expect(findExecutableInPath("worker", { PATH: bin }, "linux")).resolves.toBe(command)
    await expect(access(marker)).rejects.toThrow()
  })

  test("rejects a non-executable POSIX file", async () => {
    const bin = await makeTempRoot("lfg-executable-path-nonexec-")
    await writeFile(join(bin, "worker"), "#!/bin/sh\nexit 0\n", "utf8")

    await expect(findExecutableInPath("worker", { PATH: bin }, "linux")).resolves.toBeNull()
  })

  test("rejects an executable directory", async () => {
    const bin = await makeTempRoot("lfg-executable-path-directory-")
    await mkdir(join(bin, "worker"))
    await chmod(join(bin, "worker"), 0o755)

    await expect(findExecutableInPath("worker", { PATH: bin }, "linux")).resolves.toBeNull()
  })

  test("supports absolute command paths", async () => {
    const bin = await makeTempRoot("lfg-executable-path-absolute-")
    const command = join(bin, "worker")
    await writeFile(command, "#!/bin/sh\nexit 0\n", "utf8")
    await chmod(command, 0o755)

    await expect(findExecutableInPath(command, {}, "linux")).resolves.toBe(command)
  })

  test.each([
    { pathKey: "PATH", extensionKey: "PATHEXT" },
    { pathKey: "Path", extensionKey: "Pathext" },
  ] as const)("supports Windows $pathKey and $extensionKey while preserving path case", async ({ pathKey, extensionKey }) => {
    const bin = await makeTempRoot("LFG-Executable-Path-Windows-")
    const command = join(bin, "Worker.CMD")
    await writeFile(command, "@echo off\r\n", "utf8")

    await expect(findExecutableInPath("Worker", {
      [pathKey]: bin,
      [extensionKey]: ".EXE;.CMD",
    }, "win32")).resolves.toBe(command)
  })

  test("applies PATHEXT to absolute Windows commands", async () => {
    const bin = await makeTempRoot("lfg-executable-path-win-absolute-")
    const base = join(bin, "Worker")
    const command = `${base}.CMD`
    await writeFile(command, "@echo off\r\n", "utf8")

    await expect(findExecutableInPath(base, { PATHEXT: ".CMD" }, "win32")).resolves.toBe(command)
  })
})
