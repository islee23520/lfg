/**
 * OMO role → external engine mapping.
 * Preserves OMO role identities while Codex is the only external worker engine.
 */

import type { Engine } from "./engines"

/**
 * OMO-style work roles the orchestrator may hand off.
 * Orchestrator roles (sisyphus/prometheus/atlas) stay on Grok — not listed.
 */
export const OMO_WORKER_ROLES = [
  "coding",
  "hephaestus",
  "implement",
  "rescue",
  "explore",
  "librarian",
  "oracle",
  "deep",
  "ultrabrain",
  "review",
  "adversarial",
  "vision",
  "visual_qa",
  "multimodal",
  "overview",
  "plan_assist",
] as const

export type OmoWorkerRole = (typeof OMO_WORKER_ROLES)[number]

export type SafetyMode = "read" | "write"

export type RoleSpec = {
  readonly role: OmoWorkerRole
  readonly engine: Engine
  readonly canWrite: boolean
  /** Short OMO-flavored persona for the worker prompt. */
  readonly persona: string
  readonly defaultDeliverable: string
  readonly defaultFocus: string
}

const ROLE_SPECS: Readonly<Record<OmoWorkerRole, RoleSpec>> = {
  coding: {
    role: "coding",
    engine: "gpt",
    canWrite: true,
    persona: "OMO coding worker (Codex/GPT): implement with TDD, minimal diffs, verify.",
    defaultDeliverable: "Code change + tests + verification commands/results.",
    defaultFocus: "Implement the assigned coding task end-to-end.",
  },
  hephaestus: {
    role: "hephaestus",
    engine: "gpt",
    canWrite: true,
    persona: "OMO Hephaestus role on Codex/GPT: high-rigor implementation and forge work.",
    defaultDeliverable: "Implemented slice + proof + residual risks.",
    defaultFocus: "Forge the implementation with high rigor and verify.",
  },
  implement: {
    role: "implement",
    engine: "gpt",
    canWrite: true,
    persona: "OMO implement worker on Codex/GPT.",
    defaultDeliverable: "Implemented change + verification.",
    defaultFocus: "Implement and verify the change.",
  },
  rescue: {
    role: "rescue",
    engine: "gpt",
    canWrite: true,
    persona: "OMO rescue worker on Codex/GPT: fix broken path end-to-end.",
    defaultDeliverable: "Fix applied + observables + residual risks.",
    defaultFocus: "Rescue the failing task end-to-end.",
  },
  explore: {
    role: "explore",
    engine: "gpt",
    canWrite: false,
    persona: "OMO explorer on Codex/GPT: read-only map of code.",
    defaultDeliverable: "Map of relevant paths, symbols, and risks.",
    defaultFocus: "Explore the codebase for the stated question.",
  },
  librarian: {
    role: "librarian",
    engine: "gpt",
    canWrite: false,
    persona: "OMO librarian (GPT): docs and external knowledge synthesis.",
    defaultDeliverable: "Cited findings from docs/code with paths and links.",
    defaultFocus: "Research docs and code for the stated question.",
  },
  oracle: {
    role: "oracle",
    engine: "gpt",
    canWrite: false,
    persona: "OMO oracle (GPT): deep second opinion and architecture critique.",
    defaultDeliverable: "Deep analysis with alternatives, risks, and recommendations.",
    defaultFocus: "Provide an oracle-level analysis of the problem.",
  },
  deep: {
    role: "deep",
    engine: "gpt",
    canWrite: false,
    persona: "OMO deep worker (GPT): hard reasoning / concurrency / design.",
    defaultDeliverable: "Deep reasoning write-up with evidence.",
    defaultFocus: "Deep-dive the hard problem with evidence.",
  },
  ultrabrain: {
    role: "ultrabrain",
    engine: "gpt",
    canWrite: false,
    persona: "OMO ultrabrain (GPT): maximum-depth reasoning.",
    defaultDeliverable: "Maximum-depth analysis and plan options.",
    defaultFocus: "Maximum-depth reasoning on the stated problem.",
  },
  review: {
    role: "review",
    engine: "gpt",
    canWrite: false,
    persona: "OMO reviewer (GPT): findings first, severity ordered.",
    defaultDeliverable: "Findings with paths and severity; open questions; summary.",
    defaultFocus: "Review the current scope for concrete problems.",
  },
  adversarial: {
    role: "adversarial",
    engine: "gpt",
    canWrite: false,
    persona: "OMO adversarial reviewer (GPT): attack the design.",
    defaultDeliverable: "Holes, failure modes, weaker alternatives with evidence.",
    defaultFocus: "Adversarially review the design and implementation.",
  },
  vision: {
    role: "vision",
    engine: "gpt",
    canWrite: false,
    persona: "OMO vision specialist on Codex/GPT: image/UI grounded analysis.",
    defaultDeliverable: "Vision analysis grounded in named image paths.",
    defaultFocus: "Analyze the provided images/screenshots.",
  },
  visual_qa: {
    role: "visual_qa",
    engine: "gpt",
    canWrite: false,
    persona: "OMO visual QA on Codex/GPT: pass/fail per visual criterion.",
    defaultDeliverable: "Visual QA pass/fail table with image evidence notes.",
    defaultFocus: "Visual QA against acceptance criteria on screenshots.",
  },
  multimodal: {
    role: "multimodal",
    engine: "gpt",
    canWrite: false,
    persona: "OMO multimodal looker on Codex/GPT: extract evidence from media.",
    defaultDeliverable: "Extracted visual/text evidence with paths.",
    defaultFocus: "Extract evidence from the provided media.",
  },
  overview: {
    role: "overview",
    engine: "gpt",
    canWrite: false,
    persona: "OMO overview worker on Codex/GPT: architecture map.",
    defaultDeliverable: "Purpose, layout, entry points, risks, next steps.",
    defaultFocus: "Map purpose, layout, and entry points.",
  },
  plan_assist: {
    role: "plan_assist",
    engine: "gpt",
    canWrite: false,
    persona: "OMO plan assistant (GPT): help Prometheus plan quality.",
    defaultDeliverable: "Plan critique or draft waves/checkboxes/risks.",
    defaultFocus: "Assist planning for the stated objective.",
  },
}

const ALIASES: Readonly<Record<string, OmoWorkerRole>> = {
  coding: "coding",
  code: "coding",
  hephaestus: "hephaestus",
  implement: "implement",
  implementation: "implement",
  rescue: "rescue",
  fix: "rescue",
  explore: "explore",
  explorer: "explore",
  librarian: "librarian",
  oracle: "oracle",
  deep: "deep",
  ultrabrain: "ultrabrain",
  review: "review",
  reviewer: "review",
  adversarial: "adversarial",
  adversarial_review: "adversarial",
  "adversarial-review": "adversarial",
  vision: "vision",
  visual: "vision",
  visual_qa: "visual_qa",
  "visual-qa": "visual_qa",
  vision_qa: "visual_qa",
  multimodal: "multimodal",
  "multimodal-looker": "multimodal",
  overview: "overview",
  map: "overview",
  plan: "plan_assist",
  plan_assist: "plan_assist",
  "plan-assist": "plan_assist",
}

/** Roles that must never leave Grok (orchestrator). */
export const GROK_ORCHESTRATOR_ROLES = [
  "sisyphus",
  "default",
  "prometheus",
  "atlas",
  "orchestrator",
] as const

export function normalizeOmoRole(value: unknown): OmoWorkerRole | undefined {
  if (value === undefined || value === null || value === "") return "coding"
  if (typeof value !== "string") return undefined
  const key = value.trim().toLowerCase().replace(/\s+/g, "_")
  if ((GROK_ORCHESTRATOR_ROLES as readonly string[]).includes(key)) {
    return undefined // signal: keep on Grok
  }
  return ALIASES[key]
}

export function getRoleSpec(role: OmoWorkerRole): RoleSpec {
  return ROLE_SPECS[role]
}

/** Preferred engine for a role (overrideable by caller). */
export function defaultEngineForRole(role: OmoWorkerRole): Engine {
  return ROLE_SPECS[role].engine
}
