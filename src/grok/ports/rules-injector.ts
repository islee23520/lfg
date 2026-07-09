import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, relative, resolve, sep } from "node:path"

import {
  createAgentsMdCache,
  createContentHash,
  createRuleScanCache,
  findAgentsMdUp,
  findRuleFiles,
  findProjectRoot,
  isDuplicateByContentHash,
  isDuplicateByRealPath,
  parseRuleFrontmatter,
  shouldApplyRule,
  type AgentsMdCache,
  type RuleScanCache,
} from "../../core/omo/rules-engine"

/**
 * Grok rules/AGENTS.md context injector (Phase 1 glue).
 *
 * This is the host-specific glue over the OMO rules-engine core. It mirrors
 * the upstream `omo-opencode` `rules-injector` + `directory-agents-injector`
 * hooks, but adapted to Grok's `PostToolUse` lifecycle: instead of mutating
 * OpenCode tool output, it returns a markdown context block that the Grok hook
 * bridge appends to the tool result (or surfaces as additional context).
 *
 * See `docs/grok-adapter-core-port-strategy.md` (Phase 1).
 */

export interface RuleInjectionInput {
  readonly cwd: string
  readonly currentFile: string
  readonly projectRoot?: string
  readonly homeDir?: string
  readonly includeRootAgentsMd?: boolean
  readonly ruleScanCache?: RuleScanCache
  readonly agentsMdCache?: AgentsMdCache
  readonly readFile?: (path: string) => Promise<string>
}

export interface RuleInjectionResult {
  readonly contextBlock: string
  readonly matchedCount: number
  readonly agentsMdCount: number
}

/**
 * Build the rules + AGENTS.md context block for a touched file.
 *
 * Rules (`.rules/*.md` / `AGENTS.md`-adjacent rule files) are matched against
 * the file path, deduplicated by content hash + real path, and formatted.
 * AGENTS.md files are walked upward from the file's directory to the project
 * root (security-bounded by rules-engine's isSameOrChildPath check).
 */
export async function buildRuleContext(input: RuleInjectionInput): Promise<RuleInjectionResult> {
  const homeDir = input.homeDir ?? homedir()
  const readRaw = input.readFile ?? ((path) => readFile(path, "utf8"))
  const projectRoot = input.projectRoot ?? findProjectRoot(input.cwd) ?? input.cwd
  const currentFile = resolveAbsolute(input.currentFile, input.cwd)
  const ruleScanCache = input.ruleScanCache ?? createRuleScanCache()
  const agentsMdCache = input.agentsMdCache ?? createAgentsMdCache()

  const candidates = findRuleFiles(projectRoot, homeDir, currentFile, undefined, ruleScanCache)
  const seenHashes = new Set<string>()
  const seenPaths = new Set<string>()
  const matchedRules: Array<{ readonly relativePath: string; readonly reason: string; readonly body: string }> = []

  for (const candidate of candidates) {
    const content = await safeRead(candidate.realPath, readRaw)
    const parsed = parseRuleFrontmatter(content)
    const metadata = parsed.metadata
    const match = shouldApplyRule(metadata, currentFile, projectRoot)
    if (!match.applies) continue
    const hash = createContentHash(content)
    if (isDuplicateByContentHash(hash, seenHashes)) continue
    if (isDuplicateByRealPath(candidate.realPath, seenPaths)) continue
    seenHashes.add(hash)
    seenPaths.add(candidate.realPath)
    matchedRules.push({
      relativePath: relative(projectRoot, candidate.realPath) || candidate.realPath,
      reason: match.reason ?? "match",
      body: parsed.body,
    })
  }

  const agentsMdPaths = await findAgentsMdUp({ startDir: dirOf(currentFile), rootDir: projectRoot, skipRoot: !(input.includeRootAgentsMd ?? true), cache: agentsMdCache })
  const agentsBlocks: string[] = []
  for (const agentsPath of agentsMdPaths) {
    const body = await safeRead(agentsPath, readRaw)
    const trimmed = body.trim()
    if (trimmed.length > 0) {
      agentsBlocks.push(formatAgentsMdBlock(relative(projectRoot, agentsPath) || agentsPath, trimmed))
    }
  }

  const ruleBlocks = matchedRules.map(({ relativePath, reason, body }) => formatRuleBlock(relativePath, reason, body))
  const contextBlock = [...agentsBlocks, ...ruleBlocks].filter((block) => block.length > 0).join("\n\n")
  return { contextBlock, matchedCount: matchedRules.length, agentsMdCount: agentsMdPaths.length }
}

function safeRead(path: string, readRaw: (path: string) => Promise<string>): Promise<string> {
  return readRaw(path).catch(() => "")
}

function formatRuleBlock(relativePath: string, reason: string, body: string): string {
  const trimmed = body.trim()
  if (trimmed.length === 0) return ""
  return `[Rule: ${relativePath}]\n[Match: ${reason}]\n${trimmed}`
}

function formatAgentsMdBlock(relativePath: string, body: string): string {
  return `[AGENTS.md: ${relativePath}]\n${body}`
}

function resolveAbsolute(filePath: string, cwd: string): string {
  return isAbsolute(filePath) ? filePath : resolve(cwd, filePath)
}

function dirOf(filePath: string): string {
  const idx = filePath.lastIndexOf(sep)
  return idx === -1 ? filePath : filePath.slice(0, idx)
}
