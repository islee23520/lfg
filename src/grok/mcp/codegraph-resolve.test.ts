import { describe, expect, test } from "vitest"
import {
  CODEGRAPH_ENV_BIN,
  CODEGRAPH_INSTALL_DIR_ENV,
  CODEGRAPH_NO_DOWNLOAD_ENV,
  CODEGRAPH_TELEMETRY_ENV,
  DO_NOT_TRACK_ENV,
  buildCodegraphEnv,
  createCodegraphMcpEntry,
  defaultCodegraphInstallDir,
  provisionedBinFromInstallDir,
  resolveCodegraphCommand,
} from "./codegraph-resolve"

const present = (paths: string[]) => (p: string) => paths.includes(p)

describe("buildCodegraphEnv", () => {
  test("uses ~/.omo/codegraph, telemetry off, no auto-download", () => {
    const env = buildCodegraphEnv({ homeDir: "/home/user" })
    expect(env[CODEGRAPH_INSTALL_DIR_ENV]).toBe("/home/user/.omo/codegraph")
    expect(env[CODEGRAPH_NO_DOWNLOAD_ENV]).toBe("1")
    expect(env[CODEGRAPH_TELEMETRY_ENV]).toBe("0")
    expect(env[DO_NOT_TRACK_ENV]).toBe("1")
  })

  test("defaults to real homedir when omitted", () => {
    const env = buildCodegraphEnv()
    expect(env[CODEGRAPH_INSTALL_DIR_ENV]).toContain(".omo/codegraph")
  })
})

describe("defaultCodegraphInstallDir", () => {
  test("joins home + .omo/codegraph", () => {
    expect(defaultCodegraphInstallDir("/h")).toBe("/h/.omo/codegraph")
  })
})

describe("provisionedBinFromInstallDir", () => {
  test("returns bin path when present", () => {
    const installDir = "/home/user/.omo/codegraph"
    const expected = `${installDir}/bin/codegraph`
    const result = provisionedBinFromInstallDir(installDir, present([expected]))
    expect(result).toBe(expected)
  })

  test("returns null when install dir undefined", () => {
    expect(provisionedBinFromInstallDir(undefined)).toBeNull()
  })

  test("returns null when binary missing", () => {
    expect(provisionedBinFromInstallDir("/x", present([]))).toBeNull()
  })
})

describe("resolveCodegraphCommand", () => {
  test("prefers OMO_CODEGRAPH_BIN env path when it exists", () => {
    const bin = "/opt/codegraph/bin/codegraph"
    const result = resolveCodegraphCommand({
      env: { [CODEGRAPH_ENV_BIN]: bin },
      fileExists: present([bin]),
      which: () => null,
      provisioned: () => null,
    })
    expect(result).toMatchObject({ command: bin, exists: true, source: "env" })
  })

  test("falls back to provisioned install dir", () => {
    const provisionedBin = "/home/user/.omo/codegraph/bin/codegraph"
    const result = resolveCodegraphCommand({
      env: {},
      fileExists: present([provisionedBin]),
      which: () => null,
      provisioned: () => provisionedBin,
      homeDir: "/home/user",
    })
    expect(result).toMatchObject({ command: provisionedBin, exists: true, source: "provisioned" })
  })

  test("falls back to PATH which", () => {
    const pathBin = "/usr/local/bin/codegraph"
    const result = resolveCodegraphCommand({
      env: {},
      fileExists: present([pathBin]),
      which: (name) => (name === "codegraph" ? pathBin : null),
      provisioned: () => null,
    })
    expect(result).toMatchObject({ command: pathBin, exists: true, source: "path" })
  })

  test("reports not found when nothing resolves", () => {
    const result = resolveCodegraphCommand({
      env: {},
      fileExists: present([]),
      which: () => null,
      provisioned: () => null,
    })
    expect(result.exists).toBe(false)
    expect(result.source).toBe("bundled")
  })

  test("skips env bin that does not exist on disk", () => {
    const result = resolveCodegraphCommand({
      env: { [CODEGRAPH_ENV_BIN]: "/nope/codegraph" },
      fileExists: present([]),
      which: () => null,
      provisioned: () => null,
    })
    expect(result.exists).toBe(false)
  })
})

describe("createCodegraphMcpEntry", () => {
  test("emits serve --mcp command when binary resolves", () => {
    const bin = "/opt/codegraph/bin/codegraph"
    const entry = createCodegraphMcpEntry({
      env: { [CODEGRAPH_ENV_BIN]: bin },
      fileExists: present([bin]),
      which: () => null,
      provisioned: () => null,
      homeDir: "/home/user",
    })
    expect(entry.enabled).toBe(true)
    expect(entry.command).toStrictEqual([bin, "serve", "--mcp"])
    expect(entry.environment[CODEGRAPH_INSTALL_DIR_ENV]).toBe("/home/user/.omo/codegraph")
    expect(entry.environment[CODEGRAPH_TELEMETRY_ENV]).toBe("0")
  })

  test("disabled when binary does not resolve", () => {
    const entry = createCodegraphMcpEntry({
      env: {},
      fileExists: present([]),
      which: () => null,
      provisioned: () => null,
    })
    expect(entry.enabled).toBe(false)
    expect(entry.command).toStrictEqual(["codegraph", "serve", "--mcp"])
  })

  test("honors explicit install_dir override in environment", () => {
    const bin = "/opt/codegraph/bin/codegraph"
    const entry = createCodegraphMcpEntry({
      env: { [CODEGRAPH_ENV_BIN]: bin },
      fileExists: present([bin]),
      which: () => null,
      provisioned: () => null,
      homeDir: "/home/user",
      installDir: "/custom/codegraph",
    })
    expect(entry.environment[CODEGRAPH_INSTALL_DIR_ENV]).toBe("/custom/codegraph")
  })
})
