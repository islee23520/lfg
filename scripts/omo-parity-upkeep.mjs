#!/usr/bin/env node
import { access, readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { managedSkillSources } from "./sync-omo-skills-to-grok.mjs"

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const knownStatusVocabulary = new Set(["Implemented", "Grok-adapted", "Manifest-only", "Remote URL manifest-only", "Unsupported", "Deferred"])
const generatedSkillRoots = ["src/grok/skills", "skills", "dist/grok-install/skills"]
const convertedSkillNames = new Set(["lfg-contribute-bug-fix", "lfg-doctor", "lfg-report-bug"])
const knownUpstreamSkillAliases = new Map([
  ["lcx-contribute-bug-fix", "lfg-contribute-bug-fix"],
  ["lcx-doctor", "lfg-doctor"],
  ["lcx-report-bug", "lfg-report-bug"],
])
const knownComponentAliases = new Map([
  ["ast-grep", "ast_grep"],
  ["git_bash", "git-bash"],
])
const hookCommandComponentPattern = /(?:^|[\s"'])(?:components|\.\/components)\/([^/\s"']+)\//g

export async function checkOmoParityUpkeep(options = {}) {
  const sourceRoot = await resolveSourceRoot(options.source)
  const local = await readLocalParityState(options.repoRoot ?? repoRoot)
  const upstream = sourceRoot === null ? null : await scanUpstreamOmoSource(sourceRoot)
  const findings = []

  validateLocalState(local, findings)
  if (upstream !== null) {
    compareUpstreamToLocal(upstream, local, findings)
  }

  const report = {
    generatedBy: "scripts/omo-parity-upkeep.mjs",
    sourceRoot,
    upstream: upstream?.summary ?? null,
    local: local.summary,
    findings,
    ok: findings.length === 0,
  }

  if (options.writeReport) {
    await writeFile(resolve(options.writeReport), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  }

  return report
}

export async function scanUpstreamOmoSource(sourceRoot) {
  const normalizedRoot = resolve(sourceRoot)
  const packageJson = await readJsonSafe(join(normalizedRoot, "package.json"))
  const skills = await scanSkills(normalizedRoot)
  const components = await scanComponents(normalizedRoot)
  const hooks = await scanHooks(normalizedRoot)
  const packages = await scanPackages(normalizedRoot)

  return {
    root: normalizedRoot,
    packageName: packageJson?.name ?? null,
    packageVersion: packageJson?.version ?? null,
    skills,
    components,
    hooks,
    packages,
    summary: {
      packageName: packageJson?.name ?? null,
      packageVersion: packageJson?.version ?? null,
      skills: skills.length,
      components: components.length,
      hooks: hooks.length,
      packages: packages.length,
    },
  }
}

async function readLocalParityState(root) {
  const componentInventoryModule = await import(pathToFileURL(join(root, "src", "grok", "payload", "component-inventory.ts")).href).catch(async () => null)
  let componentInventory = componentInventoryModule?.COMPONENTS
  if (!Array.isArray(componentInventory)) {
    const source = await readFile(join(root, "src", "grok", "payload", "component-inventory.ts"), "utf8")
    componentInventory = [...source.matchAll(/\{ id: "([^"]+)", status: "([^"]+)"/g)].map((match) => ({ id: match[1], status: match[2] }))
  }

  const managedSkills = managedSkillSources.map(([skillName]) => skillName)
  const installedSkills = new Set()
  for (const skillRoot of generatedSkillRoots) {
    for (const skillName of await listDirectories(join(root, skillRoot))) {
      if (!skillName.startsWith(".")) installedSkills.add(skillName)
    }
  }

  return {
    managedSkills: new Set(managedSkills),
    installedSkills,
    components: new Map(componentInventory.map((component) => [component.id, component.status])),
    summary: {
      managedSkills: managedSkills.length,
      installedSkills: installedSkills.size,
      components: componentInventory.length,
      generatedSkillRoots: generatedSkillRoots.length,
    },
  }
}

function validateLocalState(local, findings) {
  for (const skillName of local.managedSkills) {
    if (!local.installedSkills.has(skillName)) {
      findings.push(finding("missing-local-skill", skillName, `Managed skill ${skillName} is not present in generated Grok skill roots.`))
    }
  }
  for (const [componentId, status] of local.components) {
    if (!knownStatusVocabulary.has(status)) {
      findings.push(finding("invalid-status", componentId, `Component ${componentId} uses unsupported status ${JSON.stringify(status)}.`))
    }
  }
}

function compareUpstreamToLocal(upstream, local, findings) {
  for (const skill of upstream.skills) {
    const normalizedName = knownUpstreamSkillAliases.get(skill.name) ?? skill.name
    if (local.managedSkills.has(normalizedName) || local.installedSkills.has(normalizedName) || convertedSkillNames.has(normalizedName)) continue
    findings.push(finding("unclassified-upstream-skill", skill.name, `Upstream skill ${skill.name} at ${skill.relativePath} is not managed, installed, or explicitly converted by lfg.`))
  }

  for (const component of upstream.components) {
    const normalizedId = knownComponentAliases.get(component.id) ?? component.id
    if (local.components.has(normalizedId)) continue
    findings.push(finding("unclassified-upstream-component", component.id, `Upstream component ${component.id} at ${component.relativePath} has no lfg-component-inventory status.`))
  }

  for (const hook of upstream.hooks) {
    for (const componentId of hook.components) {
      const normalizedId = knownComponentAliases.get(componentId) ?? componentId
      if (local.components.has(normalizedId)) continue
      findings.push(finding("unclassified-upstream-hook-component", componentId, `Upstream hook ${hook.relativePath} references component ${componentId}, but lfg has no inventory status for it.`))
    }
  }
}

async function scanSkills(root) {
  const skillRoots = [
    "skills",
    "packages/shared-skills",
    "packages/omo-codex/plugin/skills",
  ]
  const componentRoots = ["components", "packages/omo-codex/plugin/components"]
  const skills = []

  for (const relativeRoot of skillRoots) {
    for (const name of await listDirectories(join(root, relativeRoot))) {
      if (await pathExists(join(root, relativeRoot, name, "SKILL.md"))) {
        skills.push({ name, relativePath: join(relativeRoot, name).replaceAll("\\", "/"), source: "skill-root" })
      }
    }
  }

  for (const relativeComponentRoot of componentRoots) {
    for (const componentName of await listDirectories(join(root, relativeComponentRoot))) {
      const componentPath = join(root, relativeComponentRoot, componentName)
      for (const skillName of await listDirectories(join(componentPath, "skills"))) {
        if (await pathExists(join(componentPath, "skills", skillName, "SKILL.md"))) {
          skills.push({ name: skillName, relativePath: join(relativeComponentRoot, componentName, "skills", skillName).replaceAll("\\", "/"), source: "component-skill" })
        }
      }
    }
  }

  return uniqueBy(skills, (skill) => `${skill.name}:${skill.relativePath}`)
}

async function scanComponents(root) {
  const components = []
  for (const relativeRoot of ["components", "packages/omo-codex/plugin/components"]) {
    for (const id of await listDirectories(join(root, relativeRoot))) {
      components.push({ id, relativePath: join(relativeRoot, id).replaceAll("\\", "/") })
    }
  }
  return uniqueBy(components, (component) => component.id)
}

async function scanHooks(root) {
  const hooks = []
  for (const relativeRoot of ["hooks", "packages/omo-codex/plugin/hooks"]) {
    for (const fileName of await listFiles(join(root, relativeRoot))) {
      if (!fileName.endsWith(".json")) continue
      const absolutePath = join(root, relativeRoot, fileName)
      const text = await readFile(absolutePath, "utf8")
      const components = new Set()
      for (const match of text.matchAll(hookCommandComponentPattern)) components.add(match[1])
      hooks.push({ relativePath: join(relativeRoot, fileName).replaceAll("\\", "/"), components: [...components].sort() })
    }
  }
  return hooks
}

async function scanPackages(root) {
  const packagesRoot = join(root, "packages")
  const packages = []
  for (const name of await listDirectories(packagesRoot)) {
    const packageJson = await readJsonSafe(join(packagesRoot, name, "package.json"))
    packages.push({ name, packageName: packageJson?.name ?? null, version: packageJson?.version ?? null })
  }
  return packages
}

async function resolveSourceRoot(explicitSource) {
  const candidates = [
    explicitSource,
    process.env.LFG_OMO_PARITY_SOURCE_ROOT,
    process.env.LFG_OMO_SKILLS_SOURCE_ROOT,
    process.env.LFG_OMO_PLUGIN_ROOT,
  ].filter((candidate) => typeof candidate === "string" && candidate.length > 0)

  for (const candidate of candidates) {
    const root = resolve(candidate)
    if (await looksLikeOmoSource(root)) return root
  }
  return null
}

async function looksLikeOmoSource(root) {
  return (await pathExists(join(root, "package.json"))) && (
    await pathExists(join(root, "skills"))
    || await pathExists(join(root, "packages", "shared-skills"))
    || await pathExists(join(root, "packages", "omo-codex", "plugin"))
  )
}

function finding(kind, id, message) {
  return { kind, id, message }
}

function uniqueBy(values, key) {
  const seen = new Set()
  const unique = []
  for (const value of values) {
    const identity = key(value)
    if (seen.has(identity)) continue
    seen.add(identity)
    unique.push(value)
  }
  return unique.sort((a, b) => key(a).localeCompare(key(b)))
}

async function listDirectories(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

async function listFiles(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

async function readJsonSafe(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch {
    return null
  }
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function parseArgs(argv) {
  let source
  let json = false
  let writeReport
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--source") {
      source = argv[++index]
    } else if (arg === "--json") {
      json = true
    } else if (arg === "--write-report") {
      writeReport = argv[++index]
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return { source, json, writeReport }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2))
  const report = await checkOmoParityUpkeep(options)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else if (report.ok) {
    const source = report.sourceRoot === null ? "local generated parity state" : report.sourceRoot
    process.stdout.write(`omo-parity-upkeep: ok ${source}\n`)
  } else {
    process.stderr.write(`omo-parity-upkeep: ${report.findings.length} finding(s)\n`)
    for (const item of report.findings) process.stderr.write(`- ${item.kind}:${item.id}: ${item.message}\n`)
  }
  process.exit(report.ok ? 0 : 2)
}
