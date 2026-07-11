import { describe, expect, test } from "vitest"
import { parseOmoProviders } from "./read-omo-providers-from-config"

describe("parseOmoProviders", () => {
  test("parses multiple providers with base_url + credential variants", () => {
    const source = [
      "[omo.providers.openai]",
      'base_url = "https://api.openai.com/v1"',
      'env_key = "OPENAI_API_KEY"',
      "",
      "[omo.providers.anthropic]",
      'base_url = "https://api.anthropic.com/v1"',
      'api_key = "sk-ant-test"',
      "",
      "[omo.providers.bare]",
      'base_url = "https://bare.example.com/v1"',
      "",
      "[other.section]",
      'irrelevant = true',
    ].join("\n")

    const providers = parseOmoProviders(source)
    expect(providers).toHaveLength(3)
    expect(providers[0]).toEqual({ id: "openai", baseUrl: "https://api.openai.com/v1", envKey: "OPENAI_API_KEY" })
    expect(providers[1]).toEqual({ id: "anthropic", baseUrl: "https://api.anthropic.com/v1", apiKey: "sk-ant-test" })
    expect(providers[2]).toEqual({ id: "bare", baseUrl: "https://bare.example.com/v1" })
  })

  test("skips provider sections that lack a base_url", () => {
    const source = '[omo.providers.nokey]\nenv_key = "X"\n'
    expect(parseOmoProviders(source)).toEqual([])
  })

  test("returns empty when no provider sections exist", () => {
    expect(parseOmoProviders("[endpoints]\nmodels_base_url = \"http://x/v1\"\n")).toEqual([])
  })
})
