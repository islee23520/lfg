import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, test, afterEach } from "vitest"

const execFileAsync = promisify(execFile)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const TEAM_MJS = join(ROOT, "skills/teammode/scripts/team.mjs")
const AGENTS_MJS = join(ROOT, "skills/teammode/scripts/team-agents.mjs")

describe("teammode spawn_subagent transport (GrokBuild)", () => {
  let home: string

  afterEach(async () => {
    if (home) await rm(home, { recursive: true, force: true }).catch(() => {})
  })

  test("resolves GrokBuild built-ins and lfg OMO agents (and aliases)", async () => {
    const mod = await import(AGENTS_MJS)
    expect(mod.resolveTeamSubagentType("explore")).toBe("explore")
    expect(mod.resolveTeamSubagentType("explorer")).toBe("explorer")
    expect(mod.resolveTeamSubagentType("general-purpose")).toBe("general-purpose")
    expect(mod.resolveTeamSubagentType("hephaestus")).toBe("hephaestus")
    expect(mod.resolveTeamSubagentType("coding")).toBe("coding")
    expect(mod.resolveTeamSubagentType("search")).toBe("explore")
    expect(mod.resolveTeamSubagentType("impl")).toBe("coding")
    expect(mod.resolveTeamSubagentType("qa")).toBe("reviewer")
    expect(mod.resolveTeamSubagentType("")).toBe("hephaestus")
    expect(() => mod.resolveTeamSubagentType("not-a-real-agent")).toThrow(/invalid subagent_type/)
  })

  test("init + add-member with builtin explore and lfg coding + bind-subagent", async () => {
    home = await mkdtemp(join(tmpdir(), "lfg-teammode-spawn-"))
    const init = await execFileAsync("node", [TEAM_MJS, "init", "--name", "mix", "--session-name", "s", "--transport", "spawn_subagent"], {
      cwd: home,
      encoding: "utf8",
    })
    expect(init.stdout).toContain("transport: spawn_subagent")
    expect(init.stdout).toMatch(/GrokBuild built-ins/)
    expect(init.stdout).toMatch(/lfg OMO/)

    const sid = /session id: (\S+)/.exec(init.stdout)?.[1]
    expect(sid).toBeTruthy()

    await execFileAsync(
      "node",
      [
        TEAM_MJS,
        "add-member",
        "--team",
        sid!,
        "--id",
        "A",
        "--name",
        "impl",
        "--subagent-type",
        "coding",
        "--focus",
        "src/api",
        "--lens",
        "area",
        "--deliverable",
        "api",
      ],
      { cwd: home, encoding: "utf8" },
    )
    const addB = await execFileAsync(
      "node",
      [
        TEAM_MJS,
        "add-member",
        "--team",
        sid!,
        "--id",
        "B",
        "--name",
        "search",
        "--subagent-type",
        "explore",
        "--focus",
        "call graph",
        "--lens",
        "perspective",
        "--deliverable",
        "map",
      ],
      { cwd: home, encoding: "utf8" },
    )
    expect(addB.stdout).toContain('subagent_type: "explore"')
    expect(addB.stdout).toContain("spawn_subagent")

    await execFileAsync("node", [TEAM_MJS, "bind-subagent", "--team", sid!, "--id", "A", "--subagent-id", "sa-coding-1"], {
      cwd: home,
      encoding: "utf8",
    })
    await execFileAsync("node", [TEAM_MJS, "bind-subagent", "--team", sid!, "--id", "B", "--subagent-id", "sa-explore-1"], {
      cwd: home,
      encoding: "utf8",
    })

    const teamJson = JSON.parse(await readFile(join(home, ".omo/teams", sid!, "team.json"), "utf8"))
    expect(teamJson.transport).toBe("spawn_subagent")
    expect(teamJson.members).toHaveLength(2)
    expect(teamJson.members[0].subagentType).toBe("coding")
    expect(teamJson.members[0].subagentId).toBe("sa-coding-1")
    expect(teamJson.members[1].subagentType).toBe("explore")
    expect(teamJson.members[1].subagentId).toBe("sa-explore-1")

    const guide = await readFile(join(home, ".omo/teams", sid!, "guide.md"), "utf8")
    expect(guide).toContain("GrokBuild spawn_subagent")
    expect(guide).toContain("coding")
    expect(guide).toContain("explore")
  })
})
