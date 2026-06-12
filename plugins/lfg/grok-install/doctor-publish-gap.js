import { evaluatePublishGap } from "../bin/publish-readiness";
export function doctorPublishGapJson(localVersion, registryVersion, hasBin) {
    if (localVersion === null || registryVersion === null) {
        return null;
    }
    const gap = evaluatePublishGap({
        packageName: "@islee23520/lfg",
        localVersion,
        registryVersion,
        hasBin,
    });
    return {
        localVersion: gap.localVersion,
        registryVersion: gap.registryVersion,
        publishReady: gap.publishReady,
        blockedReason: gap.blockedReason,
    };
}
