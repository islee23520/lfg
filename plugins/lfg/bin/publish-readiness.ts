/** Registry vs workspace version gate for #22 (human npm publish). */
export type PublishGap = {
  readonly packageName: string
  readonly localVersion: string
  readonly registryVersion: string
  readonly hasBin: boolean
  readonly publishReady: boolean
  readonly blockedReason: string | null
}

export function evaluatePublishGap(input: {
  readonly packageName: string
  readonly localVersion: string
  readonly registryVersion: string
  readonly hasBin: boolean
}): PublishGap {
  const registryUnavailable = input.registryVersion === "unavailable" || input.registryVersion === "unknown"
  const versionAhead = input.localVersion !== input.registryVersion && !registryUnavailable
  const publishReady = versionAhead && input.hasBin
  let blockedReason: string | null = null
  if (!input.hasBin) {
    blockedReason = "root package.json missing bin.lfg"
  } else if (registryUnavailable) {
    blockedReason = "registry version unavailable"
  } else if (!versionAhead) {
    blockedReason = "local version not ahead of registry (bump version or publish already done)"
  }
  return {
    packageName: input.packageName,
    localVersion: input.localVersion,
    registryVersion: input.registryVersion,
    hasBin: input.hasBin,
    publishReady,
    blockedReason: publishReady ? null : blockedReason,
  }
}