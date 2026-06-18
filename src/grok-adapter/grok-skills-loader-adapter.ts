import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { userInfo } from "node:os"

import { createSharedSkillTemplateLoader, resolveSkillPathReferences, type BuiltinSkill } from "./skills-loader-core-vendored"

export type GrokSkillScope = "user" | "project" | "plugin"

export interface GrokSkillRoot {
  readonly path: string
  readonly scope: GrokSkillScope
}

export interface DiscoverGrokSkillsInput {
  /** Explicit Grok skill roots, e.g. ~/.grok/skills or ~/.grok/plugins/lfg/skills. */
  readonly roots?: readonly GrokSkillRoot[]
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
 * Discover Grok skills from explicit skill roots and load each SKILL.md through
 * the vendored explicit-root skill loader. Missing roots are ignored so callers
 * can pass the standard user/plugin/project roots without pre-checking them.
 */
export function discoverGrokSkills(input: DiscoverGrokSkillsInput = {}): DiscoveredGrokSkill[] {
  const discovered: DiscoveredGrokSkill[] = []

  for (const root of normalizeRoots(input.roots)) {
    if (!existsSync(root.path)) continue

    const loader = createSharedSkillTemplateLoader(readFileSync, root.path)
    const skillDirectories = readdirSync(root.path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))

    for (const directoryName of skillDirectories) {
      const sourcePath = join(root.path, directoryName, "SKILL.md")
      if (!existsSync(sourcePath)) continue

      const frontmatter = parseSkillFrontmatter(readFileSync(sourcePath, "utf-8"))
      const name = frontmatter.name ?? directoryName
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

/** Resolve a Grok skill name to its SKILL.md path across Grok skill roots. */
export function resolveGrokSkillPath(input: ResolveGrokSkillPathInput): ResolvedGrokSkillPath | undefined {
  for (const root of normalizeRoots(input.roots)) {
    const resolvedPath = resolveSkillPathReferences(`@${input.skillName}/SKILL.md`, root.path)
    if (resolvedPath.startsWith("@")) continue
    if (existsSync(resolvedPath)) {
      return { path: resolvedPath, scope: root.scope }
    }
  }

  return undefined
}

function normalizeRoots(roots: readonly GrokSkillRoot[] | undefined): readonly GrokSkillRoot[] {
  return roots ?? [{ path: join(userInfo().homedir, ".grok", "skills"), scope: "user" }]
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
