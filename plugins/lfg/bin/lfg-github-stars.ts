import { spawn } from "node:child_process"
import { stdout as output } from "node:process"

const STAR_REPOSITORIES = ["code-yeongyu/oh-my-openagent", "islee23520/lfg"] as const

type LineReader = AsyncIterator<string> & { readonly close: () => void }

export async function maybeRequestGitHubStars(
  reader: LineReader,
  confirm: (reader: LineReader, prompt: string) => Promise<boolean>,
): Promise<void> {
  output.write("\nGitHub Stars\n")
  output.write("────────────\n")
  output.write(`Repositories: ${STAR_REPOSITORIES.join(", ")}\n`)
  const shouldStar = await confirm(reader, "Star oh-my-openagent and lfg on GitHub? [y/N] ")
  if (!shouldStar) {
    output.write("Skipped GitHub starring.\n")
    return
  }
  for (const repository of STAR_REPOSITORIES) {
    const result = await starRepository(repository)
    output.write(result.ok ? `Starred ${repository}.\n` : `Could not star ${repository}: ${result.message}\n`)
  }
}

function starRepository(repository: string): Promise<{ readonly ok: boolean; readonly message: string }> {
  return new Promise((resolve) => {
    const child = spawn("gh", githubStarApiArgs(repository), { stdio: ["ignore", "ignore", "pipe"] })
    const chunks: Buffer[] = []
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.on("error", (error) => resolve({ ok: false, message: error.message }))
    child.on("close", (code) => {
      const stderr = Buffer.concat(chunks).toString("utf8").trim()
      resolve({ ok: code === 0, message: stderr.length > 0 ? stderr : "GitHub CLI failed or is not authenticated" })
    })
  })
}

export function githubStarApiArgs(repository: string): readonly string[] {
  return ["api", "--method", "PUT", "--silent", `/user/starred/${repository}`]
}
