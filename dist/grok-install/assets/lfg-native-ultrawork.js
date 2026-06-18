#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { devLog } from "./lfg-dev-logger.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = process.env.GROK_PLUGIN_ROOT ?? dirname(here);
const bridge = join(here, "lfg-grok-hook-bridge.mjs");
const component = join(pluginRoot, "components", "ultrawork", "dist", "cli.js");
const event = process.argv[2] ?? "user-prompt-submit";

await devLog({ event: eventToPascal(event), hook: "native-ultrawork", source: "lfg-native-ultrawork.js", detail: { component, event } });

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
