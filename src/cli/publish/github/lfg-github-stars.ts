import { spawn } from "node:child_process"
import { stdout as defaultStdout } from "node:process"

export type GitHubStarTarget = {
  readonly id: string
  readonly label: string
  readonly repo: string
  readonly url: string
}

export const GITHUB_STAR_TARGETS: readonly GitHubStarTarget[] = [
  {
    id: "oh-my-openagent",
    label: "oh-my-openagent (OMO)",
    repo: "code-yeongyu/oh-my-openagent",
    url: "https://github.com/code-yeongyu/oh-my-openagent",
  },
  {
    id: "lfg",
    label: "lfg",
    repo: "islee23520/lfg",
    url: "https://github.com/islee23520/lfg",
  },
] as const

export const STAR_REPOSITORIES: readonly string[] = GITHUB_STAR_TARGETS.map((t) => t.repo)

type LineReader = AsyncIterator<string> & { readonly close: () => void }

export type StarRepositoryResult = {
  readonly ok: boolean
  readonly message: string
}

export type StarRepositoryFn = (repository: string) => Promise<StarRepositoryResult>

export type GitHubStarsPromptOptions = {
  readonly reader?: LineReader
  readonly confirm?: (reader: LineReader, prompt: string) => Promise<boolean>
  readonly output?: { readonly write: (chunk: string) => void }
  readonly starRepository?: StarRepositoryFn
  readonly gitHubStarSelector?: () => Promise<GitHubStarTarget | "all" | null>
}

export async function maybeRequestGitHubStars(
  reader: LineReader,
  confirm: (reader: LineReader, prompt: string) => Promise<boolean>,
  options: GitHubStarsPromptOptions = {},
): Promise<void> {
  await maybePromptGitHubStars({
    ...options,
    reader,
    confirm,
  })
}

export async function maybePromptGitHubStars(options: GitHubStarsPromptOptions = {}): Promise<void> {
  const output = options.output ?? defaultStdout
  const star = options.starRepository ?? starRepositoryViaGh

  if (typeof options.gitHubStarSelector === "function") {
    const selected = await options.gitHubStarSelector()
    if (selected === null) {
      output.write("Skipped GitHub starring.\n")
      return
    }
    const targets = selected === "all" ? GITHUB_STAR_TARGETS : [selected]
    await starTargets(targets, star, output)
    return
  }

  const reader = options.reader
  const confirm = options.confirm
  if (!reader || !confirm) {
    return
  }

  output.write("\nGitHub Stars\n")
  output.write("────────────\n")
  output.write(`Repositories: ${STAR_REPOSITORIES.join(", ")}\n`)
  const shouldStar = await confirm(reader, "Star oh-my-openagent and lfg on GitHub? [y/N] ")
  if (!shouldStar) {
    output.write("Skipped GitHub starring.\n")
    return
  }
  await starTargets(GITHUB_STAR_TARGETS, star, output)
}

async function starTargets(
  targets: readonly GitHubStarTarget[],
  star: StarRepositoryFn,
  output: { readonly write: (chunk: string) => void },
): Promise<void> {
  for (const target of targets) {
    const result = await star(target.repo)
    output.write(
      result.ok ? `Starred ${target.repo}.\n` : `Could not star ${target.repo}: ${result.message}\n`,
    )
  }
}

function starRepositoryViaGh(repository: string): Promise<StarRepositoryResult> {
  return new Promise((resolve) => {
    const child = spawn("gh", githubStarApiArgs(repository), { stdio: ["ignore", "ignore", "pipe"] })
    const chunks: Buffer[] = []
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.on("error", (error) => resolve({ ok: false, message: error.message }))
    child.on("close", (code) => {
      const stderr = Buffer.concat(chunks).toString("utf8").trim()
      resolve({
        ok: code === 0,
        message: stderr.length > 0 ? stderr : "GitHub CLI failed or is not authenticated",
      })
    })
  })
}

export function githubStarApiArgs(repository: string): readonly string[] {
  return ["api", "--method", "PUT", "--silent", `/user/starred/${repository}`]
}

export function selectGitHubStarTarget(answer: string): GitHubStarTarget | "all" | null {
  const trimmed = answer.trim().toLowerCase()
  if (trimmed === "" || trimmed === "n" || trimmed === "no" || trimmed === "skip") return null
  if (trimmed === "a" || trimmed === "all" || trimmed === "y" || trimmed === "yes") return "all"
  const asIndex = Number.parseInt(trimmed, 10)
  if (Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= GITHUB_STAR_TARGETS.length) {
    return GITHUB_STAR_TARGETS[asIndex - 1]!
  }
  return GITHUB_STAR_TARGETS.find((t) => t.id === trimmed || t.repo === trimmed) ?? null
}
