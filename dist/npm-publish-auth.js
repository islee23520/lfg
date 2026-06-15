// src/cli/npm-publish-auth.ts
function evaluateNpmPublishAuth(npmUser) {
  if (npmUser === null || npmUser.length === 0) {
    return { ok: false, npmUser: null, blockedReason: "npm login required (npm whoami unauthorized)" };
  }
  return { ok: true, npmUser, blockedReason: null };
}
export {
  evaluateNpmPublishAuth
};
//# sourceMappingURL=npm-publish-auth.js.map
