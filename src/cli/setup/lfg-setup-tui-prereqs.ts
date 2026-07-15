/**
 * Setup TUI: check topology CLIs, guide OS-valid install, show step progress
 * on the top-layer spinner.
 */
import type {
  InstallRecipe,
  InstallRunner,
  InstallToolResult,
  PrereqReport,
  ToolProbe,
} from "../../core/lfg/prereqs/codex-lazycodex"
import {
  installPrereqTool,
  probeCodexLazyCodexPrereqs,
  prereqReportJson,
} from "../../core/lfg/prereqs/codex-lazycodex"

export type PrereqTuiPrompts = {
  readonly note: (message: string, title?: string) => void
  readonly confirm: (options: { readonly message: string; readonly initialValue?: boolean }) => Promise<unknown>
  readonly select?: (options: {
    readonly message: string
    readonly options: readonly { readonly value: string; readonly label: string; readonly hint?: string }[]
    readonly initialValue?: string
  }) => Promise<unknown>
  readonly isCancel: (value: unknown) => boolean
  readonly cancel: (message: string) => void
  readonly spinner?: () => {
    start: (message?: string) => void
    message: (message?: string) => void
    stop: (message?: string) => void
  }
  readonly log?: {
    step?: (message: string) => void
    info?: (message: string) => void
    success?: (message: string) => void
    warn?: (message: string) => void
  }
}

export type EnsurePrereqsTuiOptions = {
  readonly prompts: PrereqTuiPrompts
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly platform?: NodeJS.Platform
  readonly home?: string
  /** Inject install runner in tests (never hit network). */
  readonly installRunner?: InstallRunner
  /** Inject probe in tests. */
  readonly probe?: () => Promise<PrereqReport>
  /** When true, cancel setup if still missing after optional installs. Default true. */
  readonly requireReady?: boolean
}

export type EnsurePrereqsTuiResult = {
  readonly ok: boolean
  readonly status: "ready" | "skipped_missing" | "cancelled" | "still_missing"
  readonly report: PrereqReport
  readonly installs: readonly InstallToolResult[]
  readonly steps: readonly string[]
}

type SpinnerHandle = {
  start: (message?: string) => void
  message: (message?: string) => void
  stop: (message?: string) => void
}

/**
 * Early setup gate: probe Codex, offer OS-valid install recipes,
 * show each step on the TUI top-layer spinner.
 */
export async function ensureCodexLazyCodexPrereqsInTui(
  options: EnsurePrereqsTuiOptions,
): Promise<EnsurePrereqsTuiResult> {
  const prompts = options.prompts
  const steps: string[] = []
  const installs: InstallToolResult[] = []
  const requireReady = options.requireReady !== false
  const spinner = createSpinner(prompts)

  const total = 6
  const setStep = (n: number, label: string) => {
    const text = `Step ${n}/${total}: ${label}`
    steps.push(text)
    spinner.message(text)
    prompts.log?.step?.(text)
  }

  spinner.start(`Step 1/${total}: Checking Codex CLI + gjc + agy…`)
  setStep(1, "Checking Codex CLI + gjc + agy")

  let report =
    options.probe !== undefined
      ? await options.probe()
      : await probeCodexLazyCodexPrereqs({
          env: options.env,
          platform: options.platform,
          home: options.home,
        })

  spinner.stop(
    report.ok
      ? "Topology prerequisites ready"
      : `Prerequisites missing: ${report.missing.join(", ")}`,
  )

  prompts.note(formatPrereqNote(report), "Topology prerequisites")

  if (report.ok && report.recommendedMissing.length === 0) {
    prompts.log?.success?.("Codex, gjc, and agy are installed.")
    return { ok: true, status: "ready", report, installs, steps }
  }

  // --- Codex ---
  if (!report.codex.ok) {
    setStep(2, "Codex CLI missing — choose install")
    spinner.start(`Step 2/${total}: Codex CLI install…`)
    const want = await prompts.confirm({
      message: `Codex CLI is required for lfg handoff. Install now for ${report.platform}?`,
      initialValue: true,
    })
    if (prompts.isCancel(want)) {
      spinner.stop("Cancelled")
      prompts.cancel("lfg setup cancelled.")
      return { ok: false, status: "cancelled", report, installs, steps }
    }
    if (want === true) {
      const recipe = await pickRecipe(prompts, report.codex)
      if (recipe === null) {
        spinner.stop("Cancelled")
        prompts.cancel("lfg setup cancelled.")
        return { ok: false, status: "cancelled", report, installs, steps }
      }
      prompts.note(
        [`Platform: ${report.platform}`, `Recipe: ${recipe.label}`, `Run: ${recipe.shellHint}`, `Docs: ${recipe.docsUrl}`].join("\n"),
        "Codex install",
      )
      spinner.message(`Step 2/${total}: Installing Codex (${recipe.id})…`)
      const result = await installPrereqTool("codex", {
        platform: options.platform,
        env: options.env,
        recipeId: recipe.id,
        runner: options.installRunner,
      })
      installs.push(result)
      spinner.stop(result.ok ? "Codex install finished" : `Codex install failed: ${result.error ?? "unknown"}`)
      if (!result.ok) {
        prompts.note(
          [result.error ?? "install failed", result.stderr.slice(0, 400), `Manual: ${recipe.shellHint}`].filter(Boolean).join("\n"),
          "Codex install error",
        )
      }
    } else {
      spinner.stop("Skipped Codex install")
      prompts.note(formatRecipesHelp(report.codex), "Install Codex manually")
    }
  } else {
    setStep(2, "Codex CLI already ready")
    spinner.start(`Step 2/${total}: Codex CLI…`)
    spinner.stop("Codex CLI ready")
  }

  setStep(3, "Re-checking required Codex CLI")
  spinner.start(`Step 3/${total}: Re-checking Codex CLI…`)
  report =
    options.probe !== undefined
      ? await options.probe()
      : await probeCodexLazyCodexPrereqs({
          env: options.env,
          platform: options.platform,
          home: options.home,
        })

  if (!report.codex.ok) {
    spinner.stop("Codex CLI is still missing")
    prompts.cancel("Codex CLI is required before lfg setup. Install it, then re-run lfg setup.")
    return { ok: false, status: "still_missing", report, installs, steps }
  }
  spinner.stop("Codex CLI ready")

  // --- gjc intent gateway ---
  setStep(4, "Checking gjc intent gateway")
  spinner.start(`Step 4/${total}: Gajae-Code intent gateway…`)
  report =
    options.probe !== undefined
      ? await options.probe()
      : await probeCodexLazyCodexPrereqs({
          env: options.env,
          platform: options.platform,
          home: options.home,
        })

  if (!report.gjc.ok) {
    spinner.message(`Step 4/${total}: gjc missing — choose install`)
    const want = await prompts.confirm({
      message: "Gajae-Code CLI (gjc) is recommended as the fail-open intent gateway. Install now?",
      initialValue: true,
    })
    if (prompts.isCancel(want)) {
      spinner.stop("Skipped recommended gjc install")
      prompts.log?.warn?.("gjc was skipped; setup will continue fail-open.")
    } else if (want === true) {
      const recipe = await pickRecipe(prompts, report.gjc)
      if (recipe === null) {
        spinner.stop("Skipped recommended gjc install")
        prompts.log?.warn?.("gjc install selection was skipped; setup will continue fail-open.")
      } else {
        prompts.note(
          [`Platform: ${report.platform}`, `Recipe: ${recipe.label}`, `Run: ${recipe.shellHint}`, `Docs: ${recipe.docsUrl}`].join("\n"),
          "gjc install",
        )
        spinner.message(`Step 4/${total}: Installing gjc (${recipe.id})…`)
        const result = await installPrereqTool("gjc", {
          platform: options.platform,
          env: options.env,
          recipeId: recipe.id,
          runner: options.installRunner,
        })
        installs.push(result)
        spinner.stop(result.ok ? "gjc install finished" : `gjc install failed: ${result.error ?? "unknown"}`)
        if (!result.ok) {
          prompts.note(
            [result.error ?? "install failed", result.stderr.slice(0, 400), `Manual: ${recipe.shellHint}`].filter(Boolean).join("\n"),
            "gjc install error",
          )
        }
      }
    } else {
      spinner.stop("Skipped gjc install")
      prompts.note(formatRecipesHelp(report.gjc), "Install gjc manually")
    }
  } else {
    spinner.stop("gjc ready")
  }

  setStep(5, "Checking optional agy vision confirmation")
  spinner.start(`Step 5/${total}: Antigravity vision confirmation…`)
  report = options.probe !== undefined ? await options.probe() : await probeCodexLazyCodexPrereqs({ env: options.env, platform: options.platform, home: options.home })
  if (!report.agy.ok) {
    const want = await prompts.confirm({
      message: "Antigravity CLI (agy) is optional for independent vision confirmation. Show install guidance?",
      initialValue: false,
    })
    if (prompts.isCancel(want) || want !== true) {
      spinner.stop("Skipped optional agy check")
    } else {
      prompts.note("Install Antigravity CLI (agy) using its official distribution, then ensure `agy` is on PATH.", "Optional agy vision confirmation")
      spinner.stop("agy remains optional")
    }
  } else {
    spinner.stop("agy ready")
  }

  // --- Final re-probe ---
  setStep(6, "Re-checking prerequisites")
  spinner.start(`Step 6/${total}: Re-checking topology CLIs…`)
  report =
    options.probe !== undefined
      ? await options.probe()
      : await probeCodexLazyCodexPrereqs({
          env: options.env,
          platform: options.platform,
          home: options.home,
        })
  spinner.stop(report.ok ? "All prerequisites ready" : `Still missing: ${report.missing.join(", ")}`)
  prompts.note(formatPrereqNote(report), "Prerequisite check result")

  if (report.ok) {
    prompts.log?.success?.("Required Codex CLI prerequisite is ready.")
    return { ok: true, status: "ready", report, installs, steps }
  }

  if (requireReady) {
    prompts.cancel("Codex CLI is required before lfg setup. Install it, then re-run lfg setup.")
    return { ok: false, status: "still_missing", report, installs, steps }
  }
  return { ok: false, status: "skipped_missing", report, installs, steps }
}

export function formatPrereqNote(report: PrereqReport): string {
  return [
    `Platform: ${report.platform}`,
    `Overall: ${report.ok ? "ready" : "missing"}`,
    `Codex: ${report.codex.status} — ${report.codex.detail}`,
    `gjc (recommended): ${report.gjc.status} — ${report.gjc.detail}`,
    `agy (optional vision): ${report.agy.status} — ${report.agy.detail}`,
    report.missing.length > 0 ? `Missing: ${report.missing.join(", ")}` : "Missing: none",
    report.recommendedMissing.length > 0 ? `Recommended missing: ${report.recommendedMissing.join(", ")}` : "Recommended missing: none",
  ].join("\n")
}

export function prereqsForJson(report: PrereqReport): Record<string, unknown> {
  return prereqReportJson(report)
}

function formatRecipesHelp(probe: ToolProbe): string {
  return [
    probe.detail,
    "",
    "OS-valid install options:",
    ...probe.recipes.map((r, i) => `${i + 1}. ${r.label}\n   ${r.shellHint}\n   ${r.docsUrl}`),
  ].join("\n")
}

async function pickRecipe(prompts: PrereqTuiPrompts, probe: ToolProbe): Promise<InstallRecipe | null> {
  if (probe.recipes.length === 0) return null
  if (probe.recipes.length === 1 || typeof prompts.select !== "function") {
    return probe.recipes[0] ?? null
  }
  const value = await prompts.select({
    message: `Choose ${probe.id} install method`,
    initialValue: probe.recipes[0]!.id,
    options: probe.recipes.map((r) => ({
      value: r.id,
      label: r.label,
      hint: r.shellHint,
    })),
  })
  if (prompts.isCancel(value)) return null
  const id = String(value)
  return probe.recipes.find((r) => r.id === id) ?? probe.recipes[0] ?? null
}

function createSpinner(prompts: PrereqTuiPrompts): SpinnerHandle {
  if (typeof prompts.spinner === "function") {
    return prompts.spinner()
  }
  // Fallback: note-based progress when spinner is unavailable (tests / non-clack).
  return {
    start: (message) => {
      if (message) prompts.note(message, "Progress")
    },
    message: (message) => {
      if (message) prompts.note(message, "Progress")
    },
    stop: (message) => {
      if (message) prompts.note(message, "Progress")
    },
  }
}
