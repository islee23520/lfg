import { execFile } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { afterEach, describe, expect, test } from "vitest"

const execFileAsync = promisify(execFile)
const ROOT = fileURLToPath(new URL("../..", import.meta.url))
const disposableRoots: string[] = []
const parityFixturePaths = [
  "AGENTS.md",
  "docs/grok-adapter-parity.md",
  "scripts/build.mjs",
  "src/grok/payload/component-inventory.ts",
  "src/grok/skills",
  "skills",
  "dist/grok-install/skills",
] as const

afterEach(async () => {
  await Promise.all(disposableRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("scripts/assert-omo-parity.mjs", { timeout: 15_000 }, () => {
  test("passes against the generated OMO parity payload", async () => {
    const { stdout } = await execFileAsync("node", [join(ROOT, "scripts", "assert-omo-parity.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
    })

    expect(stdout).toContain("assert-omo-parity: ok upstream 4.16.3")
    expect(stdout).toContain("skills=25")
    expect(stdout).toContain("roots=3")
  })

  test("pins payload, docs, inventory, and build-cache guard checks", async () => {
    const script = await readFile(join(ROOT, "scripts", "assert-omo-parity.mjs"), "utf8")

    expect(script).toContain('"src/grok/skills"')
    expect(script).toContain('"dist/grok-install/skills"')
    expect(script).toContain('"teammode"')
    expect(script).toContain('"lazycodex-executor-verify"')
    expect(script).toContain('"converted:lfg-doctor"')
    expect(script).toContain("syncOmoSkillsToGrok({ allowExistingFallback: true, includeCache: false })")
    expect(script).toContain("checkOmoParityUpkeep")
    expect(script).toContain("UPSTREAM_OMO_VERSION")
  })

  test.each([
    {
      name: "start-work loses the handoff planner command",
      expectedFailure: 'skills/start-work/SKILL.md: missing "lfg --json handoff plan"',
      mutate: async (root: string) => {
        const path = join(root, "skills", "start-work", "SKILL.md")
        const content = await readFile(path, "utf8")
        await writeFile(path, content.replaceAll("lfg --json handoff plan", "lfg --json handoff prepare"), "utf8")
      },
    },
  ])("fails with useful output when $name", async ({ expectedFailure, mutate }) => {
    const root = await createDisposableParityRoot()
    await mutate(root)

    await expect(
      execFileAsync("node", [join(ROOT, "scripts", "assert-omo-parity.mjs")], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, LFG_OMO_PARITY_REPO_ROOT: root },
      }),
    ).rejects.toMatchObject({
      code: 2,
      stderr: expect.stringContaining(expectedFailure),
    })
  })

  test("rejects duplicated launch binaries in every generated skill root", async () => {
    const root = await createDisposableParityRoot()
    const duplicatedBinaryWording =
      "Execute `handoff.launch.binary` with `handoff.launch.argv`; `launch.binary` is identity/readiness metadata."
    const generatedSkillRoots = ["skills", "src/grok/skills", "dist/grok-install/skills"] as const

    for (const skillRoot of generatedSkillRoots) {
      for (const relativePath of ["start-work/SKILL.md", "ulw-loop/references/full-workflow.md"] as const) {
        const path = join(root, skillRoot, relativePath)
        const content = await readFile(path, "utf8")
        await writeFile(path, `${content}\n${duplicatedBinaryWording}\n`, "utf8")
      }
    }

    const parityError = await execFileAsync("node", [join(ROOT, "scripts", "assert-omo-parity.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, LFG_OMO_PARITY_REPO_ROOT: root },
    }).then(
      () => new Error("expected assert-omo-parity to reject duplicated launch binaries"),
      (error: unknown) => error,
    )

    expect(parityError).toMatchObject({ code: 2 })
    for (const skillRoot of generatedSkillRoots) {
      for (const relativePath of ["start-work/SKILL.md", "ulw-loop/references/full-workflow.md"] as const) {
        expect(parityError).toMatchObject({
          stderr: expect.stringContaining(
            `${skillRoot}/${relativePath}: contains duplicated launch-binary wording "Execute \`handoff.launch.binary\` with \`handoff.launch.argv\`"`,
          ),
        })
      }
    }
  })

  test("rejects conflicting unconditional spawned-subagent mandates in every generated workflow", async () => {
    const root = await createDisposableParityRoot()
    const conflictingWorkerMandate =
      "Every implementation, test, and QA unit must be a spawned subagent."
    const generatedSkillRoots = ["skills", "src/grok/skills", "dist/grok-install/skills"] as const

    for (const skillRoot of generatedSkillRoots) {
      for (const relativePath of ["start-work/SKILL.md", "ulw-loop/references/full-workflow.md"] as const) {
        const path = join(root, skillRoot, relativePath)
        const content = await readFile(path, "utf8")
        await writeFile(path, `${content}\n${conflictingWorkerMandate}\n`, "utf8")
      }
    }

    const parityError = await execFileAsync("node", [join(ROOT, "scripts", "assert-omo-parity.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, LFG_OMO_PARITY_REPO_ROOT: root },
    }).then(
      () => new Error("expected assert-omo-parity to reject dual worker transports"),
      (error: unknown) => error,
    )

    expect(parityError).toMatchObject({ code: 2 })
    for (const skillRoot of generatedSkillRoots) {
      for (const relativePath of ["start-work/SKILL.md", "ulw-loop/references/full-workflow.md"] as const) {
        expect(parityError).toMatchObject({
          stderr: expect.stringContaining(
            `${skillRoot}/${relativePath}: contains conflicting unconditional spawned-subagent mandate`,
          ),
        })
      }
    }
  })

  test("rejects unconditional DELEGATE-IN-PARALLEL spawn mandates in every generated workflow", async () => {
    const root = await createDisposableParityRoot()
    const conflictingWorkerMandate =
      "3. DELEGATE-IN-PARALLEL: dispatch every independent task in the wave at once via right-sized `multi_agent_v1.spawn_agent` workers (Delegation table)."
    const generatedSkillRoots = ["skills", "src/grok/skills", "dist/grok-install/skills"] as const

    for (const skillRoot of generatedSkillRoots) {
      for (const relativePath of ["start-work/SKILL.md", "ulw-loop/references/full-workflow.md"] as const) {
        const path = join(root, skillRoot, relativePath)
        const content = await readFile(path, "utf8")
        await writeFile(path, `${content}\n${conflictingWorkerMandate}\n`, "utf8")
      }
    }

    const parityError = await execFileAsync("node", [join(ROOT, "scripts", "assert-omo-parity.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, LFG_OMO_PARITY_REPO_ROOT: root },
    }).then(
      () => new Error("expected assert-omo-parity to reject unconditional DELEGATE-IN-PARALLEL spawning"),
      (error: unknown) => error,
    )

    expect(parityError).toMatchObject({ code: 2 })
    for (const skillRoot of generatedSkillRoots) {
      for (const relativePath of ["start-work/SKILL.md", "ulw-loop/references/full-workflow.md"] as const) {
        expect(parityError).toMatchObject({
          stderr: expect.stringContaining(
            `${skillRoot}/${relativePath}: contains conflicting unconditional spawned-subagent mandate`,
          ),
        })
      }
    }
  })

  test("rejects unconditional ALL-sub-task spawn bursts in every generated workflow", async () => {
    const root = await createDisposableParityRoot()
    const conflictingWorkerMandate =
      "6. **DELEGATE EVERYTHING. YOU NEVER IMPLEMENT.** Dispatch ALL independent sub-tasks across those checkboxes in one parallel `multi_agent_v1.spawn_agent` burst; serialize only named dependencies. Verification and checkbox marking stay per-checkbox."
    const generatedSkillRoots = ["skills", "src/grok/skills", "dist/grok-install/skills"] as const

    for (const skillRoot of generatedSkillRoots) {
      for (const relativePath of ["start-work/SKILL.md", "ulw-loop/references/full-workflow.md"] as const) {
        const path = join(root, skillRoot, relativePath)
        const content = await readFile(path, "utf8")
        await writeFile(path, `${content}\n${conflictingWorkerMandate}\n`, "utf8")
      }
    }

    const parityError = await execFileAsync("node", [join(ROOT, "scripts", "assert-omo-parity.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, LFG_OMO_PARITY_REPO_ROOT: root },
    }).then(
      () => new Error("expected assert-omo-parity to reject an unconditional ALL-sub-task spawn burst"),
      (error: unknown) => error,
    )

    expect(parityError).toMatchObject({ code: 2 })
    for (const skillRoot of generatedSkillRoots) {
      for (const relativePath of ["start-work/SKILL.md", "ulw-loop/references/full-workflow.md"] as const) {
        expect(parityError).toMatchObject({
          stderr: expect.stringContaining(
            `${skillRoot}/${relativePath}: contains conflicting unconditional spawned-subagent mandate`,
          ),
        })
      }
    }
  })

  test("rejects unconditional spawn-worker imperatives in every generated workflow", async () => {
    const root = await createDisposableParityRoot()
    const conflictingWorkerImperative = [
      "STOP. SPAWN A WORKER INSTEAD.",
      "You MUST spawn a subagent.",
      "ALWAYS spawn the worker.",
    ].join("\n")
    const generatedSkillRoots = ["skills", "src/grok/skills", "dist/grok-install/skills"] as const

    for (const skillRoot of generatedSkillRoots) {
      for (const relativePath of ["start-work/SKILL.md", "ulw-loop/references/full-workflow.md"] as const) {
        const path = join(root, skillRoot, relativePath)
        const content = await readFile(path, "utf8")
        await writeFile(path, `${content}\n${conflictingWorkerImperative}\n`, "utf8")
      }
    }

    const parityError = await execFileAsync("node", [join(ROOT, "scripts", "assert-omo-parity.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, LFG_OMO_PARITY_REPO_ROOT: root },
    }).then(
      () => new Error("expected assert-omo-parity to reject an unconditional spawn-worker imperative"),
      (error: unknown) => error,
    )

    expect(parityError).toMatchObject({ code: 2 })
    for (const skillRoot of generatedSkillRoots) {
      for (const relativePath of ["start-work/SKILL.md", "ulw-loop/references/full-workflow.md"] as const) {
        expect(parityError).toMatchObject({
          stderr: expect.stringContaining(
            `${skillRoot}/${relativePath}: contains conflicting unconditional spawned-subagent mandate`,
          ),
        })
      }
    }
  })

  test("accepts negated and conditional spawn-worker guidance in every generated workflow", async () => {
    const root = await createDisposableParityRoot()
    const allowedWorkerGuidance = [
      "Do not spawn a worker.",
      "If the in-host lane is selected, spawn a worker.",
    ].join("\n")
    const generatedSkillRoots = ["skills", "src/grok/skills", "dist/grok-install/skills"] as const

    for (const skillRoot of generatedSkillRoots) {
      for (const relativePath of ["start-work/SKILL.md", "ulw-loop/references/full-workflow.md"] as const) {
        const path = join(root, skillRoot, relativePath)
        const content = await readFile(path, "utf8")
        await writeFile(path, `${content}\n${allowedWorkerGuidance}\n`, "utf8")
      }
    }

    const { stdout } = await execFileAsync("node", [join(ROOT, "scripts", "assert-omo-parity.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, LFG_OMO_PARITY_REPO_ROOT: root },
    })

    expect(stdout).toContain("assert-omo-parity: ok upstream 4.16.3")
  })
})

async function createDisposableParityRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "lfg-omo-parity-negative-"))
  disposableRoots.push(root)
  for (const relativePath of parityFixturePaths) {
    const destination = join(root, relativePath)
    await mkdir(dirname(destination), { recursive: true })
    await cp(join(ROOT, relativePath), destination, { recursive: true })
  }
  return root
}
