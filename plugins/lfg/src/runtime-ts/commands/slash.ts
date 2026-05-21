import { createLfgTypescriptRuntime } from "../index"
import { parseArgs, utcNow, type CommandContext, type JsonRecord } from "./common"

export async function slashCommand(argv: string[], context: CommandContext = {}): Promise<JsonRecord> {
  const parsed = parseArgs(argv)
  const raw = parsed.positional.join(" ").trim()
  if (!raw.startsWith("/")) return { ok: false, command: "slash", error: "usage: slash '/command args'" }
  const runtime = createLfgTypescriptRuntime()
  const sessionID = `slash-${utcNow(context.now).replace(/[^A-Za-z0-9]/g, "")}`
  await runtime.submitUserMessage({ sessionID, text: raw })
  await runtime.emitIdle(sessionID)
  return {
    ok: true,
    command: "slash",
    route: "runtime",
    input: raw,
    slashCommand: raw.slice(1).split(/\s+/, 1)[0] ?? "",
    sessionID,
    dispatchedPrompts: runtime.dispatchedPrompts.map((prompt) => ({ sessionID: prompt.sessionID, message: prompt.message, agentName: prompt.agentName ?? null, modelID: prompt.modelID ?? null })),
    messageCount: runtime.readMessages(sessionID).length,
    evidence: "slash-runtime-route=ok",
  }
}
