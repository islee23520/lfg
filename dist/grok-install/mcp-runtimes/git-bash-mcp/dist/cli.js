#!/usr/bin/env node
import { argv, stdin, stdout, stderr } from "node:process";

const subcommand = argv[2] ?? "mcp";
if (subcommand !== "mcp") {
	stderr.write("lfg git_bash runtime supports only the mcp subcommand\n");
	process.exit(2);
}

let buffer = "";
stdin.setEncoding("utf8");
stdin.on("data", (chunk) => {
	buffer += chunk;
	for (;;) {
		const newline = buffer.indexOf("\n");
		if (newline === -1) break;
		const line = buffer.slice(0, newline).trim();
		buffer = buffer.slice(newline + 1);
		if (line.length > 0) handleMessage(line);
	}
});
stdin.on("end", () => process.exit(0));

function handleMessage(line) {
	let message;
	try {
		message = JSON.parse(line);
	} catch {
		return;
	}
	if (!message || typeof message !== "object" || !("id" in message)) return;
	if (message.method === "initialize") {
		writeResponse(message.id, {
			protocolVersion: "2024-11-05",
			capabilities: { tools: {} },
			serverInfo: { name: "lfg-git_bash", version: "0.0.0" },
		});
		return;
	}
	if (message.method === "tools/list") {
		writeResponse(message.id, { tools: [] });
		return;
	}
	stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } }) + "\n");
}

function writeResponse(id, result) {
	stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}
