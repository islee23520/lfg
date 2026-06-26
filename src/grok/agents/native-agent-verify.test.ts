import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { NATIVE_HEPHAESTUS_MARKER, NATIVE_OMO_AGENT_NAMES } from "./native-omo-agents"
import { verifyNativeOmoAgents } from "./native-agent-verify"

const tempHomes: string[] = []

afterEach(async () => {
  await Promise.all(tempHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

describe("verifyNativeOmoAgents", () => {
  test("reports missing when any required native prompt is absent", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-native-agents-"))
    tempHomes.push(home)
    const pluginRoot = join(home, ".grok", "plugins", "lfg")

    await seedNativeAgents(home, pluginRoot, { skipPrompt: "atlas" })

    const result = await verifyNativeOmoAgents(pluginRoot, home)

    expect(result.status).toBe("missing")
    expect(result.pluginAgents).toEqual([...NATIVE_OMO_AGENT_NAMES])
    expect(result.roles).toEqual([...NATIVE_OMO_AGENT_NAMES])
    expect(result.prompts).not.toContain("atlas")
  })
})

async function seedNativeAgents(
  home: string,
  pluginRoot: string,
  options: { readonly skipPrompt: string },
): Promise<void> {
  await mkdir(join(pluginRoot, "agents"), { recursive: true })
  await mkdir(join(home, ".grok", "roles"), { recursive: true })
  await mkdir(join(home, ".grok", "prompts", "omo"), { recursive: true })

  for (const name of NATIVE_OMO_AGENT_NAMES) {
    const marker = name === "default" ? `${NATIVE_HEPHAESTUS_MARKER}\n` : ""
    await writeFile(join(pluginRoot, "agents", `${name}.md`), `${marker}${name} agent\n`, "utf8")
    await writeFile(join(home, ".grok", "roles", `${name}.toml`), `name = "${name}"\n`, "utf8")
    if (name !== options.skipPrompt) {
      await writeFile(join(home, ".grok", "prompts", "omo", `${name}.md`), `${marker}${name} prompt\n`, "utf8")
    }
  }
}
