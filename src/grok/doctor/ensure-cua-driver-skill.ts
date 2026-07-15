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

/**
 * lfg-owned skills shipped with the package (not OMO upstream managed list).
 * Always materialised into ~/.grok/plugins/lfg/skills on setup so they are
 * Grok-discoverable without a separate install step.
 */
export const LFG_NATIVE_SKILLS = ["claude-code-inventory", "eval"] as const

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

  const native = await ensureLfgNativeSkills(pluginRoot)
  if (native.ensured) anyEnsured = true
  ensuredPaths.push(...native.paths)

  return { ensured: anyEnsured, paths: ensuredPaths }
}

/** Always install/refresh lfg-native skills (e.g. claude-code-inventory) into the plugin skill tree. */
export async function ensureLfgNativeSkills(pluginRoot: string): Promise<{ readonly ensured: boolean; readonly paths: string[] }> {
  const ensuredPaths: string[] = []
  let anyEnsured = false
  for (const skill of LFG_NATIVE_SKILLS) {
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
  // Also seed Claude Code's own skills dir so Claude sessions can load the same skill.
  const claudeSeed = await ensureClaudeHomeLfgBridgeSkill()
  if (claudeSeed.ensured) {
    anyEnsured = true
    ensuredPaths.push(claudeSeed.path)
  }
  return { ensured: anyEnsured, paths: ensuredPaths }
}

/**
 * Copy claude-code-inventory into ~/.claude/skills so Claude Code can discover
 * the bridge/memory docs without a separate Claude-side install.
 */
export async function ensureClaudeHomeLfgBridgeSkill(
  homeDir: string = process.env.HOME ?? "",
): Promise<{ readonly ensured: boolean; readonly path: string }> {
  const claudeHome = process.env.CLAUDE_HOME?.trim() || process.env.CLAUDE_CONFIG_DIR?.trim() || join(homeDir || process.env.HOME || "", ".claude")
  const targetDir = join(claudeHome, "skills", "claude-code-inventory")
  const targetFile = join(targetDir, "SKILL.md")
  const bundled = await resolveBundledSkillDir("claude-code-inventory")
  if (!bundled) return { ensured: false, path: targetFile }
  try {
    await mkdir(join(claudeHome, "skills"), { recursive: true })
    await rm(targetDir, { recursive: true, force: true })
    await mkdir(targetDir, { recursive: true })
    await cp(bundled, targetDir, { recursive: true, force: true })
    return { ensured: true, path: targetFile }
  } catch {
    return { ensured: false, path: targetFile }
  }
}

export async function resolveBundledSkillDir(skillName: string): Promise<string | null> {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    // dist layout (bundled entry: dist/lfg.js → dist/grok-install/skills)
    join(here, "grok-install", "skills", skillName),
    join(here, "..", "grok-install", "skills", skillName),
    // source tree: src/grok/doctor → src/grok/skills
    join(here, "skills", skillName),
    join(here, "..", "skills", skillName),
    // published package root skills/ (npx package)
    join(here, "..", "..", "skills", skillName),
    join(here, "..", "..", "..", "skills", skillName),
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
