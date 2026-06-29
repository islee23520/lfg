#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = process.env.GROK_PLUGIN_ROOT ?? dirname(here);
const bridge = join(here, "lfg-grok-hook-bridge.mjs");
const component = join(pluginRoot, "components", "ultrawork", "dist", "cli.js");
const event = process.argv[2] ?? "user-prompt-submit";

try {
  const { devLog } = await importFirst(["./lfg-dev-logger.mjs", "../log/lfg-dev-logger.mjs"]);
  await devLog({ event: eventToPascal(event), hook: "native-ultrawork", source: "lfg-native-ultrawork.mjs", detail: { component, event } });
} catch {}

const child = spawn(process.execPath, [bridge, "node", component, "hook", event], {
  env: { ...process.env, GROK_PLUGIN_ROOT: pluginRoot },
  stdio: ["pipe", "inherit", "inherit"],
});

process.stdin.pipe(child.stdin);
child.on("error", () => process.exit(1));
child.on("close", (code) => process.exit(code ?? 1));

function eventToPascal(s) {
  return s.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

async function importFirst(specifiers) {
  let last;
  for (const s of specifiers) { try { return await import(s); } catch(e){ last=e; } }
  throw last;
}
