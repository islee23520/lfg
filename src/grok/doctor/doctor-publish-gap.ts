import type { JsonObject } from "../../shared/json"
import { evaluatePublishGap } from "../../cli/publish/readiness/publish-readiness"

export function doctorPublishGapJson(
  localVersion: string | null,
  registryVersion: string | null,
  hasBin: boolean,
): JsonObject | null {
  if (localVersion === null || registryVersion === null) {
    return null
  }
  const gap = evaluatePublishGap({
    packageName: "@islee23520/lfg",
    localVersion,
    registryVersion,
    hasBin,
  })
  return {
    localVersion: gap.localVersion,
    registryVersion: gap.registryVersion,
    publishReady: gap.publishReady,
    blockedReason: gap.blockedReason,
  }
}