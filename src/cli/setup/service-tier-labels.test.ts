import { describe, expect, test } from "vitest"
import { SERVICE_TIERS as TUI_SERVICE_TIERS, createSetupSelectors } from "./lfg-setup-tui-selectors"
import { SERVICE_TIERS as PROMPT_SERVICE_TIERS, promptForServiceTier } from "./model-config-prompts"

describe("Grok-adapted service tier labels", () => {
  test("TUI SERVICE_TIERS labels state model-id routing (not Codex host service_tier)", () => {
    const labels = TUI_SERVICE_TIERS.map((tier) => tier.label).join(" | ")
    expect(labels.toLowerCase()).toMatch(/model id/)
    const fast = TUI_SERVICE_TIERS.find((tier) => tier.value === "fast")
    expect(fast?.label.toLowerCase()).toMatch(/fast/)
    expect(fast?.label.toLowerCase()).toMatch(/model id|catalog id/)
  })

  test("prompt SERVICE_TIERS labels state model-id routing", () => {
    const labels = PROMPT_SERVICE_TIERS.map((tier) => tier.label).join(" | ")
    expect(labels.toLowerCase()).toMatch(/model id/)
    const fast = PROMPT_SERVICE_TIERS.find((tier) => tier.value === "fast")
    expect(fast?.label.toLowerCase()).toMatch(/fast/)
    expect(fast?.label.toLowerCase()).toMatch(/model id|catalog id/)
  })

  test("tierSelector message documents Grok model-id routing", async () => {
    const messages: string[] = []
    const prompts = {
      select: async (spec: { message: string; options: readonly { value: string; label: string }[] }) => {
        messages.push(spec.message)
        return spec.options[0]?.value ?? "default"
      },
      isCancel: () => false,
      cancel: () => undefined,
    }
    const selectors = createSetupSelectors(prompts as never)
    await selectors.tierSelector({ agentName: "explorer", current: "default" })
    const joined = messages.join("\n").toLowerCase()
    expect(joined).toMatch(/model id|model-id|routes by model/)
    expect(joined).toMatch(/grok/)
  })

  test("promptForServiceTier question documents model-id routing", async () => {
    const questions: string[] = []
    const rl = {
      question: async (q: string) => {
        questions.push(q)
        return ""
      },
    }
    await promptForServiceTier(rl, { current: "default" })
    const joined = questions.join("\n").toLowerCase()
    expect(joined).toMatch(/model id|model-id|routes by model/)
  })
})
