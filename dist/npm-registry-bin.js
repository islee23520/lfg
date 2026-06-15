// src/cli/npm-publish-bin.ts
var PUBLISHED_LFG_BIN_TARGET = "bin/lfg.js";
function isPublishedLfgBinTarget(binLfg) {
  return binLfg === PUBLISHED_LFG_BIN_TARGET;
}

// src/cli/npm-registry-bin.ts
var LEGACY_REGISTRY_BIN_LFG_TARGETS = [
  "dist/lfg.js",
  "plugins/lfg/dist/lfg.js",
  "plugins/lfg/lfg"
];
function parseNpmRegistryBinLfg(stdout) {
  const trimmed = stdout.trim();
  if (trimmed.length === 0 || trimmed === "undefined" || trimmed === "null") {
    return null;
  }
  return trimmed;
}
function isLegacyRegistryBinLfg(binLfg) {
  if (binLfg === void 0 || binLfg === null || binLfg === "") {
    return false;
  }
  return LEGACY_REGISTRY_BIN_LFG_TARGETS.includes(binLfg);
}
function registryBinPublishContract(binLfg) {
  return {
    binLfg,
    matchesPublishContract: binLfg !== null && isPublishedLfgBinTarget(binLfg),
    legacyWrongTarget: isLegacyRegistryBinLfg(binLfg)
  };
}
export {
  LEGACY_REGISTRY_BIN_LFG_TARGETS,
  isLegacyRegistryBinLfg,
  parseNpmRegistryBinLfg,
  registryBinPublishContract
};
//# sourceMappingURL=npm-registry-bin.js.map
