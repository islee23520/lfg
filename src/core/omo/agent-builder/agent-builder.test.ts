import { describe, expect, test } from "vitest"

import { buildAgent } from "./index"
import type {
  AgentConfig,
  AgentFactory,
  CategoriesConfig,
} from "./index"

describe("agent-builder", () => {
  test("buildAgent applies category model, temperature, and variant to factory output", () => {
    const createAgent = ((model: string): AgentConfig => ({
      category: "deep",
      prompt: `Use ${model} to inspect the problem.`,
      skills: ["lfg"],
    })) as AgentFactory
    createAgent.mode = "subagent"

    const categories: CategoriesConfig = {
      deep: {
        model: "xai/grok-4-heavy",
        temperature: 0.2,
        variant: "gpt",
      },
    }

    expect(buildAgent(createAgent, "xai/grok-4", categories)).toEqual({
      category: "deep",
      mode: "subagent",
      model: "xai/grok-4-heavy",
      prompt: "Use xai/grok-4 to inspect the problem.",
      skills: ["lfg"],
      temperature: 0.2,
      variant: "gpt",
    })
  })

  test("buildAgent applies category defaults to static config without mutating source", () => {
    const source: AgentConfig = {
      category: "quick",
      prompt: "Answer concisely.",
      mode: "primary",
    }
    const categories: CategoriesConfig = {
      quick: {
        model: "xai/grok-4-fast",
        temperature: 0.4,
        variant: "default",
      },
    }

    expect(buildAgent(source, "xai/grok-4", categories)).toEqual({
      category: "quick",
      mode: "primary",
      model: "xai/grok-4-fast",
      prompt: "Answer concisely.",
      temperature: 0.4,
      variant: "default",
    })
    expect(source).toEqual({
      category: "quick",
      mode: "primary",
      prompt: "Answer concisely.",
    })
  })

  test("buildAgent preserves explicit agent settings over category defaults", () => {
    const source: AgentConfig = {
      category: "deep",
      model: "xai/grok-4-user",
      prompt: "Use explicit settings.",
      temperature: 0.9,
      variant: "planner",
    }
    const categories: CategoriesConfig = {
      deep: {
        model: "xai/grok-4-heavy",
        temperature: 0.2,
        variant: "gpt",
      },
    }

    expect(buildAgent(source, "xai/grok-4", categories)).toEqual(source)
  })

  test("buildAgent ignores disabled categories", () => {
    const source: AgentConfig = {
      category: "disabled-category",
      prompt: "No category defaults.",
    }
    const categories: CategoriesConfig = {
      "disabled-category": {
        disable: true,
        model: "xai/grok-4-heavy",
        temperature: 0.2,
        variant: "gpt",
      },
    }

    expect(buildAgent(source, "xai/grok-4", categories)).toEqual(source)
  })
})
