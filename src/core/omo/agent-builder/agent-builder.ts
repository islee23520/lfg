import type {
  AgentConfig,
  AgentFactory,
  CategoriesConfig,
  CategoryConfig,
} from "./types"

export type AgentSource = AgentFactory | AgentConfig

export function isFactory(source: AgentSource): source is AgentFactory {
  return typeof source === "function"
}

/**
 * Merge default and user categories, filtering out disabled ones.
 *
 * Upstream also merges OpenCode builtin categories. lfg's Grok-neutral
 * foundation has no host-owned builtin category table yet, so this helper keeps
 * the host-neutral disabled-filtering behavior over the supplied categories.
 */
export function mergeCategories(
  categories?: CategoriesConfig,
): Record<string, CategoryConfig> {
  if (categories === undefined) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(categories).filter(([, config]) => !config.disable),
  )
}

export function buildAgent(
  source: AgentSource,
  model: string,
  categories?: CategoriesConfig,
): AgentConfig {
  const base = isFactory(source) ? source(model) : { ...source }
  const categoryConfigs = mergeCategories(categories)

  if (base.category) {
    const categoryConfig = categoryConfigs[base.category]
    if (categoryConfig) {
      if (!base.model) {
        base.model = categoryConfig.model
      }
      if (base.temperature === undefined && categoryConfig.temperature !== undefined) {
        base.temperature = categoryConfig.temperature
      }
      if (base.variant === undefined && categoryConfig.variant !== undefined) {
        base.variant = categoryConfig.variant
      }
    }
  }

  if (isFactory(source) && base.mode === undefined) {
    base.mode = source.mode
  }

  return base
}
