import { mkdir, unlink } from "node:fs/promises"
import { join } from "node:path"
import type { LazycodexAgentConfig, ReasoningLevel } from "../../cli/models/lfg-models"
import type { LazycodexAgentOverrideMap } from "../agents/lazycodex-agent-overrides"
import type { CodingToolAdapterId } from "../../shared/coding-tool-adapter"
import { lfgRuntimeConfigPath } from "../models/lfg-runtime-config"
export { applyLfgRuntimeConfigToAgentOverrides, lfgRuntimeConfigPath, readLfgRuntimeConfigFile } from "../models/lfg-runtime-config"

/**
 * Legacy filenames kept only for path helpers / migration awareness.
 * Settings are always owned by ~/.grok/config.toml — these JSON files are not written
 * and are deleted on every setup --run.
 */
export const LFG_CONFIG_FILENAME = "lfg-config.jsonc" as const
export const LFG_CONFIG_SCHEMA_FILENAME = "lfg-config.schema.json" as const

/** Retired settings files that must not remain under ~/.grok after setup. */
export const RETIRED_LFG_CONFIG_FILENAMES = [
  LFG_CONFIG_FILENAME,
  LFG_CONFIG_SCHEMA_FILENAME,
  "lfg.json",
] as const

export type LfgConfig = {
  readonly version?: 1
  readonly coding_tool_adapter?: "grok"
  readonly models?: {
    readonly default?: string
    readonly fast?: string
    readonly reasoning?: string
    readonly coding?: string
  }
  readonly agents?: Readonly<
    Record<
      string,
      {
        readonly model?: string
        readonly reasoning_level?: ReasoningLevel
        readonly enabled?: boolean
        readonly service_tier?: "default" | "fast"
        readonly model_fallback?: string
        readonly model_fallback_reasoning_effort?: ReasoningLevel
        readonly model_fallback_service_tier?: "default" | "fast"
      }
    >
  >
  readonly subagents?: {
    readonly disableBuiltins?: boolean
    readonly enabled?: readonly string[]
  }
}

export function lfgConfigPath(home: string): string {
  return join(home, ".grok", LFG_CONFIG_FILENAME)
}

export function lfgConfigSchemaPath(home: string): string {
  return join(home, ".grok", LFG_CONFIG_SCHEMA_FILENAME)
}

/** Absolute paths of retired JSON settings files under ~/.grok. */
export function retiredLfgConfigPaths(home: string): readonly string[] {
  return [
    lfgConfigPath(home),
    lfgConfigSchemaPath(home),
    lfgRuntimeConfigPath(home),
  ]
}

/** @deprecated JSONC settings are unused; always returns null. Prefer config.toml [omo.agents.*]. */
export async function readLfgConfigFile(_home: string): Promise<LfgConfig | null> {
  return null
}

/**
 * Settings surface is ~/.grok/config.toml only.
 * Deletes retired lfg.json / lfg-config.jsonc / lfg-config.schema.json if present.
 * Returns the canonical config.toml path so install JSON still exposes a settings path.
 */
export async function ensureLfgConfigFiles(
  home: string,
  _seed: LazycodexAgentOverrideMap,
  _codingToolAdapter: CodingToolAdapterId = "grok",
): Promise<{
  readonly configPath: string
  readonly schemaPath: string | null
  readonly runtimeConfigPath: string | null
  readonly removedRetiredPaths: readonly string[]
}> {
  await mkdir(join(home, ".grok"), { recursive: true })
  const removedRetiredPaths = await removeRetiredLfgConfigFiles(home)
  return {
    configPath: join(home, ".grok", "config.toml"),
    schemaPath: null,
    runtimeConfigPath: null,
    removedRetiredPaths,
  }
}

/** Delete retired JSON settings files. Idempotent; missing files are ignored. */
export async function removeRetiredLfgConfigFiles(home: string): Promise<readonly string[]> {
  const removed: string[] = []
  for (const path of retiredLfgConfigPaths(home)) {
    try {
      await unlink(path)
      removed.push(path)
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  }
  return removed
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT"
}

/** No-op: JSONC agent routes are retired; config.toml is the sole settings surface. */
export function applyLfgConfigToAgentOverrides(
  base: LazycodexAgentOverrideMap,
  _roleConfig: LazycodexAgentConfig,
  _config: LfgConfig | null,
): LazycodexAgentOverrideMap {
  return base
}
