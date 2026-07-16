import { describe, expect, test } from "vitest"
import { enrichFocusWithSkillRoute, routeOmoSkills } from "./skill-route"
import { planOmoHandoff } from "./handoff"

describe("routeOmoSkills", () => {
  test("routes planning to $ulw-plan", () => {
    const route = routeOmoSkills("write a plan for the release")
    expect(route.skills.map((s) => s.id)).toContain("ulw-plan")
    expect(route.skills.some((s) => s.codexLoad === "$ulw-plan")).toBe(true)
    expect(route.loadContract).toContain("HARD REQUIRE")
  })

  test("routes implementation to programming", () => {
    const route = routeOmoSkills("implement the handoff skill router")
    expect(route.skills.map((s) => s.id)).toContain("programming")
  })

  test("routes image work to $imagegen", () => {
    const route = routeOmoSkills("draw a logo mockup")
    expect(route.skills.some((s) => s.codexLoad === "$imagegen")).toBe(true)
  })

  test("routes start-work to $start-work", () => {
    const route = routeOmoSkills("start work on .omo/plans/release.md")
    expect(route.skills.some((s) => s.codexLoad === "$start-work")).toBe(true)
  })

  test("enrichFocus prefixes SKILLS tag", () => {
    const { focus, route } = enrichFocusWithSkillRoute("implement skill routing")
    expect(focus.startsWith("SKILLS[")).toBe(true)
    expect(route.skills.length).toBeGreaterThan(0)
  })
})

describe("planOmoHandoff skill route", () => {
  test("embeds skill route section in workerPrompt", () => {
    const handoff = planOmoHandoff({ role: "coding", engine: "gpt", focus: "implement skill routing with TDD" })
    if ("error" in handoff) throw new Error(handoff.error)
    expect(handoff.skillRoute.skills.length).toBeGreaterThan(0)
    expect(handoff.workerPrompt).toContain("SKILL ROUTE")
    expect(handoff.workerPrompt).toMatch(/programming|HARD REQUIRE/)
    expect(handoff.focus).toMatch(/^SKILLS\[/)
  })
})
