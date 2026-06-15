import { describe, expect, test } from "vitest"

import {
  defaultTierPromptForAgent,
  resolveDefaultModelId,
  resolveFastModelId,
  resolveModelForServiceTier,
  serviceTierFromChoice,
} from "./resolve-tier-model"

describe("resolve-tier-model", () => {
  const ids = ["grok-3-mini", "grok-3-mini-fast", "gpt-4.1-mini", "openai/gpt-4.1-mini"]

  test("serviceTierFromChoice", () => {
    expect(serviceTierFromChoice("fast")).toBe("fast")
    expect(serviceTierFromChoice("default")).toBe("default")
    expect(serviceTierFromChoice("other")).toBe("default")
  })

  test("defaultTierPromptForAgent", () => {
    expect(defaultTierPromptForAgent("explorer")).toBe("fast")
    expect(defaultTierPromptForAgent("librarian")).toBe("fast")
    expect(defaultTierPromptForAgent("plan")).toBe("default")
  })

  test("resolveFastModelId adds -fast suffix sibling", () => {
    expect(resolveFastModelId(ids, "grok-3-mini")).toBe("grok-3-mini-fast")
    expect(resolveFastModelId(ids, "grok-3-mini-fast")).toBe("grok-3-mini-fast")
    expect(resolveFastModelId(ids, "gpt-4.1-mini", "grok-3-mini-fast")).toBe("grok-3-mini-fast")
  })

  test("resolveDefaultModelId strips -fast when non-fast id exists", () => {
    expect(resolveDefaultModelId(ids, "grok-3-mini-fast")).toBe("grok-3-mini")
    expect(resolveDefaultModelId(ids, "grok-3-mini")).toBe("grok-3-mini")
  })

  test("resolveModelForServiceTier", () => {
    expect(resolveModelForServiceTier(ids, "grok-3-mini", "fast")).toBe("grok-3-mini-fast")
    expect(resolveModelForServiceTier(ids, "grok-3-mini-fast", "default")).toBe("grok-3-mini")
  })
})