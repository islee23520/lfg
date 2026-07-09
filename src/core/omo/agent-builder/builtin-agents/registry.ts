import type {
  AgentCategory,
  AgentMode,
  AgentPromptMetadata,
  BuiltinAgentName,
} from "../types"

export type CuratedBuiltinAgentName = Exclude<BuiltinAgentName, "sisyphus-junior">

export type BuiltinAgentPromptMode =
  | "dynamic-primary"
  | "static-specialist"
  | "static-advisor"
  | "static-exploration"
  | "static-utility"
  | "deferred"

export type BuiltinAgentToolRestrictions = {
  readonly allow?: readonly string[]
  readonly deny?: readonly string[]
  readonly prefer?: readonly string[]
}

export type BuiltinAgentPortStatus = "full" | "deferred"

export type BuiltinAgentDefinition = {
  readonly id: CuratedBuiltinAgentName
  readonly description: string
  readonly modelRequirementKey: CuratedBuiltinAgentName
  readonly category: AgentCategory
  readonly mode: AgentMode
  readonly promptMode: BuiltinAgentPromptMode
  readonly promptSections: readonly string[]
  readonly toolRestrictions: BuiltinAgentToolRestrictions
  readonly metadata: AgentPromptMetadata
  readonly portStatus: BuiltinAgentPortStatus
  readonly deferredReason?: string
}

const EXPLORE_METADATA: AgentPromptMetadata = {
  category: "exploration",
  cost: "FREE",
  promptAlias: "Explore",
  keyTrigger: "2+ modules involved → fire `explore` background",
  triggers: [
    { domain: "Explore", trigger: "Find existing codebase structure, patterns and styles" },
  ],
  useWhen: [
    "Multiple search angles needed",
    "Unfamiliar module structure",
    "Cross-layer pattern discovery",
  ],
  avoidWhen: [
    "You know exactly what to search",
    "Single keyword/pattern suffices",
    "Known file location",
  ],
}

const MULTIMODAL_LOOKER_METADATA: AgentPromptMetadata = {
  category: "utility",
  cost: "CHEAP",
  promptAlias: "Multimodal Looker",
  triggers: [],
}

const ATLAS_METADATA: AgentPromptMetadata = {
  category: "advisor",
  cost: "EXPENSIVE",
  promptAlias: "Atlas",
  triggers: [
    {
      domain: "Todo list orchestration",
      trigger: "Complete ALL tasks in a todo list with verification",
    },
    {
      domain: "Multi-agent coordination",
      trigger: "Parallel task execution across specialized agents",
    },
  ],
  useWhen: [
    "User provides a todo list path (.omo/plans/{name}.md)",
    "Multiple tasks need to be completed in sequence or parallel",
    "Work requires coordination across multiple specialized agents",
  ],
  avoidWhen: [
    "Single simple task that doesn't require orchestration",
    "Tasks that can be handled directly by one agent",
    "When user wants to execute tasks manually",
  ],
  keyTrigger: "Todo list path provided OR multiple tasks requiring multi-agent orchestration",
}

const LIBRARIAN_METADATA: AgentPromptMetadata = {
  category: "exploration",
  cost: "CHEAP",
  promptAlias: "Librarian",
  keyTrigger: "External library/source mentioned → fire `librarian` background",
  triggers: [
    {
      domain: "Librarian",
      trigger:
        "Unfamiliar packages / libraries, struggles at weird behaviour (to find existing implementation of opensource)",
    },
  ],
  useWhen: [
    "How do I use [library]?",
    "What's the best practice for [framework feature]?",
    "Why does [external dependency] behave this way?",
    "Find examples of [library] usage",
    "Working with unfamiliar npm/pip/cargo packages",
  ],
}

const MOMUS_METADATA: AgentPromptMetadata = {
  category: "advisor",
  cost: "EXPENSIVE",
  promptAlias: "Momus",
  triggers: [
    {
      domain: "Plan review",
      trigger: "Evaluate work plans for clarity, verifiability, and completeness",
    },
    {
      domain: "Quality assurance",
      trigger: "Catch gaps, ambiguities, and missing context before implementation",
    },
  ],
  useWhen: [
    "After Prometheus creates a work plan",
    "Before executing a complex todo list",
    "To validate plan quality before delegating to executors",
    "When plan needs rigorous review for ADHD-driven omissions",
  ],
  avoidWhen: [
    "Simple, single-task requests",
    "When user explicitly wants to skip review",
    "For trivial plans that don't need formal review",
  ],
  keyTrigger:
    "Work plan saved to `.omo/plans/*.md` → invoke Momus with the file path as the sole prompt. Do NOT invoke Momus for inline plans or todo lists.",
}

const ORACLE_METADATA: AgentPromptMetadata = {
  category: "advisor",
  cost: "EXPENSIVE",
  promptAlias: "Oracle",
  triggers: [
    { domain: "Architecture decisions", trigger: "Multi-system tradeoffs, unfamiliar patterns" },
    { domain: "Self-review", trigger: "After completing significant implementation" },
    { domain: "Hard debugging", trigger: "After 2+ failed fix attempts" },
  ],
  useWhen: [
    "Complex architecture design",
    "After completing significant work",
    "2+ failed fix attempts",
    "Unfamiliar code patterns",
    "Security/performance concerns",
    "Multi-system tradeoffs",
  ],
  avoidWhen: [
    "Simple file operations (use direct tools)",
    "First attempt at any fix (try yourself first)",
    "Questions answerable from code you've read",
    "Trivial decisions (variable names, formatting)",
    "Things you can infer from existing code patterns",
  ],
}

const METIS_METADATA: AgentPromptMetadata = {
  category: "advisor",
  cost: "EXPENSIVE",
  promptAlias: "Metis",
  keyTrigger: "Ambiguous or complex request → consult Metis before Prometheus",
  triggers: [
    {
      domain: "Pre-planning analysis",
      trigger: "Complex task requiring scope clarification, ambiguous requirements",
    },
  ],
  useWhen: [
    "Before planning non-trivial tasks",
    "When user request is ambiguous or open-ended",
    "To prevent AI over-engineering patterns",
  ],
  avoidWhen: [
    "Simple, well-defined tasks",
    "User has already provided detailed requirements",
  ],
}

const SISYPHUS_METADATA: AgentPromptMetadata = {
  category: "specialist",
  cost: "EXPENSIVE",
  promptAlias: "Sisyphus",
  triggers: [
    {
      domain: "Primary coding flow",
      trigger: "Default autonomous implementation and verification loop",
    },
  ],
  useWhen: ["Primary agent needs full OMO dynamic prompt assembly"],
  avoidWhen: ["Registry-only adapter cannot assemble host-bound Sisyphus prompts yet"],
}

const HEPHAESTUS_METADATA: AgentPromptMetadata = {
  category: "specialist",
  cost: "EXPENSIVE",
  promptAlias: "Hephaestus",
  keyTrigger: "Complex implementation task requiring autonomous deep work",
  triggers: [
    {
      domain: "Autonomous deep work",
      trigger: "End-to-end task completion without premature stopping",
    },
    {
      domain: "Complex implementation",
      trigger: "Multi-step implementation requiring thorough exploration",
    },
  ],
  useWhen: [
    "Task requires deep exploration before implementation",
    "User wants autonomous end-to-end completion",
    "Complex multi-file changes needed",
  ],
  avoidWhen: [
    "Simple single-step tasks",
    "Tasks requiring user confirmation at each step",
    "When orchestration across multiple agents is needed (use Atlas)",
  ],
}

const fullyPorted = <const T extends BuiltinAgentDefinition>(definition: T): T => definition
const deferred = <const T extends BuiltinAgentDefinition>(definition: T): T => definition

export const BUILTIN_AGENTS = {
  explore: fullyPorted({
    id: "explore",
    description:
      'Contextual grep for codebases. Answers "Where is X?", "Which file has Y?", "Find the code that does Z". Fire multiple in parallel for broad searches.',
    modelRequirementKey: "explore",
    category: "exploration",
    mode: "subagent",
    promptMode: "static-exploration",
    promptSections: [
      "identity",
      "mission",
      "intent-analysis",
      "parallel-execution",
      "structured-results",
      "tool-strategy",
    ],
    toolRestrictions: {
      deny: ["write", "edit", "apply_patch", "task", "call_omo_agent"],
      prefer: ["lsp_symbols", "lsp_goto_definition", "lsp_find_references", "lsp_diagnostics"],
    },
    metadata: EXPLORE_METADATA,
    portStatus: "full",
  }),
  "multimodal-looker": fullyPorted({
    id: "multimodal-looker",
    description:
      "Analyze media files (PDFs, images, diagrams) that require interpretation beyond raw text. Extracts specific information or summaries from documents and describes visual content.",
    modelRequirementKey: "multimodal-looker",
    category: "utility",
    mode: "subagent",
    promptMode: "static-utility",
    promptSections: [
      "identity",
      "attachment-analysis",
      "media-use-cases",
      "document-image-diagram-guidance",
      "response-rules",
    ],
    toolRestrictions: { allow: ["read"] },
    metadata: MULTIMODAL_LOOKER_METADATA,
    portStatus: "full",
  }),
  atlas: fullyPorted({
    id: "atlas",
    description:
      "Orchestrates work via task() to complete ALL tasks in a todo list until fully done.",
    modelRequirementKey: "atlas",
    category: "advisor",
    mode: "primary",
    promptMode: "dynamic-primary",
    promptSections: [
      "agent-identity",
      "category-section",
      "agent-selection-section",
      "decision-matrix",
      "skills-section",
      "category-skills-delegation-guide",
    ],
    toolRestrictions: {},
    metadata: ATLAS_METADATA,
    portStatus: "full",
  }),
  librarian: fullyPorted({
    id: "librarian",
    description:
      "Specialized codebase understanding agent for multi-repository analysis, official documentation, remote repositories, and implementation examples.",
    modelRequirementKey: "librarian",
    category: "exploration",
    mode: "subagent",
    promptMode: "static-exploration",
    promptSections: [
      "identity",
      "request-classification",
      "documentation-discovery",
      "evidence-synthesis",
      "tool-reference",
      "failure-recovery",
    ],
    toolRestrictions: {
      deny: ["write", "edit", "apply_patch", "task", "call_omo_agent"],
      prefer: ["context7", "webfetch", "grep_app", "gh"],
    },
    metadata: LIBRARIAN_METADATA,
    portStatus: "full",
  }),
  momus: fullyPorted({
    id: "momus",
    description:
      "Expert reviewer for evaluating work plans against clarity, verifiability, and completeness standards.",
    modelRequirementKey: "momus",
    category: "advisor",
    mode: "subagent",
    promptMode: "static-advisor",
    promptSections: [
      "input-validation",
      "plan-reread-rule",
      "reference-verification",
      "executability-check",
      "qa-scenario-executability",
      "verdict-format",
    ],
    toolRestrictions: { deny: ["write", "edit", "apply_patch"] },
    metadata: MOMUS_METADATA,
    portStatus: "full",
  }),
  oracle: deferred({
    id: "oracle",
    description:
      "Read-only consultation agent. High-IQ reasoning specialist for debugging hard problems and high-difficulty architecture design.",
    modelRequirementKey: "oracle",
    category: "advisor",
    mode: "subagent",
    promptMode: "deferred",
    promptSections: ["metadata-only"],
    toolRestrictions: { deny: ["write", "edit", "apply_patch", "task"] },
    metadata: ORACLE_METADATA,
    portStatus: "deferred",
    // DEFERRED: full port blocked by model-family prompt branching, OpenCode permission adapters, and Claude/GPT model settings assembly.
    deferredReason:
      "Full Oracle config needs model-family prompt branching, OpenCode permission adapters, and Claude/GPT model settings assembly.",
  }),
  metis: deferred({
    id: "metis",
    description:
      "Pre-planning consultant that analyzes requests to identify hidden intentions, ambiguities, and AI failure points.",
    modelRequirementKey: "metis",
    category: "advisor",
    mode: "subagent",
    promptMode: "deferred",
    promptSections: ["metadata-only"],
    toolRestrictions: { deny: ["write", "edit", "apply_patch"] },
    metadata: METIS_METADATA,
    portStatus: "deferred",
    // DEFERRED: full port blocked by Kimi-specific prompt branching, anti-duplication prompt assembly, and OpenCode permission adapters.
    deferredReason:
      "Full Metis config needs Kimi-specific prompt branching, anti-duplication prompt assembly, and OpenCode permission adapters.",
  }),
  sisyphus: deferred({
    id: "sisyphus",
    description:
      "Primary autonomous coding agent for OMO dynamic implementation and verification flow.",
    modelRequirementKey: "sisyphus",
    category: "specialist",
    mode: "primary",
    promptMode: "deferred",
    promptSections: ["metadata-only"],
    toolRestrictions: {},
    metadata: SISYPHUS_METADATA,
    portStatus: "deferred",
    // DEFERRED: full port blocked by host-bound sisyphus prompt builders, useTaskSystem wiring, available tool/category runtime assembly, and frontier tool schema permissions.
    deferredReason:
      "Full Sisyphus config needs host-bound prompt builders, useTaskSystem wiring, available tool/category runtime assembly, and frontier tool schema permissions.",
  }),
  hephaestus: deferred({
    id: "hephaestus",
    description:
      "Autonomous deep worker for end-to-end software engineering with GPT Codex-family models.",
    modelRequirementKey: "hephaestus",
    category: "specialist",
    mode: "primary",
    promptMode: "deferred",
    promptSections: ["metadata-only"],
    toolRestrictions: { deny: ["call_omo_agent"], allow: ["question"] },
    metadata: HEPHAESTUS_METADATA,
    portStatus: "deferred",
    // DEFERRED: full port blocked by GPT-only prompt builders, provider/model support gating, frontier tool schema permissions, and environment-context injection.
    deferredReason:
      "Full Hephaestus config needs GPT-only prompt builders, provider/model support gating, frontier tool schema permissions, and environment-context injection.",
  }),
} satisfies Readonly<Record<CuratedBuiltinAgentName, BuiltinAgentDefinition>>

export const BUILTIN_AGENT_NAMES = Object.keys(BUILTIN_AGENTS) as readonly CuratedBuiltinAgentName[]
