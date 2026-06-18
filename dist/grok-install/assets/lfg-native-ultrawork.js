#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = process.env.GROK_PLUGIN_ROOT ?? dirname(here);
const bridge = join(here, "lfg-grok-hook-bridge.mjs");
const component = join(pluginRoot, "components", "ultrawork", "dist", "cli.js");
const event = process.argv[2] ?? "user-prompt-submit";

const child = spawn(process.execPath, [bridge, "node", component, "hook", event], {
  env: { ...process.env, GROK_PLUGIN_ROOT: pluginRoot },
  stdio: ["pipe", "inherit", "inherit"],
});

process.stdin.pipe(child.stdin);
child.on("error", () => process.exit(1));
child.on("close", (code) => process.exit(code ?? 1));
