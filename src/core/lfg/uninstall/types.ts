export type UninstallPathKind = "file" | "directory"

export type UninstallPath = {
  readonly kind: UninstallPathKind
  readonly path: string
  readonly exists: boolean
}

export type UninstallOptions = {
  readonly home: string
  readonly cwd: string
  readonly dryRun: boolean
  readonly keepConfig: boolean
  readonly keepOverrides: boolean
  readonly purgeProjectOrchestrator: boolean
}

export type UninstallPlan = {
  readonly paths: readonly UninstallPath[]
  readonly configPath: string
  readonly overridePaths: readonly string[]
}

export type UninstallResult = {
  readonly ok: true
  readonly status: "uninstall_planned" | "uninstalled"
  readonly dryRun: boolean
  readonly paths: readonly UninstallPath[]
  readonly removed: readonly string[]
  readonly skipped: readonly string[]
  readonly kept: readonly string[]
  readonly lfgIsPlugin: false
}
