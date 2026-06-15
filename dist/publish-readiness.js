// src/cli/publish-readiness.ts
function evaluatePublishGap(input) {
  const registryUnavailable = input.registryVersion === "unavailable" || input.registryVersion === "unknown";
  const versionAhead = input.localVersion !== input.registryVersion && !registryUnavailable;
  const publishReady = versionAhead && input.hasBin;
  let blockedReason = null;
  if (!input.hasBin) {
    blockedReason = "root package.json bin.lfg must be bin/lfg.js";
  } else if (registryUnavailable) {
    blockedReason = "registry version unavailable";
  } else if (!versionAhead) {
    blockedReason = "local version not ahead of registry (bump version or publish already done)";
  }
  return {
    packageName: input.packageName,
    localVersion: input.localVersion,
    registryVersion: input.registryVersion,
    hasBin: input.hasBin,
    publishReady,
    blockedReason: publishReady ? null : blockedReason
  };
}
export {
  evaluatePublishGap
};
//# sourceMappingURL=publish-readiness.js.map
