import { describe, expect, test } from "vitest"
import {
  GITHUB_STAR_TARGETS,
  STAR_REPOSITORIES,
  githubStarApiArgs,
  maybePromptGitHubStars,
  selectGitHubStarTarget,
} from "./lfg-github-stars"

describe("GitHub star helper", () => {
  test("targets are oh-my-openagent and lfg only", () => {
    expect(STAR_REPOSITORIES).toEqual(["code-yeongyu/oh-my-openagent", "islee23520/lfg"])
    expect(GITHUB_STAR_TARGETS.map((t) => t.repo)).toEqual(STAR_REPOSITORIES)
  })

  test("uses gh api endpoint because gh repo star is not available in older GitHub CLI versions", () => {
    expect(githubStarApiArgs("code-yeongyu/oh-my-openagent")).toEqual([
      "api",
      "--method",
      "PUT",
      "--silent",
      "/user/starred/code-yeongyu/oh-my-openagent",
    ])
  })

  test("selectGitHubStarTarget maps yes/all/index/skip", () => {
    expect(selectGitHubStarTarget("")).toBeNull()
    expect(selectGitHubStarTarget("n")).toBeNull()
    expect(selectGitHubStarTarget("skip")).toBeNull()
    expect(selectGitHubStarTarget("all")).toBe("all")
    expect(selectGitHubStarTarget("y")).toBe("all")
    expect(selectGitHubStarTarget("1")).toEqual(GITHUB_STAR_TARGETS[0])
    expect(selectGitHubStarTarget("2")).toEqual(GITHUB_STAR_TARGETS[1])
    expect(selectGitHubStarTarget("lfg")).toEqual(GITHUB_STAR_TARGETS[1])
    expect(selectGitHubStarTarget("nope")).toBeNull()
  })

  test("line-mode decline writes skip and never stars", async () => {
    const writes: string[] = []
    const starred: string[] = []
    const reader = {
      async next() {
        return { done: true as const, value: undefined }
      },
      close() {},
    }
    await maybePromptGitHubStars({
      reader,
      confirm: async () => false,
      output: { write: (c) => writes.push(c) },
      starRepository: async (repo) => {
        starred.push(repo)
        return { ok: true, message: "" }
      },
    })
    expect(writes.join("")).toContain("GitHub Stars")
    expect(writes.join("")).toContain("Skipped GitHub starring.")
    expect(starred).toEqual([])
  })

  test("selector null skips without calling starRepository", async () => {
    const writes: string[] = []
    const starred: string[] = []
    await maybePromptGitHubStars({
      gitHubStarSelector: async () => null,
      output: { write: (c) => writes.push(c) },
      starRepository: async (repo) => {
        starred.push(repo)
        return { ok: true, message: "" }
      },
    })
    expect(writes.join("")).toContain("Skipped GitHub starring.")
    expect(starred).toEqual([])
  })

  test("accept-all stars both repos and reports failures without throwing", async () => {
    const writes: string[] = []
    await maybePromptGitHubStars({
      gitHubStarSelector: async () => "all",
      output: { write: (c) => writes.push(c) },
      starRepository: async (repo) =>
        repo.includes("lfg")
          ? { ok: false, message: "gh missing" }
          : { ok: true, message: "" },
    })
    const text = writes.join("")
    expect(text).toContain("Starred code-yeongyu/oh-my-openagent.")
    expect(text).toContain("Could not star islee23520/lfg: gh missing")
  })
})
