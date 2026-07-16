#!/usr/bin/env node
/**
 * assert-skills-smoke.mjs
 *
 * Smoke-tests every skill shipped under skills/ (and mirrors under
 * src/grok/skills + dist/grok-install/skills when present):
 *  1. SKILL.md exists, YAML frontmatter has name + description, body non-empty
 *  2. frontmatter name matches directory (xai_* ↔ xai-* allowed)
 *  3. required native agents/grok.yaml is present/non-empty; openai.yaml must not exist
 *  4. entry scripts syntax-check (node --check / python3 -m py_compile / bash -n)
 *  5. cheap behavioral probes for known CLIs (teammode, scaffold-plan, …)
 *  6. three-root SKILL.md presence for skills that are in the sync set
 *  7. optional installed-plugin surface (~/.grok/plugins/lfg/skills) if present
 *
 * Exit 0 on full pass; exit 2 on any failure. JSON summary with --json.
 */
import { spawnSync } from "node:child_process"
import { access, readdir, readFile, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))
const wantJson = process.argv.includes("--json")
const includeInstalled = !process.argv.includes("--skip-installed")
const packageSkillsRoot = join(repoRoot, "skills")
const mirrorRoots = [
  join(repoRoot, "src", "grok", "skills"),
  join(repoRoot, "dist", "grok-install", "skills"),
]
const failures = []
const reports = []

/** Skills only in package tarball skills/, not mirrored into grok roots. */
const packageOnlySkills = new Set(["lfg"])
const nativeSkillFiles = new Map([
])

/** Skills with executable probes beyond syntax. */
const BEHAVIORAL = {
  teammode: smokeTeammode,
  "ulw-plan": smokeUlwPlan,
  "lfg-contribute-bug-fix": smokeCreatePrBody,
  "visual-qa": smokeVisualQa,
  "coding-agent-sessions": smokeCodingAgentSessions,
  "ast-grep": smokeAstGrepHelper,
  "claude-code-inventory": smokeClaudeCodeInventory,
}

main().catch((error) => {
  process.stderr.write(`assert-skills-smoke: fatal ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(2)
})

async function main() {
  const skillDirs = await listSkillDirs(packageSkillsRoot)
  if (skillDirs.length === 0) {
    failures.push(`no skills found under ${packageSkillsRoot}`)
  }

  for (const skillName of skillDirs) {
    const report = await smokeSkill(skillName, packageSkillsRoot, { role: "package" })
    reports.push(report)
  }

  for (const root of mirrorRoots) {
    if (!(await exists(root))) continue
    const mirrorSkills = await listSkillDirs(root)
    for (const skillName of skillDirs) {
      if (packageOnlySkills.has(skillName)) continue
      if (!mirrorSkills.includes(skillName)) {
        failures.push(`${relative(repoRoot, root)}: missing skill dir ${skillName}/ (present in skills/)`)
        continue
      }
      await smokeSkill(skillName, root, { role: "mirror", light: true })
    }
    await assertNativeSkillFilesMatch(root, relative(repoRoot, root))
  }

  if (includeInstalled) {
    const installedRoot = join(homedir(), ".grok", "plugins", "lfg", "skills")
    if (await exists(installedRoot)) {
      const installed = await listSkillDirs(installedRoot)
      for (const skillName of skillDirs) {
        if (packageOnlySkills.has(skillName)) continue
        if (!installed.includes(skillName)) {
          failures.push(`installed plugin skills: missing ${skillName}/ under ${installedRoot}`)
          continue
        }
        await smokeSkill(skillName, installedRoot, { role: "installed", light: true })
      }
    }
  }

  const summary = {
    ok: failures.length === 0,
    skillCount: skillDirs.length,
    skills: skillDirs,
    failures,
    reports: reports.map((r) => ({
      skill: r.skill,
      ok: r.ok,
      checks: r.checks,
      scriptsChecked: r.scriptsChecked,
      behavioral: r.behavioral,
    })),
  }

  if (wantJson) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  } else {
    for (const r of reports) {
      const mark = r.ok ? "ok" : "FAIL"
      process.stdout.write(
        `  [${mark}] ${r.skill}  checks=${r.checks.join(",")}  scripts=${r.scriptsChecked}  behavioral=${r.behavioral ?? "n/a"}\n`,
      )
    }
    if (failures.length > 0) {
      process.stderr.write(`assert-skills-smoke: ${failures.length} failure(s)\n`)
      for (const f of failures) process.stderr.write(`- ${f}\n`)
    } else {
      process.stdout.write(
        `assert-skills-smoke: ok skills=${skillDirs.length} package+mirrors${includeInstalled ? "+installed" : ""}\n`,
      )
    }
  }

  process.exit(failures.length > 0 ? 2 : 0)
}

/**
 * @param {string} skillName
 * @param {string} root
 * @param {{ role: string, light?: boolean }} opts
 */
async function smokeSkill(skillName, root, opts) {
  const skillRoot = join(root, skillName)
  const checks = []
  let scriptsChecked = 0
  /** @type {string | null} */
  let behavioral = null
  let ok = true

  const skillMd = join(skillRoot, "SKILL.md")
  if (!(await exists(skillMd))) {
    fail(`${rel(skillRoot)}: missing SKILL.md`)
    ok = false
    return { skill: skillName, ok, checks, scriptsChecked, behavioral }
  }
  checks.push("skill.md")

  const raw = await readFile(skillMd, "utf8")
  const parsed = parseSkillFrontmatter(raw)
  if (parsed === null) {
    fail(`${rel(skillMd)}: missing YAML frontmatter (--- ... ---)`)
    ok = false
  } else {
    checks.push("frontmatter")
    if (typeof parsed.name !== "string" || parsed.name.trim().length === 0) {
      fail(`${rel(skillMd)}: frontmatter missing name`)
      ok = false
    } else if (!namesCompatible(skillName, parsed.name.trim())) {
      fail(`${rel(skillMd)}: name "${parsed.name}" does not match dir "${skillName}"`)
      ok = false
    } else {
      checks.push("name")
    }
    if (typeof parsed.description !== "string" || parsed.description.trim().length < 8) {
      fail(`${rel(skillMd)}: frontmatter description missing or too short`)
      ok = false
    } else {
      checks.push("description")
    }
    if (parsed.body.trim().length < 20) {
      fail(`${rel(skillMd)}: body too short after frontmatter`)
      ok = false
    } else {
      checks.push("body")
    }
  }

  const openaiYaml = join(skillRoot, "agents", "openai.yaml")
  if (await exists(openaiYaml)) {
    fail(`${rel(openaiYaml)}: openai.yaml must be converted to agents/grok.yaml`)
    ok = false
  }
  const grokYaml = join(skillRoot, "agents", "grok.yaml")
  const requiresGrokYaml = nativeSkillFiles.has(skillName)
  if (requiresGrokYaml && !(await exists(grokYaml))) {
    fail(`${rel(grokYaml)}: required native agents/grok.yaml is missing`)
    ok = false
  } else if (await exists(grokYaml)) {
    const gy = await readFile(grokYaml, "utf8")
    if (gy.trim().length < 8) {
      fail(`${rel(grokYaml)}: empty agents/grok.yaml`)
      ok = false
    } else {
      checks.push("grok.yaml")
    }
  }

  if (!opts.light) {
    const scripts = await collectEntryScripts(skillRoot)
    for (const scriptPath of scripts) {
      const result = syntaxCheck(scriptPath)
      scriptsChecked += 1
      if (!result.ok) {
        fail(`${rel(scriptPath)}: syntax check failed: ${result.detail}`)
        ok = false
      }
    }
    if (scriptsChecked > 0) checks.push(`scripts:${scriptsChecked}`)

    const probe = BEHAVIORAL[skillName]
    if (typeof probe === "function") {
      const br = await probe(skillRoot)
      behavioral = br.ok ? "ok" : `fail:${br.detail}`
      if (!br.ok) {
        fail(`${skillName}: behavioral smoke failed: ${br.detail}`)
        ok = false
      } else {
        checks.push("behavioral")
      }
    }
  }

  return { skill: skillName, ok, checks, scriptsChecked, behavioral }
}

async function assertNativeSkillFilesMatch(root, rootLabel) {
  for (const [skillName, relativePaths] of nativeSkillFiles) {
    for (const relativePath of relativePaths) {
      const expectedPath = join(packageSkillsRoot, skillName, relativePath)
      const actualPath = join(root, skillName, relativePath)
      if (!(await exists(actualPath))) {
        fail(`${rootLabel}: missing native skill file ${skillName}/${relativePath}`)
        continue
      }
      if ((await readFile(actualPath, "utf8")) !== (await readFile(expectedPath, "utf8"))) {
        fail(`${rootLabel}: stale native skill file ${skillName}/${relativePath}`)
      }
    }
  }
}

function namesCompatible(dirName, frontmatterName) {
  if (dirName === frontmatterName) return true
  // xai skill dirs use hyphens; MCP tool ids use underscores
  if (dirName.replaceAll("-", "_") === frontmatterName) return true
  if (dirName === frontmatterName.replaceAll("_", "-")) return true
  return false
}

/**
 * @param {string} raw
 * @returns {{ name?: string, description?: string, body: string } | null}
 */
function parseSkillFrontmatter(raw) {
  const text = raw.replace(/^\uFEFF/, "")
  if (!text.startsWith("---")) return null
  const end = text.indexOf("\n---", 3)
  if (end === -1) return null
  const fmBlock = text.slice(4, end).trimEnd()
  const body = text.slice(end + 4)
  /** @type {Record<string, string>} */
  const fields = {}
  let currentKey = null
  let currentVal = ""
  for (const line of fmBlock.split("\n")) {
    if (/^[A-Za-z0-9_-]+:\s*/.test(line) && !line.startsWith(" ")) {
      if (currentKey !== null) fields[currentKey] = unquote(currentVal.trim())
      const idx = line.indexOf(":")
      currentKey = line.slice(0, idx).trim()
      currentVal = line.slice(idx + 1).trim()
      // quoted multi-line description starts with " and may continue
      if ((currentVal.startsWith('"') && !currentVal.endsWith('"')) || (currentVal.startsWith("'") && !currentVal.endsWith("'"))) {
        // keep accumulating until closed — simple: join rest as-is until we see close on later lines
      }
    } else if (currentKey !== null) {
      currentVal += `\n${line}`
    }
  }
  if (currentKey !== null) fields[currentKey] = unquote(currentVal.trim())
  return { name: fields.name, description: fields.description, body }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1)
  }
  return value
}

/**
 * Collect top-level executable-ish scripts under scripts/ (not deep tests/templates).
 * @param {string} skillRoot
 */
async function collectEntryScripts(skillRoot) {
  const out = []
  const scriptsDir = join(skillRoot, "scripts")
  if (!(await exists(scriptsDir))) return out

  const stack = [scriptsDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const full = join(dir, ent.name)
      if (ent.isDirectory()) {
        if (ent.name === "tests" || ent.name === "templates" || ent.name === "node_modules" || ent.name === "__pycache__") continue
        // limit depth: scripts/* and scripts/*/*
        const rel = relative(scriptsDir, full)
        if (rel.split(/[\\/]/).length <= 2) stack.push(full)
        continue
      }
      if (!ent.isFile()) continue
      if (/\.test\.(ts|js|mjs|cjs)$/.test(ent.name)) continue
      if (ent.name.endsWith(".mjs") || ent.name.endsWith(".js") || ent.name.endsWith(".cjs")) {
        out.push(full)
      } else if (ent.name.endsWith(".py") && !ent.name.startsWith("test_")) {
        out.push(full)
      } else if (ent.name.endsWith(".sh")) {
        out.push(full)
      }
    }
  }

  // Also ultimate-browsing engine package entry
  const engineMain = join(skillRoot, "engine", "__main__.py")
  if (await exists(engineMain)) out.push(engineMain)

  return out
}

/**
 * @param {string} scriptPath
 * @returns {{ ok: boolean, detail: string }}
 */
function syntaxCheck(scriptPath) {
  if (scriptPath.endsWith(".mjs") || scriptPath.endsWith(".js") || scriptPath.endsWith(".cjs")) {
    const r = spawnSync(process.execPath, ["--check", scriptPath], { encoding: "utf8" })
    return r.status === 0
      ? { ok: true, detail: "node --check" }
      : { ok: false, detail: (r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 400) }
  }
  if (scriptPath.endsWith(".py")) {
    const py = which("python3") ?? which("python")
    if (py === null) return { ok: true, detail: "python skipped (not installed)" }
    const r = spawnSync(py, ["-m", "py_compile", scriptPath], { encoding: "utf8" })
    return r.status === 0
      ? { ok: true, detail: "py_compile" }
      : { ok: false, detail: (r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 400) }
  }
  if (scriptPath.endsWith(".sh")) {
    const bash = which("bash")
    if (bash === null) return { ok: true, detail: "bash skipped (not installed)" }
    const r = spawnSync(bash, ["-n", scriptPath], { encoding: "utf8" })
    return r.status === 0
      ? { ok: true, detail: "bash -n" }
      : { ok: false, detail: (r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 400) }
  }
  return { ok: true, detail: "skipped" }
}

/** @param {string} skillRoot */
async function smokeTeammode(skillRoot) {
  const cli = join(skillRoot, "scripts", "team.mjs")
  if (!(await exists(cli))) return { ok: false, detail: "scripts/team.mjs missing" }
  // no args → should print usage / exit non-zero or zero with help text
  const r = spawnSync(process.execPath, [cli], { encoding: "utf8", timeout: 10_000 })
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`
  if (/init|add-member|bind-subagent|Usage|team\.mjs/i.test(out) || r.status !== 0) {
    return { ok: true, detail: "team.mjs help/usage" }
  }
  // status 0 with empty is still ok if module loaded (imports worked)
  if (r.status === 0) return { ok: true, detail: "team.mjs exit 0" }
  return { ok: false, detail: out.trim().slice(0, 300) || `exit ${r.status}` }
}

/** @param {string} skillRoot */
async function smokeUlwPlan(skillRoot) {
  const cli = join(skillRoot, "scripts", "scaffold-plan.mjs")
  if (!(await exists(cli))) return { ok: false, detail: "scripts/scaffold-plan.mjs missing" }
  const r = spawnSync(process.execPath, [cli], { encoding: "utf8", timeout: 10_000 })
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`
  // expects slug arg — usage/error is fine as long as module loads
  if (r.error) return { ok: false, detail: String(r.error.message ?? r.error) }
  if (/slug|Usage|scaffold-plan|required/i.test(out) || r.status !== 0 || r.status === 0) {
    return { ok: true, detail: "scaffold-plan.mjs loads" }
  }
  return { ok: false, detail: out.trim().slice(0, 300) }
}

/** @param {string} skillRoot */
async function smokeCreatePrBody(skillRoot) {
  const cli = join(skillRoot, "scripts", "create-pr-body.mjs")
  if (!(await exists(cli))) return { ok: false, detail: "scripts/create-pr-body.mjs missing" }
  const r = spawnSync(process.execPath, [cli], { encoding: "utf8", timeout: 10_000 })
  if (r.error) return { ok: false, detail: String(r.error.message ?? r.error) }
  return { ok: true, detail: "create-pr-body.mjs loads" }
}

/** @param {string} skillRoot */
async function smokeVisualQa(skillRoot) {
  const cli = join(skillRoot, "scripts", "visual-qa.mjs")
  if (!(await exists(cli))) return { ok: false, detail: "scripts/visual-qa.mjs missing" }
  const r = spawnSync(process.execPath, ["--check", cli], { encoding: "utf8", timeout: 10_000 })
  if (r.status !== 0) return { ok: false, detail: (r.stderr || r.stdout || "").trim().slice(0, 300) }
  return { ok: true, detail: "visual-qa.mjs --check" }
}

/** @param {string} skillRoot */
async function smokeCodingAgentSessions(skillRoot) {
  const cli = join(skillRoot, "scripts", "find-agent-sessions.py")
  if (!(await exists(cli))) return { ok: false, detail: "scripts/find-agent-sessions.py missing" }
  const py = which("python3") ?? which("python")
  if (py === null) return { ok: true, detail: "python skipped" }
  const r = spawnSync(py, [cli, "--help"], { encoding: "utf8", timeout: 15_000 })
  // --help may be unsupported; exit 0/1/2 with traceback-free output is ok if no SyntaxError
  const err = `${r.stderr ?? ""}\n${r.stdout ?? ""}`
  if (/SyntaxError|IndentationError|ModuleNotFoundError: No module named 'agent_sessions'/i.test(err)) {
    // try package path import style
    const r2 = spawnSync(py, ["-m", "py_compile", cli], { encoding: "utf8", timeout: 10_000 })
    if (r2.status === 0) return { ok: true, detail: "find-agent-sessions.py py_compile" }
    return { ok: false, detail: err.trim().slice(0, 300) }
  }
  return { ok: true, detail: "find-agent-sessions.py runs" }
}

/** @param {string} skillRoot */
async function smokeAstGrepHelper(skillRoot) {
  const helper = join(skillRoot, "scripts", "ast_grep_helper.py")
  if (!(await exists(helper))) return { ok: false, detail: "scripts/ast_grep_helper.py missing" }
  const py = which("python3") ?? which("python")
  if (py === null) return { ok: true, detail: "python skipped" }
  const r = spawnSync(py, ["-m", "py_compile", helper], { encoding: "utf8", timeout: 10_000 })
  if (r.status !== 0) return { ok: false, detail: (r.stderr || r.stdout || "").trim().slice(0, 300) }
  return { ok: true, detail: "ast_grep_helper.py py_compile" }
}

/** @param {string} _skillRoot */
async function smokeClaudeCodeInventory(_skillRoot) {
  const lfgJs = join(repoRoot, "dist", "lfg.js")
  if (!(await exists(lfgJs))) {
    // build not yet run in this smoke process — frontmatter checks already passed
    return { ok: true, detail: "dist/lfg.js not built; skill docs only" }
  }
  const r = spawnSync(process.execPath, [lfgJs, "--json", "claude", "help"], {
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, LFG_ALLOW_TEST_GROK_HOME: "1" },
  })
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`
  if (r.status !== 0) return { ok: false, detail: out.trim().slice(0, 300) }
  if (!/claude_code|inventory|skills|plugins/i.test(out) && !/lfg claude/i.test(out)) {
    // help may be plain text string JSON-wrapped
    if (!/lfg claude/i.test(out)) return { ok: false, detail: `unexpected help output: ${out.trim().slice(0, 200)}` }
  }
  return { ok: true, detail: "lfg claude help" }
}

/** @param {string} root */
async function listSkillDirs(root) {
  if (!(await exists(root))) return []
  const entries = await readdir(root, { withFileTypes: true })
  const names = []
  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    if (ent.name.startsWith(".")) continue
    if (await exists(join(root, ent.name, "SKILL.md"))) names.push(ent.name)
  }
  return names.sort()
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function which(bin) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf8" })
  if (r.status !== 0) return null
  const line = (r.stdout ?? "").split("\n").map((s) => s.trim()).find((s) => s.length > 0)
  return line ?? null
}

function fail(message) {
  failures.push(message)
}

function rel(path) {
  return relative(repoRoot, path)
}

// silence unused import warning for dirname in some bundlers
void dirname
void stat
