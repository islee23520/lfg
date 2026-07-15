export type PrereqPlatform = "darwin" | "linux" | "win32" | "other"

export type PrereqToolId = "codex" | "lazycodex" | "gjc" | "agy"

export type InstallRecipe = {
  readonly id: string
  readonly label: string
  readonly command: string
  readonly args: readonly string[]
  readonly shellHint: string
  readonly docsUrl: string
}

export type ToolProbe = {
  readonly id: PrereqToolId
  readonly required: boolean
  readonly ok: boolean
  readonly status: "ready" | "missing"
  readonly binary: string
  readonly commandPath: string | null
  readonly detail: string
  readonly recipes: readonly InstallRecipe[]
}

export type PrereqReport = {
  readonly platform: PrereqPlatform
  readonly ok: boolean
  readonly codex: ToolProbe
  readonly lazycodex: ToolProbe
  readonly gjc: ToolProbe
  readonly agy: ToolProbe
  readonly missing: readonly PrereqToolId[]
  readonly recommendedMissing: readonly PrereqToolId[]
}

export type InstallToolResult = {
  readonly ok: boolean
  readonly tool: PrereqToolId
  readonly recipeId: string
  readonly command: string
  readonly args: readonly string[]
  readonly stdout: string
  readonly stderr: string
  readonly error?: string
}

export type InstallRunner = (
  recipe: InstallRecipe,
  env: Readonly<Record<string, string | undefined>>,
) => Promise<InstallToolResult>

export function codexInstallRecipes(platform: PrereqPlatform): readonly InstallRecipe[] {
  const docsUrl = "https://github.com/openai/codex#installing-and-running-codex-cli"
  if (platform === "win32") {
    return [
      {
        id: "codex-powershell",
        label: "Official Windows installer (PowerShell)",
        command: "powershell",
        args: ["-ExecutionPolicy", "ByPass", "-c", "irm https://chatgpt.com/codex/install.ps1 | iex"],
        shellHint: 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
        docsUrl,
      },
      npmRecipe("codex-npm", "npm global (@openai/codex)", "@openai/codex", docsUrl),
    ]
  }
  const curlRecipe: InstallRecipe = {
    id: "codex-curl",
    label: platform === "darwin" ? "Official macOS/Linux installer (curl)" : "Official Linux installer (curl)",
    command: "sh",
    args: ["-c", "curl -fsSL https://chatgpt.com/codex/install.sh | sh"],
    shellHint: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
    docsUrl,
  }
  if (platform === "darwin") {
    return [
      curlRecipe,
      {
        id: "codex-brew",
        label: "Homebrew cask",
        command: "brew",
        args: ["install", "--cask", "codex"],
        shellHint: "brew install --cask codex",
        docsUrl,
      },
      npmRecipe("codex-npm", "npm global (@openai/codex)", "@openai/codex", docsUrl),
    ]
  }
  return [curlRecipe, npmRecipe("codex-npm", "npm global (@openai/codex)", "@openai/codex", docsUrl)]
}

export function lazycodexInstallRecipes(): readonly InstallRecipe[] {
  const docsUrl = "https://github.com/code-yeongyu/lazycodex"
  return [
    {
      id: "lazycodex-npx-autonomous",
      label: "LazyCodex (non-interactive Codex Light)",
      command: "npx",
      args: ["-y", "lazycodex-ai", "install", "--no-tui", "--codex-autonomous"],
      shellHint: "npx -y lazycodex-ai install --no-tui --codex-autonomous",
      docsUrl,
    },
    {
      id: "lazycodex-npx",
      label: "LazyCodex interactive install",
      command: "npx",
      args: ["-y", "lazycodex-ai", "install"],
      shellHint: "npx -y lazycodex-ai install",
      docsUrl,
    },
  ]
}

export function gjcInstallRecipes(): readonly InstallRecipe[] {
  const docsUrl = "https://www.npmjs.com/package/@gajae-code/coding-agent"
  return [
    {
      id: "gjc-bun",
      label: "Bun global (@gajae-code/coding-agent)",
      command: "bun",
      args: ["install", "-g", "@gajae-code/coding-agent"],
      shellHint: "bun install -g @gajae-code/coding-agent",
      docsUrl,
    },
    npmRecipe("gjc-npm", "npm global (@gajae-code/coding-agent)", "@gajae-code/coding-agent", docsUrl),
  ]
}

export function agyInstallRecipes(): readonly InstallRecipe[] {
  return []
}

function npmRecipe(id: string, label: string, packageName: string, docsUrl: string): InstallRecipe {
  return {
    id,
    label,
    command: "npm",
    args: ["install", "-g", packageName],
    shellHint: `npm install -g ${packageName}`,
    docsUrl,
  }
}
