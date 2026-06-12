import { readFile } from "node:fs/promises";
export const PUBLISHED_LFG_BIN_TARGET = "plugins/lfg/lfg";
/** npm pack root layout: bin.lfg must point at the shell shim under plugins/lfg (#22). */
export function isPublishedLfgBinTarget(binLfg) {
    return binLfg === PUBLISHED_LFG_BIN_TARGET;
}
/** Whether package.json exposes npm bin.lfg (publish-root layout #22). */
export async function packageJsonHasBinLfg(packageJsonPath) {
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
    }
    catch {
        return false;
    }
}
