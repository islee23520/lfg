import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { getPlanChecklist, type PlanChecklist } from "./vendor/boulder-state-vendored"
import {
  resolveModelForDelegateTask,
  type DelegateFallbackEntry,
  type DelegateModelResolutionDeps,
  type DelegateModelResolutionInput,
  type DelegateModelResolutionResult,
} from "./vendor/delegate-core-vendored"
import type { GrokModelCatalog, GrokModelCatalogInput } from "../models/grok-model-adapter"
import { buildGrokModelCatalog } from "../models/grok-model-adapter"

export type GrokDelegateFallbackEntry = DelegateFallbackEntry
export type GrokDelegateModelResolutionResult = DelegateModelResolutionResult
export type GrokPlanChecklist = PlanChecklist

export interface GrokDelegateModelResolutionInput {
  readonly catalog?: GrokModelCatalog
  readonly catalogInput?: GrokModelCatalogInput
  readonly userModel?: string
  readonly userFallbackModels?: readonly string[]
  readonly categoryDefaultModel?: string
  readonly isUserConfiguredCategoryModel?: boolean
  readonly fallbackChain?: readonly GrokDelegateFallbackEntry[]
  readonly systemDefaultModel?: string
  readonly log?: (message: string, metadata?: Record<string, unknown>) => void
}

export interface GrokDelegatePlanInput {
  /** Project root containing `.omo/`; defaults to the current process directory. */
  readonly projectRoot?: string
  /** Plan slug under `.omo/plans`, with or without the `.md` suffix. */
  readonly planSlug: string
}

export interface ToggleGrokPlanChecklistItemInput extends GrokDelegatePlanInput {
  /** Checkbox body after `- [ ] ` or `- [x]`, e.g. `1. Implement adapter`. */
  readonly label: string
  readonly checked: boolean
}

export interface ToggleGrokPlanChecklistItemResult {
  readonly checklist: GrokPlanChecklist
  readonly changed: boolean
  readonly planPath: string
}

const DEFAULT_GROK_DELEGATE_MODEL = "xai/grok-4"
const TODO_HEADING = "TODOs"
const FINAL_VERIFICATION_HEADING = "Final Verification Wave"
const CHECKBOX_LINE_PATTERN = /^(?<prefix>- \[)(?<mark>[ xX])(?<suffix>\] )(?<label>.*)$/

/**
 * Resolve a delegate-task model using delegate-core, projecting Grok's model
 * catalog into the core's available-model and connected-provider inputs.
 */
export function resolveModelForGrokDelegateTask(input: GrokDelegateModelResolutionInput): GrokDelegateModelResolutionResult {
  const catalog = input.catalog ?? buildGrokModelCatalog(input.catalogInput ?? { modelIds: [] })
  const coreInput: DelegateModelResolutionInput = {
    userModel: input.userModel,
    userFallbackModels: input.userFallbackModels,
    categoryDefaultModel: input.categoryDefaultModel,
    isUserConfiguredCategoryModel: input.isUserConfiguredCategoryModel,
    fallbackChain: input.fallbackChain,
    availableModels: catalog.availableModels,
    systemDefaultModel: input.systemDefaultModel ?? DEFAULT_GROK_DELEGATE_MODEL,
  }
  const deps: DelegateModelResolutionDeps = {
    connectedProviders: catalog.connectedProviders,
    hasProviderModelsCache: catalog.availableModels.size > 0,
    hasConnectedProvidersCache: catalog.connectedProviders.length > 0,
    log: input.log,
  }

  return resolveModelForDelegateTask(coreInput, deps)
}

/** Resolve a Grok delegate plan slug to the project-local `.omo/plans/<slug>.md`. */
export function resolveGrokDelegatePlanPath(input: GrokDelegatePlanInput): string {
  const slug = input.planSlug.endsWith(".md") ? input.planSlug : `${input.planSlug}.md`
  return join(input.projectRoot ?? process.cwd(), ".omo", "plans", slug)
}

/** Read checklist progress from a project-local `.omo/plans/<slug>.md` plan. */
export function getGrokPlanChecklist(input: GrokDelegatePlanInput): GrokPlanChecklist {
  return getPlanChecklist(resolveGrokDelegatePlanPath(input))
}

/**
 * Toggle one top-level checkbox in `.omo/plans/<slug>.md`, then return the
 * vendored boulder-state checklist projection for the updated plan.
 */
export function toggleGrokPlanChecklistItem(input: ToggleGrokPlanChecklistItemInput): ToggleGrokPlanChecklistItemResult {
  const planPath = resolveGrokDelegatePlanPath(input)
  if (!existsSync(planPath)) {
    return { checklist: getPlanChecklist(planPath), changed: false, planPath }
  }

  const original = readFileSync(planPath, "utf-8")
  const updated = toggleChecklistMarkdown(original, input.label, input.checked)
  const changed = updated !== original
  if (changed) {
    writeFileSync(planPath, updated, "utf-8")
  }

  return { checklist: getPlanChecklist(planPath), changed, planPath }
}

function toggleChecklistMarkdown(markdown: string, label: string, checked: boolean): string {
  const lines = markdown.split(/\r?\n/)
  const hasCountedSections = lines.some((line) => isCountedHeading(parseLevelTwoHeading(line)))
  let isCountedSection = !hasCountedSections

  return lines.map((line) => {
    const heading = parseLevelTwoHeading(line)
    if (heading !== null) {
      isCountedSection = isCountedHeading(heading)
      return line
    }

    if (!isCountedSection) {
      return line
    }

    const match = line.match(CHECKBOX_LINE_PATTERN)
    const groups = match?.groups
    if (!groups || groups.label !== label) {
      return line
    }

    return `${groups.prefix}${checked ? "x" : " "}${groups.suffix}${groups.label}`
  }).join("\n")
}

function parseLevelTwoHeading(line: string): string | null {
  if (!line.startsWith("## ")) {
    return null
  }
  return line.slice("## ".length).trim()
}

function isCountedHeading(heading: string | null): boolean {
  return heading === TODO_HEADING || heading === FINAL_VERIFICATION_HEADING
}
