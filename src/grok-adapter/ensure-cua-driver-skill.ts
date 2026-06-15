import { access, cp, mkdir, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Ensures ulw-plan and ulw-loop skills (T8) are present with self-contained
 * workflow headings. Mirrors ensureCuaDriverSkill pattern for discoverability
 * in Grok skill surface without references/full-workflow.md guessing.
 * Uses source-of-truth SKILL.md in grok-install/skills/ + top-level skills/.
 */
export async function ensureUlwWorkflowSkills(pluginRoot: string): Promise<{ readonly ensured: boolean; readonly paths: string[] }> {
  const skills = ["ulw-plan", "ulw-loop"]
  const ensuredPaths: string[] = []
  let anyEnsured = false

  for (const skill of skills) {
    const targetDir = join(pluginRoot, "skills", skill)
    const targetFile = join(targetDir, "SKILL.md")
    const bundled = await resolveBundledSkill(skill)
    if (!bundled) continue

    let need = false
    try {
      await access(targetFile)
      const existing = await readFile(targetFile, "utf8")
      if (existing.length < 100 || /placeholder|TODO|stub|omits all/i.test(existing)) {
        need = true
      }
    } catch {
      need = true
    }

    if (need) {
      await mkdir(targetDir, { recursive: true })
      await cp(bundled, targetFile, { force: true })
      anyEnsured = true
    }
    ensuredPaths.push(targetFile)
  }

  return { ensured: anyEnsured, paths: ensuredPaths }
}

/**
 * Resolve bundled SKILL.md for ulw-plan or ulw-loop (mirrors cua-driver resolver).
 */
async function resolveBundledSkill(skillName: string): Promise<string | null> {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    // dist layout
    join(here, "grok-install", "skills", skillName, "SKILL.md"),
    join(here, "..", "grok-install", "skills", skillName, "SKILL.md"),
    // source tree
    join(here, "skills", skillName, "SKILL.md"),
    join(here, "..", "skills", skillName, "SKILL.md"),
    // published package root
    join(here, "..", "..", "skills", skillName, "SKILL.md"),
  ]
  for (const p of candidates) {
    try {
      await access(p)
      return p
    } catch {
      // keep looking
    }
  }
  return null
}

/**
 * Ensures the cua-driver (Computer Use) skill is present under the materialized
 * ~/.grok/skills/cua-driver after LFG Grok install.
 *
 * This is what makes "Codex-style Computer Use" (native macOS app automation
 * via cua-driver) available to agents/personas when the user does
 * `npx @islee23520/lfg setup`.
 *
 * The skill is shipped inside the LFG package (in grok-install/skills and
 * also exposed at the package skills/ level). After materialization we
 * inject/repair it into the real owned directory so Grok Build's skill
 * surfaces see it under the lfg adapter.
 */

export async function ensureCuaDriverSkill(pluginRoot: string): Promise<{ readonly ensured: boolean; readonly path: string }> {
  const targetDir = join(pluginRoot, "skills", "cua-driver")
  const targetFile = join(targetDir, "SKILL.md")

  const bundled = await resolveBundledCuaDriverSkill()
  if (!bundled) {
    return { ensured: false, path: targetFile }
  }

  let need = false
  try {
    await access(targetFile)
    const existing = await readFile(targetFile, "utf8")
    if (existing.length < 300 || /placeholder|TODO|stub|TODO: implement/i.test(existing)) {
      need = true
    }
  } catch {
    need = true
  }

  if (!need) {
    return { ensured: false, path: targetFile }
  }

  await mkdir(targetDir, { recursive: true })
  await cp(bundled, targetFile, { force: true })

  return { ensured: true, path: targetFile }
}

/** Legacy alias for cua-driver resolver (kept for compatibility; calls shared impl). */
export async function resolveBundledCuaDriverSkill(): Promise<string | null> {
  return resolveBundledSkill("cua-driver")
}
