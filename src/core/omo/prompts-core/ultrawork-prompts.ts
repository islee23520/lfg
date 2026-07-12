import type { VariantTable } from "./types"
import codexPrompt from "./prompts/ultrawork/codex.md"
import defaultPrompt from "./prompts/ultrawork/default.md"

export const ULTRAWORK_DEFAULT_PROMPT = defaultPrompt
export const CODEX_ULTRAWORK_PROMPT = codexPrompt

export const ultraworkPromptVariants = {
  default: {
    kind: "bundled",
    content: defaultPrompt,
    filePath: "packages/prompts-core/prompts/ultrawork/default.md",
  },
} satisfies VariantTable

export const codexUltraworkPromptVariants = {
  codex: {
    kind: "bundled",
    content: codexPrompt,
    filePath: "packages/prompts-core/prompts/ultrawork/codex.md",
  },
} satisfies VariantTable
