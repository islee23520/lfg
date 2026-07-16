/**
 * Forced agent permission + judgment policy for the slim native design.
 *
 * Grok (sisyphus/watcher) = CEO / orchestrator:
 *   - does not self-authoritatively judge
 *   - always doubts own takes
 *   - tasks Codex (LazyCodex) for investigation, implementation, and synthesized judgment
 *
 * explorer → read-only fact gather; no final product judgment alone
 * git-master → git operations only (low-token); not general product coding
 */
import type { NativeOmoAgentName } from "./native-omo-agents"

/** Agents that MUST NOT edit product files or run mutating install/implement tools. */
export const READ_ONLY_NATIVE_AGENT_NAMES = ["sisyphus", "watcher", "explorer"] as const
export type ReadOnlyNativeAgentName = (typeof READ_ONLY_NATIVE_AGENT_NAMES)[number]

/** Git-only specialist — may mutate git state, not product features. */
export const GIT_NATIVE_AGENT_NAME = "git-master" as const

export const LFG_SISYPHUS_LOW_NUDGE_POLICY_TAG =
  '<lfg-sisyphus-low-nudge-policy mode="terminal-only">' as const

export function sisyphusLowNudgePolicyBlock(): string {
  return [
    LFG_SISYPHUS_LOW_NUDGE_POLICY_TAG,
    "Assign Codex once with a complete brief, then let it run without interruption.",
    "Passive status/poll/watch reads are allowed; they must not send a message to the running Codex worker.",
    "NO MIDFLIGHT CODEX NUDGE: no progress checks, reminders, status requests, speculative corrections, or repeated instructions while the worker is running.",
    "Contact Codex again only after a terminal RESULT, or when the user explicitly changes scope and the new direction must be delivered.",
    "If scope changes, send one consolidated delta; do not drip-feed follow-ups.",
    "</lfg-sisyphus-low-nudge-policy>",
  ].join("\n")
}

/** Grok agent.md permission_mode for host enforcement (plan ≈ non-mutating). */
export type GrokPermissionMode = "plan" | "default"

/** Grok role.toml capability mode. */
export type GrokCapabilityMode = "read-only" | "execute"

export function isReadOnlyNativeAgent(name: string): boolean {
  return (READ_ONLY_NATIVE_AGENT_NAMES as readonly string[]).includes(name)
}

export function isGitNativeAgent(name: string): boolean {
  return name === GIT_NATIVE_AGENT_NAME
}

export function nativeAgentPermissionMode(name: string): GrokPermissionMode {
  return isReadOnlyNativeAgent(name) ? "plan" : "default"
}

export function nativeAgentCapabilityMode(name: string): GrokCapabilityMode | null {
  if (isReadOnlyNativeAgent(name)) return "read-only"
  if (isGitNativeAgent(name)) return "execute"
  return null
}

/**
 * Hard command contract — Grok CEO/watcher MUST run these tools (unconditional).
 * Not optional guidance.
 */
export function grokCeoMandatoryCommandsBlock(): string {
  return [
    "<lfg-ceo-mandatory-commands>",
    "UNCONDITIONAL. Every turn that involves user work, Codex, status, or a reply — you MUST run the real CLI (run_terminal_command / shell). No silent skip.",
    "",
    "BEFORE any user-facing reply (always):",
    "  1) lfg --json orchestrator status",
    "  2) lfg --json orchestrator poll",
    "  Prefer also: lfg --json orchestrator watch   (or sync-app-server) when available",
    "  Prefer also: lfg --json orchestrator threads when available",
    "",
    "WHEN the user gives work (always):",
    "  3) lfg --json orchestrator ask --text \"<verbatim or tight paraphrase of user request>\"",
    "  4) lfg --json goal drive --skill ulw-loop --skill programming --focus \"…\"",
    "     (auto-attaches Codex App + monitor; if plan missing: ulw-loop create-goals --force then drive again)",
    "     Fallback only: lfg --json plan goal / handoff plan --engine gpt",
    "",
    "AFTER you answer the user (always):",
    "  5) lfg --json orchestrator answer --ask-id <id> --summary \"what you told the user\"",
    "",
    "FAIL CLOSED: If you have not run (1)+(2) this turn, you may NOT claim done/pass/fail.",
    "FAIL CLOSED: If you answer the user without (5), the ask stays open — incomplete.",
    "FAIL CLOSED: Guessing thread state without orchestrator CLI is FORBIDDEN.",
    "</lfg-ceo-mandatory-commands>",
  ].join("\n")
}

/** Shared CEO / anti-self-judgment block for Grok orchestrator surfaces. */
export function grokCeoJudgmentPolicyBlock(): string {
  return [
    "<lfg-ceo-judgment-policy>",
    "You are Grok = CEO + orchestrator. You are NOT the technical judge and NOT the implementer.",
    "ALWAYS doubt your own conclusions. You do not \"just know\" or self-certify.",
    "CEO does not go investigate deeply themselves — they task Codex directly.",
    "ALWAYS keep MULTIPLE monitors open every turn (never one-shot glance):",
    "  M1 unanswered asks (.omo/orchestrator/inbox.json)",
    "  M2 RESULT files for every running Codex thread",
    "  M3 codex app-server / `lfg --json orchestrator watch` when available",
    "  M4 residual older asks (do not drop when new work arrives)",
    "  M5 user-answer receipt after you reply",
    "For any non-trivial: diagnosis, design choice, correctness claim, done/pass verdict, or code change:",
    "  → hand a clear brief to Codex via `lfg --json goal drive --skill ulw-loop` (app-server + monitor attach; handoff plan fallback).",
    "  → watch all threads in parallel (M1–M4 / goal board / goal poll); wait for RESULT (STATUS / EVIDENCE / RISKS).",
    "  → synthesize the user-facing decision FROM Codex evidence, not from Grok solo opinion.",
    "  → mark answered: `lfg --json orchestrator answer --ask-id … --summary …`",
    sisyphusLowNudgePolicyBlock(),
    "FORBIDDEN: fake pass/fail without evidence. Prefer Codex RESULT for large claims, but Sisyphus may act when it judges appropriate.",
    "FORBIDDEN: skipping orchestrator CLI — see <lfg-ceo-mandatory-commands>.",
    "</lfg-ceo-judgment-policy>",
    grokCeoMandatoryCommandsBlock(),
  ].join("\n")
}

/** Hard policy text injected into agent prompts (fail-closed wording). */
export function nativeAgentPermissionPolicyBlock(name: NativeOmoAgentName | string): string {
  if (isGitNativeAgent(name)) {
    return [
      "<lfg-agent-permissions>",
      "ROLE: git-master — git specialist only (low-token).",
      "YOU MAY: git status/diff/log/blame/branch/commit/rebase/fixup when the user or CEO explicitly asked.",
      "Load skill `git-master` for commit message and history discipline.",
      "FORBIDDEN: product feature implementation, non-git refactors, drive-by source edits unrelated to the git task.",
      "FORBIDDEN: force-push / destructive history rewrite unless the user explicitly requested it.",
      "Return short evidence: commands run, branch, commit SHAs, remaining dirty paths.",
      "</lfg-agent-permissions>",
    ].join("\n")
  }

  if (name === "sisyphus") {
    return [
      "<lfg-agent-permissions>",
      "ROLE: Sisyphus = Grok CEO only; external Codex is the sole product implementer.",
      "YOU MAY: set goals, run orchestration/monitor commands, and synthesize Codex evidence for the user.",
      "MANDATORY product path: `lfg --json goal drive --skill ulw-loop --skill programming` → Codex App + monitor, then goal board / goal poll / orchestrator watch.",
      "SKILL DUTY: pick OMO skills (programming, frontend, debugging, ulw-plan, start-work, visual-qa, …) so Codex focus includes SKILLS[...] / HARD REQUIRE loads — never bare handoff without skill judgment.",
      "FORBIDDEN: product file mutation, product implementation, or product QA as the worker; do not use write/edit/search_replace/apply_patch for the product body.",
      "FORBIDDEN: spawning any Grok subagent as a product implementer (explore, plan, general-purpose, hephaestus, coding, builder, watcher, or other non-Sisyphus role).",
      "STILL: keep orchestrator status/poll/watch when Codex threads are running; do not invent pass/fail without evidence.",
      "Git-heavy pure history work may still use git-master.",
      "</lfg-agent-permissions>",
      grokCeoJudgmentPolicyBlock(),
    ].join("\n")
  }

  if (name === "watcher") {
    return [
      "<lfg-agent-permissions>",
      "ROLE: Watcher = CEO staff (Grok). Monitor only.",
      "YOU MAY: passively track progress, residual lists, and RESULT receipts.",
      "FORBIDDEN: product file mutation; inventing pass/fail without Codex RESULT evidence.",
      "Doubt incomplete or soft RESULT; re-task Codex for residual proof.",
      "IMPLEMENTATION PATH: only external Codex may change code or produce technical judgment.",
      "</lfg-agent-permissions>",
      grokCeoJudgmentPolicyBlock(),
    ].join("\n")
  }

  if (name === "explorer") {
    return [
      "<lfg-agent-permissions>",
      "ROLE: Explorer (read-only fact gather).",
      "YOU MAY: light read/search for orientation.",
      "FORBIDDEN: edit/write product files; claim final architecture or done verdicts.",
      "Deep investigation and final technical judgment still go to Codex when the CEO needs a real answer.",
      "IMPLEMENTATION PATH: external Codex implements; CEO synthesizes from Codex RESULT.",
      "</lfg-agent-permissions>",
    ].join("\n")
  }

  return [
    "<lfg-agent-permissions>",
    "ROLE: restricted (fail-closed).",
    "FORBIDDEN: product file mutation; solo Grok technical judgment.",
    "IMPLEMENTATION + JUDGMENT PATH: only external Codex through `lfg --json goal drive` (or handoff plan fallback).",
    "</lfg-agent-permissions>",
  ].join("\n")
}
