import { access, chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { isRecord } from "../../shared/json"
import { codingToolAdapterVerifyJson } from "./coding-tool-adapter-verify"

const originalPath = process.env.PATH

afterEach(() => {
  process.env.PATH = originalPath
})

describe("codingToolAdapterVerifyJson", () => {
  test("reports actionable availability diagnostic when grok command is missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-adapter-grok-missing-"))
    await writeRuntimeConfig(home)
    process.env.PATH = ""

    const json = await codingToolAdapterVerifyJson(home, "grok", true)

    const availability = requireRecord(json.availability)
    expect(availability.status).toBe("missing_command")
    expect(availability.commandAvailable).toBe(false)
    expect(availability.diagnostic).toMatchObject({
      code: "adapter_command_missing",
      message: expect.stringContaining("grok"),
      action: expect.stringContaining("grok"),
      hostAuth: {
        ownedBy: "grok",
        checked: false,
      },
    })
    const executionPlan = requireRecord(json.executionPlan)
    expect(executionPlan.executionStatus).toBe("not_executed")
    await expectNoAuthFile(home)
  })

  test("reports config diagnostic before command availability", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-adapter-config-missing-"))
    process.env.PATH = ""

    const json = await codingToolAdapterVerifyJson(home, "grok", false)

    const availability = requireRecord(json.availability)
    expect(availability.status).toBe("missing_required_files")
    expect(availability.diagnostic).toMatchObject({
      code: "adapter_config_missing",
      message: expect.stringContaining("lfg setup"),
      action: expect.stringContaining("lfg setup --run"),
      hostAuth: {
        ownedBy: "grok",
        checked: false,
      },
    })
    const executionPlan = requireRecord(json.executionPlan)
    expect(executionPlan.executionStatus).toBe("not_executed")
    await expectNoAuthFile(home)
  })

  test("reports available diagnostic when grok command and config are present", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-adapter-available-"))
    await writeRuntimeConfig(home)
    const bin = await mkdtemp(join(tmpdir(), "lfg-adapter-bin-"))
    const marker = join(home, "grok-executed.marker")
    await writeFakeCommand(bin, "grok", marker)
    process.env.PATH = bin

    const json = await codingToolAdapterVerifyJson(home, "grok", true)

    const availability = requireRecord(json.availability)
    expect(availability.status).toBe("available")
    expect(availability.diagnostic).toMatchObject({
      code: "adapter_available",
      message: expect.stringContaining("grok"),
      action: expect.stringContaining("No action"),
      hostAuth: {
        ownedBy: "grok",
        checked: false,
      },
    })
    const executionPlan = requireRecord(json.executionPlan)
    expect(executionPlan.executionStatus).toBe("not_executed")
    await expectMissing(marker)
    await expectNoAuthFile(home)
  })

  test("treats a non-executable grok command path as missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-adapter-nonexec-"))
    await writeRuntimeConfig(home)
    const bin = await mkdtemp(join(tmpdir(), "lfg-adapter-nonexec-bin-"))
    await writeFile(join(bin, "grok"), "#!/bin/sh\nexit 99\n", "utf8")
    process.env.PATH = bin

    const json = await codingToolAdapterVerifyJson(home, "grok", true)

    const availability = requireRecord(json.availability)
    expect(availability.status).toBe("missing_command")
    expect(availability.commandAvailable).toBe(false)
    expect(availability.commandPath).toBe(null)
    expect(availability.diagnostic).toMatchObject({
      code: "adapter_command_missing",
      hostAuth: { ownedBy: "grok", checked: false },
    })
    const executionPlan = requireRecord(json.executionPlan)
    expect(executionPlan.executionStatus).toBe("not_executed")
    await expectNoAuthFile(home)
  })
})

async function writeRuntimeConfig(home: string): Promise<void> {
  await mkdir(join(home, ".grok"), { recursive: true })
  await writeFile(join(home, ".grok", "lfg.json"), "{}\n", "utf8")
}

async function expectNoAuthFile(home: string): Promise<void> {
  await expectMissing(join(home, ".grok", "auth.json"))
}

async function expectMissing(path: string): Promise<boolean> {
  await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" })
  return true
}

async function writeFakeCommand(bin: string, command: string, marker: string): Promise<string> {
  const path = join(bin, command)
  await writeFile(path, `#!/bin/sh\necho unexpected-execution > "${marker}"\nexit 99\n`, "utf8")
  await chmod(path, 0o755)
  return path
}

function requireRecord(value: unknown): Record<string, unknown> {
  expect(isRecord(value)).toBe(true)
  if (isRecord(value)) {
    return value
  }
  throw new TypeError("expected JSON object")
}
