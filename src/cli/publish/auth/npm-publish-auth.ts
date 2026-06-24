/** Whether the current environment can publish to npm (#22). */
export type NpmPublishAuth = {
  readonly ok: boolean
  readonly npmUser: string | null
  readonly blockedReason: string | null
}

export function evaluateNpmPublishAuth(npmUser: string | null): NpmPublishAuth {
  if (npmUser === null || npmUser.length === 0) {
    return { ok: false, npmUser: null, blockedReason: "npm login required (npm whoami unauthorized)" }
  }
  return { ok: true, npmUser, blockedReason: null }
}