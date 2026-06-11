import { stdout as output } from "node:process"
import { INTERNAL_GROK_INSTALL_COMMAND } from "../grok-install/run-grok-install"
import type { JsonObject } from "./lfg-json"

const TOTAL_STEPS = 5

export function printInstallIntro(): void {
  output.write("oMoMoMoMo... lfg setup\n\n")
  output.write("Install the omo/lazycodex adapter for Grok Build.\n")
  output.write("Target: ~/.grok/installed-plugins/lfg as a real directory.\n")
  output.write("Codex-side npx lazycodex-ai install is not used.\n\n")
}

export function printStep(index: number, text: string): void {
  output.write(`[${index}/${TOTAL_STEPS}] ${text}\n`)
}

export function printInstallPlan(plan: JsonObject, hasModelDiscovery: boolean): void {
  const installPath = typeof plan.installPath === "string" ? plan.installPath : "grok"
  const command = typeof plan.installerCommand === "string" ? plan.installerCommand : INTERNAL_GROK_INSTALL_COMMAND
  printBox(
    [
      `Install path: ${installPath}`,
      `Installer: ${command}`,
      `Model config: ${hasModelDiscovery ? "auto-mapped from /v1/models" : "skipped unless discovered later"}`,
      "Writes: hooks, agents, overrides, lfg config, Grok plugin enablement",
    ].join("\n"),
    "Install Summary",
  )
}

export function printMagicWord(): void {
  printBox(
    "Include ultrawork (or ulw) in your prompt.\n" +
      "That unlocks deep exploration, parallel agents, background work,\n" +
      "and relentless execution until completion.",
    "The Magic Word",
  )
}

export function printCancelled(): void {
  output.write("\nInstallation cancelled. Nothing was changed.\n")
  output.write("Skipped install. Run again with: lfg setup\n")
  output.write("oMoMoMoMo... Bye!\n")
}

export function printCompleted(ok: boolean): void {
  output.write(ok ? "\nInstallation complete!\n" : "\nInstallation failed. See installer output above.\n")
  output.write(ok ? "oMoMoMoMo... Enjoy!\n" : "oMoMoMoMo... Check the logs and retry.\n")
}

function printBox(body: string, title: string): void {
  output.write(`\n${title}\n`)
  output.write(`${"─".repeat(title.length)}\n`)
  output.write(`${body}\n\n`)
}
