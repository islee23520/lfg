import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

export const managedSourceMap = {
  "ast-grep": "skills/ast-grep",
  "coding-agent-sessions": "skills/coding-agent-sessions",
  "comment-checker": "components/comment-checker/skills/comment-checker",
  debugging: "skills/debugging",
  frontend: "skills/frontend",
  "git-master": "skills/git-master",
  "init-deep": "skills/init-deep",
  "lfg-contribute-bug-fix": "skills/lcx-contribute-bug-fix",
  "lfg-doctor": "skills/lcx-doctor",
  "lfg-report-bug": "skills/lcx-report-bug",
  lsp: "components/lsp/skills/lsp",
  "lsp-setup": "skills/lsp-setup",
  programming: "skills/programming",
  refactor: "skills/refactor",
  "remove-ai-slops": "skills/remove-ai-slops",
  "review-work": "skills/review-work",
  rules: "components/rules/skills/rules",
  "start-work": "skills/start-work",
  teammode: "components/teammode/skills/teammode",
  "ultimate-browsing": "skills/ultimate-browsing",
  ultraresearch: "skills/ultraresearch",
  "ulw-loop": "components/ulw-loop/skills/ulw-loop",
  "ulw-plan": "components/ultrawork/skills/ulw-plan",
  "ulw-research": "skills/ulw-research",
  "visual-qa": "skills/visual-qa",
} as const

export async function writeUpstreamSkillSource(source: string): Promise<void> {
  await mkdir(source, { recursive: true })
  await writeFile(join(source, "package.json"), '{"name":"@sisyphuslabs/omo","version":"9.9.9"}\n', { encoding: "utf8" })
  for (const [skillName, sourcePath] of Object.entries(managedSourceMap)) {
    await writeSkillFile(source, sourcePath, skillName, `${sourcePath.startsWith("components/") ? "component" : "aggregate"} ${skillName} source\n`)
  }
  await writeSkillFile(
    source,
    managedSourceMap.ultraresearch,
    "ultraresearch",
    'description: "Maximum-saturation research orchestration: parallel explore+librarian swarms across codebase, web, official docs, and OSS repos;"\n\nRole protocols — embed the relevant one in each spawn message; every worker gets a unique angle:\n\n- **Web (librarian), 3-6 workers.** At least 10 distinct websearch queries per worker, each with a different operator or angle (see Search craft); fetch the full page for every result that matters — snippets lie. Context7 with 3+ queries per known library. grep.app and `gh search code|repos|issues` for real-world usage. Official docs via sitemap discovery (`<base>/sitemap.xml`), then targeted pages.\n\n## Search craft\n\nEnglish first: run every search in English by default\n',
  )
  await writeSkillFile(
    source,
    managedSourceMap["ulw-plan"],
    "ulw-plan",
    "You are **Prometheus**\nreferences/full-workflow.md\nscripts/scaffold-plan.mjs\n",
  )
  await writeSkillFile(
    source,
    managedSourceMap["ulw-loop"],
    "ulw-loop",
    "This skill is intentionally compact\nreferences/full-workflow.md\nManual-QA channels\n",
  )
  await writeSkillFile(
    source,
    managedSourceMap["start-work"],
    "start-work",
    "Codex Harness Tool Compatibility\nABSOLUTE RULE: YOU ARE AN ORCHESTRATOR\nBoulder state\n",
  )
  await writeSkillFile(
    source,
    managedSourceMap["lfg-doctor"],
    "lcx-doctor",
    "Diagnose LazyCodex and Codex CLI installation health\nCODEX_HOME\nlazycodex doctor --json\n",
  )
  await writeSkillFile(
    source,
    managedSourceMap["lfg-report-bug"],
    "lcx-report-bug",
    "Route LazyCodex or Codex bugs with source evidence\ncode-yeongyu/lazycodex\nlazycodex-generated\n",
  )
  await writeSkillFile(
    source,
    managedSourceMap["lfg-contribute-bug-fix"],
    "lcx-contribute-bug-fix",
    "Contribute verified LazyCodex or Codex bug fixes\nTag: lazycodex-generated\n",
  )
  await writeFile(join(source, managedSourceMap["ulw-plan"], "references", "full-workflow.md"), "## Phase 3 - Generate the plan\nCodex CLI review with `CODEX_HOME`\n", "utf8")
  await writeFile(join(source, managedSourceMap["ulw-plan"], "references", "intent-clear.md"), "clear\n", "utf8")
  await writeFile(join(source, managedSourceMap["ulw-plan"], "references", "intent-unclear.md"), "unclear\n", "utf8")
  await writeFile(join(source, managedSourceMap["ulw-plan"], "scripts", "scaffold-plan.mjs"), "console.log('scaffold-plan')\n", "utf8")
  await writeFile(join(source, managedSourceMap["ulw-loop"], "references", "full-workflow.md"), "## Execution Loop\nCODEX_HOME=\"${CODEX_HOME:-$HOME/.codex}\"\nInstall with npx lazycodex-ai install or set CODEX_LOCAL_BIN_DIR to a PATH directory.\n", "utf8")
  await writeFile(join(source, managedSourceMap["git-master"], "agents", "openai.yaml"), 'interface:\n  display_name: "git-master (omo)"\n  default_prompt: "Use $git-master"\n', "utf8")
  await writeFile(join(source, managedSourceMap["ulw-plan"], "agents", "openai.yaml"), 'interface:\n  display_name: "ulw-plan (omo)"\n  default_prompt: "Use $ulw-plan"\n', "utf8")
}

export async function writeLazycodexPackageSkillSource(source: string): Promise<void> {
  await mkdir(source, { recursive: true })
  await writeFile(join(source, "package.json"), '{"name":"lazycodex-ai","version":"4.12.1"}\n', { encoding: "utf8" })
  for (const [skillName, sourcePath] of Object.entries(managedSourceMap)) {
    const packageSourcePath = sourcePath.startsWith("components/")
      ? join("packages", "omo-codex", "plugin", sourcePath)
      : join("packages", "shared-skills", sourcePath)
    await writeSkillFile(
      source,
      packageSourcePath,
      skillName,
      `${sourcePath.startsWith("components/") ? "component" : "shared"} ${skillName} source\n`,
    )
  }
}

async function writeSkillFile(source: string, sourcePath: string, skillName: string, body: string): Promise<void> {
  const dir = join(source, sourcePath)
  await mkdir(dir, { recursive: true })
  await mkdir(join(dir, "agents"), { recursive: true })
  await mkdir(join(dir, "references"), { recursive: true })
  await mkdir(join(dir, "scripts"), { recursive: true })
  await writeFile(join(dir, "SKILL.md"), `---\nname: ${skillName}\n---\n\n${body}`, "utf8")
}
