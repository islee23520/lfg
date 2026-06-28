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
    // Given: an installed lfg plugin and runtime config, but no grok command on PATH.
    const home = await mkdtemp(join(tmpdir(), "lfg-adapter-grok-missing-"))
    await writeRuntimeConfig(home)
    process.env.PATH = ""

    // When: the selected Grok adapter availability is verified.
    const json = await codingToolAdapterVerifyJson(home, "grok", true)

    // Then: diagnostics identify the missing host command without executing it or checking Grok auth.
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
    // Given: the plugin tree is absent and runtime config has not been materialized.
    const home = await mkdtemp(join(tmpdir(), "lfg-adapter-config-missing-"))
    process.env.PATH = ""

    // When: pi-agent adapter availability is verified.
    const json = await codingToolAdapterVerifyJson(home, "pi-agent", false)

    // Then: diagnostics point at setup/config repair instead of suggesting adapter execution.
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

  test("reports available diagnostic when command and config are present", async () => {
    // Given: runtime config is present and pi-agent can be resolved from PATH.
    const home = await mkdtemp(join(tmpdir(), "lfg-adapter-available-"))
    await writeRuntimeConfig(home)
    const bin = await mkdtemp(join(tmpdir(), "lfg-adapter-bin-"))
    const marker = join(home, "pi-agent-executed.marker")
    const piAgent = await writeFakeCommand(bin, "pi-agent", marker)
    process.env.PATH = bin

    // When: pi-agent adapter availability is verified.
    const json = await codingToolAdapterVerifyJson(home, "pi-agent", true)

    // Then: diagnostics report availability while preserving the not-executed plan.
    const availability = requireRecord(json.availability)
    expect(availability.status).toBe("available")
    expect(availability.diagnostic).toMatchObject({
      code: "adapter_available",
      message: expect.stringContaining("pi-agent"),
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

  test("treats a non-executable command path as missing", async () => {
    // Given: pi-agent exists on PATH but is not executable.
    const home = await mkdtemp(join(tmpdir(), "lfg-adapter-nonexec-"))
    await writeRuntimeConfig(home)
    const bin = await mkdtemp(join(tmpdir(), "lfg-adapter-nonexec-bin-"))
    await writeFile(join(bin, "pi-agent"), "#!/bin/sh\nexit 99\n", "utf8")
    process.env.PATH = bin

    // When: pi-agent adapter availability is verified.
    const json = await codingToolAdapterVerifyJson(home, "pi-agent", true)

    // Then: diagnostics fail closed before any adapter execution can be attempted.
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

async function expectMissing(path: string): Promise<void> {
  await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" })
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
