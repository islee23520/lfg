import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import {
  detectLocalCliProxyCredentials,
  fingerprintApiKey,
  resolveLocalCliProxyCredentials,
} from "./xai-cli-proxy-credentials"

describe("local CLI proxy auto-detection algorithm", () => {
  const homes: string[] = []

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
  })

  test("phases run collect → normalize → score → probe → select", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-proxy-phases-"))
    homes.push(home)
    await mkdir(join(home, ".codex"), { recursive: true })
    await writeFile(
      join(home, ".codex", "config.toml"),
      [
        'model_provider = "9router"',
        "",
        "[model_providers.9router]",
        'base_url = "http://127.0.0.1:20128/v1"',
        'experimental_bearer_token = "sk-9router"',
        "",
      ].join("\n"),
      "utf8",
    )

    const report = await detectLocalCliProxyCredentials(
      { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" },
      {
        home,
        probe: true,
        fetchImpl: (async () => new Response("{}", { status: 200 })) as typeof fetch,
      },
    )

    expect(report.algorithm).toBe("lfg-xai-cli-proxy-detect/v1")
    expect(report.phases).toEqual(["collect", "normalize", "score", "probe", "select"])
    expect(report.ok).toBe(true)
    expect(report.selected?.source).toBe("codex:model_providers.9router")
    expect(report.selected?.baseUrl).toBe("http://127.0.0.1:20128/v1")
    expect(report.selected?.sourceClass).toBe("codex_active")
    expect(report.selected?.keyFingerprint).toBe(fingerprintApiKey("sk-9router"))
    expect(report.selected?.probe?.live).toBe(true)
    expect(report.traces.some((t) => t.phase === "collect")).toBe(true)
    expect(report.traces.some((t) => t.phase === "normalize")).toBe(true)
    expect(report.traces.some((t) => t.phase === "score")).toBe(true)
    expect(report.traces.some((t) => t.phase === "probe")).toBe(true)
    expect(report.traces.some((t) => t.phase === "select")).toBe(true)
  })

  test("prefers live candidate over higher-score dead one", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-proxy-live-"))
    homes.push(home)
    // env key scores highest (100) but will probe dead
    // codex 9router lower tier but live
    await mkdir(join(home, ".codex"), { recursive: true })
    await writeFile(
      join(home, ".codex", "config.toml"),
      [
        'model_provider = "9router"',
        "",
        "[model_providers.9router]",
        'base_url = "http://127.0.0.1:20128/v1"',
        'experimental_bearer_token = "sk-live-router"',
        "",
      ].join("\n"),
      "utf8",
    )

    const report = await detectLocalCliProxyCredentials(
      { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1", XAI_API_KEY: "sk-env-dead" },
      {
        home,
        preferredBaseUrl: "http://127.0.0.1:9999/v1",
        probe: true,
        fetchImpl: (async (input: string | URL) => {
          const url = String(input)
          if (url.includes("20128")) return new Response("{}", { status: 200 })
          throw new Error("connection refused")
        }) as typeof fetch,
      },
    )

    expect(report.selected?.baseUrl).toBe("http://127.0.0.1:20128/v1")
    expect(report.selected?.source).toBe("codex:model_providers.9router")
    expect(report.selected?.probe?.live).toBe(true)
  })

  test("resolveLocalCliProxyCredentials returns selected only", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-proxy-resolve-"))
    homes.push(home)
    await mkdir(join(home, ".config", "opencode", "cliproxy"), { recursive: true })
    await writeFile(
      join(home, ".config", "opencode", "cliproxy", "auth.json"),
      JSON.stringify({ apiKey: "sk-opencode-cliproxy" }),
      "utf8",
    )
    const cred = await resolveLocalCliProxyCredentials(
      { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" },
      {
        home,
        probe: false,
      },
    )
    expect(cred).toMatchObject({
      apiKey: "sk-opencode-cliproxy",
      baseUrl: "http://127.0.0.1:8317/v1",
      source: "opencode:cliproxy/auth.json",
      sourceClass: "opencode",
    })
    expect(typeof cred?.score).toBe("number")
  })

  test("dedupes same baseUrl+key across sources", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-proxy-dedupe-"))
    homes.push(home)
    await mkdir(join(home, ".codex"), { recursive: true })
    await mkdir(join(home, ".grok"), { recursive: true })
    const key = "sk-same-key"
    await writeFile(
      join(home, ".codex", "config.toml"),
      [
        'model_provider = "cliproxyapi"',
        "",
        "[model_providers.cliproxyapi]",
        'base_url = "http://127.0.0.1:8317/v1"',
        `experimental_bearer_token = "${key}"`,
        "",
      ].join("\n"),
      "utf8",
    )
    await writeFile(
      join(home, ".grok", "config.toml"),
      [
        "[model.grok-build]",
        'base_url = "http://127.0.0.1:8317/v1"',
        `api_key = "${key}"`,
        "",
      ].join("\n"),
      "utf8",
    )

    const report = await detectLocalCliProxyCredentials(
      { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" },
      { home, probe: false },
    )
    const sameFp = report.candidates.filter((c) => c.keyFingerprint === fingerprintApiKey(key))
    // One kept after normalize dedupe for that base+key pair
    expect(sameFp.length).toBe(1)
    expect(report.selected?.sourceClass).toBe("codex_active")
  })

  test("scores active codex provider above inactive known family", async () => {
    const home = await mkdtemp(join(tmpdir(), "lfg-proxy-score-"))
    homes.push(home)
    await mkdir(join(home, ".codex"), { recursive: true })
    await writeFile(
      join(home, ".codex", "config.toml"),
      [
        'model_provider = "cliproxyapi"',
        "",
        "[model_providers.cliproxyapi]",
        'base_url = "http://127.0.0.1:8317/v1"',
        'experimental_bearer_token = "sk-active"',
        "",
        "[model_providers.9router]",
        'base_url = "http://127.0.0.1:20128/v1"',
        'experimental_bearer_token = "sk-family"',
        "",
      ].join("\n"),
      "utf8",
    )

    const report = await detectLocalCliProxyCredentials(
      { HOME: home, LFG_ALLOW_TEST_GROK_HOME: "1" },
      {
        home,
        probe: false,
      },
    )
    expect(report.candidates.length).toBeGreaterThanOrEqual(2)
    expect(report.selected?.source).toBe("codex:model_providers.cliproxyapi")
    expect(report.selected?.sourceClass).toBe("codex_active")
    const active = report.candidates.find((c) => c.source.includes("cliproxyapi"))
    const family = report.candidates.find((c) => c.source.includes("9router"))
    expect(active!.score).toBeGreaterThan(family!.score)
  })
})
