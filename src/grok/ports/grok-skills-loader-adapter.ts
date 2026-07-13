import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { userInfo } from "node:os"

import { createSharedSkillTemplateLoader, resolveSkillPathReferences, type BuiltinSkill } from "../../core/omo/skills-loader-core"

export type GrokSkillScope = "user" | "agents" | "project" | "plugin"

export interface GrokSkillRoot {
  readonly path: string
  readonly scope: GrokSkillScope
}

export interface DiscoverGrokSkillsInput {
  /**
   * Explicit skill roots. When omitted, uses defaultGrokSkillRoots(home):
   * ~/.grok/skills (user) → ~/.agents/skills (agents) → ~/.grok/plugins/lfg/skills (plugin).
   * First root wins on name collisions (duplicates dropped).
   */
  readonly roots?: readonly GrokSkillRoot[]
  /** Override home for default roots (tests). */
  readonly home?: string
}

export interface DiscoveredGrokSkill extends Omit<BuiltinSkill, "template"> {
  readonly scope: GrokSkillScope
  readonly sourcePath: string
  readonly rootPath: string
  readonly directoryName: string
  readonly template: string
}

export interface ResolveGrokSkillPathInput {
  readonly skillName: string
  readonly roots?: readonly GrokSkillRoot[]
  readonly home?: string
}

export interface ResolvedGrokSkillPath {
  readonly path: string
  readonly scope: GrokSkillScope
}

interface SkillFrontmatter {
  readonly name?: string
  readonly description?: string
}

/**
 * Default skill root priority (first wins on name collision):
 * 1. user   — ~/.grok/skills
 * 2. agents — ~/.agents/skills  (shared harness skills: 9router, cua-driver, …)
 * 3. plugin — ~/.grok/plugins/lfg/skills
 */
export function defaultGrokSkillRoots(home: string = userInfo().homedir): readonly GrokSkillRoot[] {
  return [
    { path: join(home, ".grok", "skills"), scope: "user" },
    { path: join(home, ".agents", "skills"), scope: "agents" },
    { path: join(home, ".grok", "plugins", "lfg", "skills"), scope: "plugin" },
  ]
}

/**
 * Discover skills from skill roots and load each SKILL.md through the OMO
 * explicit-root skill loader. Missing roots are ignored. Skills with the same
 * name (frontmatter name, else directory name) are deduped — earlier roots win.
 */
export function discoverGrokSkills(input: DiscoverGrokSkillsInput = {}): DiscoveredGrokSkill[] {
  const discovered: DiscoveredGrokSkill[] = []
  const seenNames = new Set<string>()

  for (const root of normalizeRoots(input.roots, input.home)) {
    if (!existsSync(root.path)) continue

    const loader = createSharedSkillTemplateLoader(readFileSync, root.path)
    const skillDirectories = readdirSync(root.path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith("."))
      .sort((a, b) => a.localeCompare(b))

    for (const directoryName of skillDirectories) {
      const sourcePath = join(root.path, directoryName, "SKILL.md")
      if (!existsSync(sourcePath)) continue

      const frontmatter = parseSkillFrontmatter(readFileSync(sourcePath, "utf-8"))
      const name = frontmatter.name ?? directoryName
      const dedupeKey = name.trim().toLowerCase()
      // Drop duplicates: higher-priority root already claimed this skill name.
      if (seenNames.has(dedupeKey)) continue
      seenNames.add(dedupeKey)

      const description = frontmatter.description ?? ""
      discovered.push({
        name,
        description,
        template: loader(directoryName),
        scope: root.scope,
        sourcePath,
        rootPath: root.path,
        directoryName,
      })
    }
  }

  return discovered
}

/** Resolve a skill name to its SKILL.md path across skill roots (first match wins). */
export function resolveGrokSkillPath(input: ResolveGrokSkillPathInput): ResolvedGrokSkillPath | undefined {
  for (const root of normalizeRoots(input.roots, input.home)) {
    const resolvedPath = resolveSkillPathReferences(`@${input.skillName}/SKILL.md`, root.path)
    if (resolvedPath.startsWith("@")) continue
    if (existsSync(resolvedPath)) {
      return { path: resolvedPath, scope: root.scope }
    }
  }

  return undefined
}

function normalizeRoots(
  roots: readonly GrokSkillRoot[] | undefined,
  home: string | undefined,
): readonly GrokSkillRoot[] {
  return roots ?? defaultGrokSkillRoots(home ?? userInfo().homedir)
}

function parseSkillFrontmatter(content: string): SkillFrontmatter {
  if (!content.startsWith("---\n")) return {}

  const endIndex = content.indexOf("\n---", 4)
  if (endIndex === -1) return {}

  const frontmatter = content.slice(4, endIndex)
  const parsed: Record<string, string> = {}
  for (const line of frontmatter.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":")
    if (separatorIndex === -1) continue
    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    if (key === "name" || key === "description") {
      parsed[key] = unquoteYamlScalar(value)
    }
  }

  return {
    name: parsed.name,
    description: parsed.description,
  }
}

function unquoteYamlScalar(value: string): string {
  if (value.length < 2) return value
  const first = value[0]
  const last = value[value.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1)
  }
  return value
}
