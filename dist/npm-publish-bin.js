// src/cli/npm-publish-bin.ts
import { readFile } from "node:fs/promises";
var PUBLISHED_LFG_BIN_TARGET = "bin/lfg.js";
function isPublishedLfgBinTarget(binLfg) {
  return binLfg === PUBLISHED_LFG_BIN_TARGET;
}
async function packageJsonHasBinLfg(packageJsonPath) {
  try {
    const parsed = JSON.parse(await readFile(packageJsonPath, "utf8"));
    if (typeof parsed !== "object" || parsed === null) {
      return false;
    }
    const bin = parsed.bin;
    if (typeof bin !== "object" || bin === null) {
      return false;
    }
    const lfg = bin.lfg;
    return typeof lfg === "string" && isPublishedLfgBinTarget(lfg);
  } catch {
    return false;
  }
}
export {
  PUBLISHED_LFG_BIN_TARGET,
  isPublishedLfgBinTarget,
  packageJsonHasBinLfg
};
//# sourceMappingURL=npm-publish-bin.js.map
