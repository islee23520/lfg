import { access, cp, mkdir, readFile, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const OMO_MANAGED_SKILLS = [
  "ast-grep",
  "comment-checker",
  "debugging",
  "frontend",
  "git-master",
  "init-deep",
  "lfg-contribute-bug-fix",
  "lfg-doctor",
  "lfg-report-bug",
  "lsp",
  "lsp-setup",
  "programming",
  "refactor",
  "remove-ai-slops",
  "review-work",
  "rules",
  "ulw-plan",
  "ulw-loop",
  "start-work",
  "ultraresearch",
  "visual-qa",
] as const
const RETIRED_OMO_SKILL_NAMES = ["lcx-contribute-bug-fix", "lcx-doctor", "lcx-report-bug"] as const

export async function ensureUlwWorkflowSkills(pluginRoot: string): Promise<{ readonly ensured: boolean; readonly paths: string[] }> {
  const ensuredPaths: string[] = []
  let anyEnsured = false

  const manifest = await resolveBundledSkillSyncManifest()
  if (manifest) {
    await mkdir(join(pluginRoot, "skills"), { recursive: true })
    await cp(manifest, join(pluginRoot, "skills", ".lfg-omo-skill-sync.json"), { force: true })
    ensuredPaths.push(join(pluginRoot, "skills", ".lfg-omo-skill-sync.json"))
  }

  for (const skill of RETIRED_OMO_SKILL_NAMES) {
    await rm(join(pluginRoot, "skills", skill), { recursive: true, force: true })
  }

  for (const skill of OMO_MANAGED_SKILLS) {
    const targetDir = join(pluginRoot, "skills", skill)
    const targetFile = join(targetDir, "SKILL.md")
    const bundled = await resolveBundledSkillDir(skill)
    if (!bundled) continue

    await rm(targetDir, { recursive: true, force: true })
    await mkdir(targetDir, { recursive: true })
    await cp(bundled, targetDir, { recursive: true, force: true })
    anyEnsured = true
    ensuredPaths.push(targetFile)
  }

  return { ensured: anyEnsured, paths: ensuredPaths }
}

async function resolveBundledSkillDir(skillName: string): Promise<string | null> {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    // dist layout
    join(here, "grok-install", "skills", skillName),
    join(here, "..", "grok-install", "skills", skillName),
    // source tree
    join(here, "skills", skillName),
    join(here, "..", "skills", skillName),
    // published package root
    join(here, "..", "..", "skills", skillName),
  ]
  for (const p of candidates) {
    try {
      await access(join(p, "SKILL.md"))
      return p
    } catch {
      // keep looking
    }
  }
  return null
}

async function resolveBundledSkillSyncManifest(): Promise<string | null> {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, "grok-install", "skills", ".lfg-omo-skill-sync.json"),
    join(here, "..", "grok-install", "skills", ".lfg-omo-skill-sync.json"),
    join(here, "skills", ".lfg-omo-skill-sync.json"),
    join(here, "..", "skills", ".lfg-omo-skill-sync.json"),
    join(here, "..", "..", "skills", ".lfg-omo-skill-sync.json"),
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
  const dir = await resolveBundledSkillDir("cua-driver")
  return dir ? join(dir, "SKILL.md") : null
}
