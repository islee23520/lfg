import type { VariantTable } from "./types"
import defaultPrompt from "./prompts/atlas/default.md"

export const atlasPromptVariants = {
  default: {
    kind: "bundled",
    content: defaultPrompt,
    filePath: "packages/prompts-core/prompts/atlas/default.md",
  },
} satisfies VariantTable
