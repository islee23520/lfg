import { describe, expect, test } from "vitest"

/**
 * T-PROMPT-HOOK-01: prove Sisyphus hook emits additionalContext markers for
 * SessionStart / UserPromptSubmit (lfg-owned injection surface, not token stream).
 */
describe("T-PROMPT-HOOK-01 sisyphus additionalContext markers", () => {
  test("SessionStart body includes sisyphus-orchestrator-mode", async () => {
    const mod = await import("../assets/hooks/lfg-sisyphus-hooks.mjs")
    const ctx = mod.renderSisyphusContext("SessionStart", { hookEventName: "SessionStart" })
    expect(ctx).not.toBeNull()
    expect(ctx?.body).toContain("<sisyphus-orchestrator-mode>")
    expect(ctx?.body).toContain("Grok Build session")
    expect(ctx?.body).toMatch(/NO RE-ASK/i)
    expect(ctx?.body).toMatch(/SELF-ANSWER/i)
    expect(ctx?.body).toMatch(/true blocker/i)
    expect(ctx?.body).toMatch(/STANDING INTENT/i)
    expect(ctx?.body).toMatch(/residual/i)
    // Budget: STANDING INTENT residual-finish must stay in the injection body.
    expect(ctx?.body.length).toBeLessThan(900)
    expect(ctx?.statusLabel).toMatch(/Orchestrator/i)
  })

  test("UserPromptSubmit injects intent routing for implement prompts", async () => {
    const mod = await import("../assets/hooks/lfg-sisyphus-hooks.mjs")
    const ctx = mod.renderSisyphusContext("UserPromptSubmit", {
      hookEventName: "UserPromptSubmit",
      prompt: "implement a new feature for auth",
    })
    expect(ctx).not.toBeNull()
    expect(ctx?.body).toContain("<sisyphus-intent-routing>")
    expect(ctx?.body).toMatch(/implementation/i)
    expect(ctx?.body).toContain("Intent signals:")
    expect(ctx?.body).toMatch(/NO RE-ASK/i)
    expect(ctx?.body).toMatch(/SELF-ANSWER/i)
    expect(ctx?.body).toMatch(/true blocker/i)
    expect(ctx?.body).toMatch(/RESIDUAL FINISH/i)
    expect(ctx?.body).toMatch(/standing authorization/i)
    expect(ctx?.body).toMatch(/shall I|would you like|want me to/i)
  })

  test("Stop gate includes SELF-ANSWER ban on preference-menu endings", async () => {
    const mod = await import("../assets/hooks/lfg-sisyphus-hooks.mjs")
    const ctx = mod.renderSisyphusContext("Stop", { hookEventName: "Stop" })
    expect(ctx).not.toBeNull()
    expect(ctx?.body).toMatch(/SELF-ANSWER/i)
    expect(ctx?.body).toMatch(/if you want/i)
    expect(ctx?.body).toMatch(/RESIDUAL FINISH/i)
    expect(ctx?.body).toMatch(/permission-begging/i)
  })

  test("UserPromptSubmit planning intent routes toward /ulw-plan", async () => {
    const mod = await import("../assets/hooks/lfg-sisyphus-hooks.mjs")
    const ctx = mod.renderSisyphusContext("UserPromptSubmit", {
      hookEventName: "UserPromptSubmit",
      prompt: "make a plan for redesigning the auth system architecture",
    })
    expect(ctx).not.toBeNull()
    expect(ctx?.body).toMatch(/ulw-plan/i)
  })

  test("UserPromptSubmit residual-finish markers fire even for short nudges", async () => {
    const mod = await import("../assets/hooks/lfg-sisyphus-hooks.mjs")
    const ctx = mod.renderSisyphusContext("UserPromptSubmit", {
      hookEventName: "UserPromptSubmit",
      prompt: "all done??",
    })
    expect(ctx).not.toBeNull()
    expect(ctx?.body).toMatch(/RESIDUAL FINISH/i)
    expect(ctx?.body).toMatch(/standing authorization/i)
    expect(ctx?.body).toMatch(/if you want/i)
  })
})
