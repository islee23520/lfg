import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { packageJsonHasBinLfg } from "./npm-publish-bin";
/** Resolve CLI layout from the running bundle (dist/lfg.js) or dev entry. */
export async function resolveLfgCliLayout(moduleUrl) {
    const distEntry = fileURLToPath(moduleUrl);
    const distDir = dirname(distEntry);
    const basename = distEntry.split(/[/\\]/).pop() ?? "";
    if (basename === "lfg.ts" || distDir.endsWith("/bin") || distDir.endsWith("\\bin")) {
        const devDist = join(distDir, "..", "dist", "lfg.js");
        const devOk = await pathExists(devDist);
        return {
            ok: devOk,
            distEntry: devOk ? devDist : distEntry,
            packageRoot: devOk ? join(distDir, "..") : null,
            layout: "workspace-dev",
        };
    }
    const pluginsLfgRoot = join(distDir, "..");
    const workspaceRoot = join(pluginsLfgRoot, "..", "..");
    const publishedPkgJson = join(workspaceRoot, "package.json");
    const nestedPkgJson = join(pluginsLfgRoot, "package.json");
    if (await pathExists(publishedPkgJson)) {
        const hasPublishBin = await packageJsonHasBinLfg(publishedPkgJson);
        const distOk = await pathExists(distEntry);
        if (hasPublishBin && distOk) {
            return {
                ok: true,
                distEntry,
                packageRoot: workspaceRoot,
                layout: "published-workspace",
            };
        }
        if (!hasPublishBin) {
            return { ok: false, distEntry, packageRoot: workspaceRoot, layout: "unknown" };
        }
        return { ok: false, distEntry, packageRoot: workspaceRoot, layout: "published-workspace" };
    }
    if (await pathExists(nestedPkgJson)) {
        return {
            ok: await pathExists(distEntry),
            distEntry,
            packageRoot: pluginsLfgRoot,
            layout: "workspace-dev",
        };
    }
    return { ok: await pathExists(distEntry), distEntry, packageRoot: null, layout: "unknown" };
}
async function pathExists(path) {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}
