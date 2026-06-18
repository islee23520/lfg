export function normalizeModelIdForConfig(modelId: string): string {
  return modelId.replace(/[\u0000-\u001f\u007f]/g, escapeControlCharacter)
}

export function renderYamlDoubleQuotedScalar(value: string): string {
  return JSON.stringify(value)
}

function escapeControlCharacter(character: string): string {
  switch (character) {
    case "\n":
      return "\\n"
    case "\r":
      return "\\r"
    case "\t":
      return "\\t"
    default:
      return `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  }
}
