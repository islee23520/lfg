import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test, vi } from "vitest"
import { installLfgGlobally } from "./lfg-global-install"

describe("installLfgGlobally", () => {
  test("installs the current package from a locally packed tarball", async () => {
    // Given
    const packageRoot = await mkdtemp(join(tmpdir(), "lfg-global-source-"))
    await writeFile(join(packageRoot, "package.json"), '{"name":"@islee23520/lfg","version":"0.1.30"}\n', "utf8")
    const calls: { readonly command: string; readonly args: readonly string[]; readonly cwd: string }[] = []
    const runner = vi.fn(async (command: string, args: readonly string[], cwd: string) => {
      calls.push({ command, args, cwd })
      if (args[0] === "pack") {
        const tarballPath = join(args[2] ?? "", "islee23520-lfg-0.1.30.tgz")
        await writeFile(tarballPath, "packed", "utf8")
        return { stdout: "islee23520-lfg-0.1.30.tgz\n", stderr: "" }
      }
      return { stdout: "installed", stderr: "" }
    })

    // When
    const result = await installLfgGlobally({ packageRoot, runner })

    // Then
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[0]?.args.slice(0, 2)).toEqual(["pack", "--pack-destination"])
    expect(calls[1]?.args).toEqual(["install", "--global", result.args[2]])
    expect(result.args[2]).not.toContain("@latest")
    await expect(readFile(result.args[2] ?? "", "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })
})
