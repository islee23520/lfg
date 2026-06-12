import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
export const LFG = join(here, "..", "dist", "lfg.js");
let buildPromise = null;
export async function runNodeScript(script, args, input, env = {}, cwd = process.cwd()) {
    await ensureBuilt(script);
    const child = spawn(process.execPath, [script, ...args], {
        cwd,
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.end(input ?? undefined);
    const [stdout, stderr, exitCode] = await Promise.all([streamText(child.stdout), streamText(child.stderr), exitCodeOf(child)]);
    return { exitCode, stdout, stderr };
}
async function ensureBuilt(script) {
    if (!script.startsWith(join(here, "..", "dist"))) {
        return;
    }
    try {
        await access(script);
        return;
    }
    catch {
        // dist bundle missing — build once per process
    }
    buildPromise ??= runBuild().finally(() => {
        buildPromise = null;
    });
    await buildPromise;
}
async function runBuild() {
    const result = await runProcess(process.execPath, [join(root, "scripts", "build.mjs")], null);
    if (result.exitCode !== 0) {
        throw new BuildError(result);
    }
}
async function runProcess(command, args, input) {
    const child = spawn(command, args, {
        cwd: root,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.end(input ?? undefined);
    const [stdout, stderr, exitCode] = await Promise.all([streamText(child.stdout), streamText(child.stderr), exitCodeOf(child)]);
    return { exitCode, stdout, stderr };
}
class BuildError extends Error {
    result;
    constructor(result) {
        super(`lfg test build failed with exit code ${result.exitCode}`);
        this.result = result;
    }
}
export async function runLfg(args, env = {}) {
    const result = await runNodeScript(LFG, args, null, env);
    return { exitCode: result.exitCode, json: JSON.parse(result.stdout) };
}
export async function runLfgText(args, input, env = {}) {
    return runNodeScript(LFG, args, input, env);
}
export async function runLfgFromCwd(args, cwd, env = {}) {
    const result = await runNodeScript(LFG, args, null, env, cwd);
    return { exitCode: result.exitCode, json: JSON.parse(result.stdout) };
}
function streamText(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
}
function exitCodeOf(child) {
    return new Promise((resolve) => {
        child.on("close", (code) => resolve(code ?? 1));
    });
}
