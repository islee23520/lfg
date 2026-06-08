/** Parse `npm view <pkg> version` stdout for doctor publishGap (#22). */
export function parseNpmRegistryVersion(stdout: string): string | null {
  const trimmed = stdout.trim()
  return /^\d+\.\d+\.\d+/.test(trimmed) ? trimmed : null
}