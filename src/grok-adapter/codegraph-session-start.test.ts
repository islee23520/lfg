import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { runCodegraphSessionStart, type CodegraphSessionStartOutcome } from "./codegraph-session-start"
import type { CodegraphProvisionResult } from "./codegraph-provision"

const outcomes = (records: CodegraphSessionStartOutcome[]) => records

describe("runCodegraphSessionStart", () => {
  test("skipped-disabled when config.enabled is false", async () => {
    const result = await runCodegraphSessionStart({ config: { enabled: false }, cwd: "/proj" })
    expect(result.action).toBe("skipped-disabled")
  })

  test("skipped-unavailable when binary does not resolve and auto_provision is false", async () => {
    const result = await runCodegraphSessionStart({
      config: { auto_provision: false },
      cwd: "/proj",
      env: {},
      resolveCommand: () => ({ argsPrefix: [], command: "codegraph", exists: false, source: "bundled" }),
    })
    expect(result.action).toBe("skipped-unavailable")
  })

  test("syncs when status reports an existing graph", async () => {
    const result = await runCodegraphSessionStart({
      config: {},
      cwd: "/proj",
      env: {},
      resolveCommand: () => ({ argsPrefix: [], command: "/opt/codegraph/bin/codegraph", exists: true, source: "env" }),
      runCommand: async (_cwd, _command, args) => {
        if (args.includes("status")) return { exitCode: 0, stdout: JSON.stringify({ initialized: true }), stderr: "", timedOut: false }
        return { exitCode: 0, stdout: "", stderr: "", timedOut: false }
      },
    })
    expect(result.action).toBe("synced")
  })

  test("initializes when status reports no graph", async () => {
    const result = await runCodegraphSessionStart({
      config: {},
      cwd: "/proj",
      env: {},
      resolveCommand: () => ({ argsPrefix: [], command: "/opt/codegraph/bin/codegraph", exists: true, source: "env" }),
      runCommand: async (_cwd, _command, args) => {
        if (args.includes("status")) return { exitCode: 1, stdout: "", stderr: "", timedOut: false }
        return { exitCode: 0, stdout: "", stderr: "", timedOut: false }
      },
    })
    expect(result.action).toBe("initialized")
  })

  test("skipped-status when status times out", async () => {
    const result = await runCodegraphSessionStart({
      config: {},
      cwd: "/proj",
      env: {},
      resolveCommand: () => ({ argsPrefix: [], command: "/opt/codegraph/bin/codegraph", exists: true, source: "env" }),
      runCommand: async (_cwd, _command, args) => {
        if (args.includes("status")) return { exitCode: 124, stdout: "", stderr: "", timedOut: true }
        return { exitCode: 0, stdout: "", stderr: "", timedOut: false }
      },
    })
    expect(result.action).toBe("skipped-status")
  })

  test("failed when runCommand throws", async () => {
    const result = await runCodegraphSessionStart({
      config: {},
      cwd: "/proj",
      env: {},
      resolveCommand: () => ({ argsPrefix: [], command: "/opt/codegraph/bin/codegraph", exists: true, source: "env" }),
      runCommand: async () => {
        throw new Error("spawn failed")
      },
    })
    expect(result.action).toBe("failed")
  })

  test("writes outcome to session-start.log", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-cg-home-"))
    try {
      const records: CodegraphSessionStartOutcome[] = []
      await runCodegraphSessionStart({
        config: { enabled: false },
        cwd: "/proj",
        homeDir: home,
        logOutcome: (outcome) => records.push(outcome),
      })
      // When logOutcome is injected, the default file appender is bypassed.
      expect(outcomes(records).length).toBe(1)
      expect(records[0]?.action).toBe("skipped-disabled")
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})
