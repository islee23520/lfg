import { stdout as output } from "node:process"
import { INTERNAL_GROK_INSTALL_COMMAND } from "../../grok/install/run-grok-install"
import type { JsonObject } from "../../shared/json"

const TOTAL_STEPS = 5

export function printInstallIntro(): void {
  output.write("oMoMoMoMo... lfg setup\n\n")
  output.write("Install lfg: Sisyphus CEO on Grok, implementer on Codex App.\n")
  output.write("Target: ~/.grok/plugins/lfg as a real directory.\n\n")
}

export function printStep(index: number, text: string): void {
  output.write(`[${index}/${TOTAL_STEPS}] ${text}\n`)
}

export function printInstallPlan(plan: JsonObject, modelConfigLabel: string): void {
  const installPath = typeof plan.installPath === "string" ? plan.installPath : "grok"
  const command = typeof plan.installerCommand === "string" ? plan.installerCommand : INTERNAL_GROK_INSTALL_COMMAND
  printBox(
    [
      `Install path: ${installPath}`,
      `Installer: ${command}`,
      `Model config: ${modelConfigLabel}`,
      "Writes: hooks, Sisyphus-only agent, thin plugins, lfg-backend-routing.json",
    ].join("\n"),
    "Install Summary",
  )
}

export function printMagicWord(): void {
  printBox(
    "Include ultrawork (or ulw) in your prompt.\n" +
      "That drives deep Codex App execution until completion.\n" +
      "Grok stays CEO; product work is not self-implemented in-host.",
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
