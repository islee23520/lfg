#!/usr/bin/env node
import { chmod, cp, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises"
import { build } from "esbuild"
import { syncOmoSkillsToGrok } from "./sync-omo-skills-to-grok.mjs"

const outputs = [
  ["src/cli/lfg.ts", "dist/lfg.js"],
  ["src/cli/self-test.ts", "dist/self-test.js"],
  ["src/cli/publish-readiness.ts", "dist/publish-readiness.js"],
  ["src/cli/npm-publish-auth.ts", "dist/npm-publish-auth.js"],
  ["src/cli/npm-registry-version.ts", "dist/npm-registry-version.js"],
  ["src/cli/npm-publish-bin.ts", "dist/npm-publish-bin.js"],
  ["src/cli/npm-registry-bin.ts", "dist/npm-registry-bin.js"],
  // TUI module for LFP-style Clack setup on TTY (dynamic import from the main bundle).
  // Built as a separate file (like LFP's setup-tui.mjs) so the runtime relative import works.
  // Its runtime deps (@clack/prompts, picocolors) are declared in root package.json "dependencies"
  // and externalized here so the emitted module retains bare imports resolved from the installed package.
  ["src/cli/lfg-setup-tui.ts", "dist/lfg-setup-tui.js"],
]

const distDir = "dist"
const buildLockDir = `${distDir}/.build.lock`

await mkdir(distDir, { recursive: true })
await acquireBuildLock(buildLockDir)
try {
  await Promise.all(
    outputs.map(([entryPoint, outfile]) => {
      const isTui = entryPoint.includes("lfg-setup-tui")
      return build({
        entryPoints: [entryPoint],
        outfile,
        bundle: true,
        platform: "node",
        format: "esm",
        sourcemap: true,
        target: "node20",
        loader: { ".md": "text" },
        ...(isTui ? { external: ["@clack/prompts", "picocolors"] } : {}),
      })
    }),
  )

  const fixtureSrc = "src/grok-adapter/fixture-minimal"
  const fixtureDst = "dist/grok-install/fixture-minimal"
  const grokDistDir = "dist/grok-install"
  const mcpComponentDirs = ["ast-grep", "git-bash", "lsp"]
  const mcpRuntimeDirs = [
    ["ast-grep-mcp", "ast_grep"],
    ["git-bash-mcp", "git_bash"],
    ["lsp-daemon", "lsp"],
  ]
  await mkdir(grokDistDir, { recursive: true })
  await Promise.all(
    (await readdir(grokDistDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("fixture-minimal.build-"))
      .map((entry) => rm(`${grokDistDir}/${entry.name}`, { recursive: true, force: true })),
  )
  const fixtureTmp = `${fixtureDst}.build-${process.pid}-${Date.now()}`
  await rm(fixtureTmp, { recursive: true, force: true })
  await cp(fixtureSrc, fixtureTmp, { recursive: true })
  await cp(fixtureSrc, grokDistDir, { recursive: true })
  for (const componentDir of mcpComponentDirs) {
    await rm(`${grokDistDir}/components/${componentDir}`, { recursive: true, force: true })
    await cp(`components/${componentDir}`, `${grokDistDir}/components/${componentDir}`, { recursive: true, force: true })
  }
  await rm(`${grokDistDir}/mcp-runtimes`, { recursive: true, force: true })
  for (const [runtimeDir, serverName] of mcpRuntimeDirs) {
    const runtimeDist = `${grokDistDir}/mcp-runtimes/${runtimeDir}/dist`
    const runtimeCli = `${runtimeDist}/cli.js`
    await mkdir(runtimeDist, { recursive: true })
    await writeFile(runtimeCli, mcpRuntimeCli(serverName), "utf8")
    await chmod(runtimeCli, 0o755)
  }
  const bridgeSrc = "src/grok-adapter/assets/lfg-grok-hook-bridge.mjs"
  const configLoaderSrc = "src/grok-adapter/assets/lfg-config-loader.mjs"
  const projectOmoLedgerSrc = "src/grok-adapter/assets/lfg-project-omo-ledger.mjs"
  const sisyphusHooksSrc = "src/grok-adapter/assets/lfg-sisyphus-hooks.mjs"
  const nativeRulesSrc = "src/grok-adapter/assets/lfg-native-rules.js"
  const nativeUltraworkSrc = "src/grok-adapter/assets/lfg-native-ultrawork.js"
  const devLoggerSrc = "src/grok-adapter/assets/lfg-dev-logger.mjs"
  const bridgeDstDir = "dist/grok-install/assets"
  await mkdir(bridgeDstDir, { recursive: true })
  await cp(bridgeSrc, `${bridgeDstDir}/lfg-grok-hook-bridge.mjs`)
  await cp(configLoaderSrc, `${bridgeDstDir}/lfg-config-loader.mjs`)
  await cp(projectOmoLedgerSrc, `${bridgeDstDir}/lfg-project-omo-ledger.mjs`)
  await cp(sisyphusHooksSrc, `${bridgeDstDir}/lfg-sisyphus-hooks.mjs`)
  await cp(nativeRulesSrc, `${bridgeDstDir}/lfg-native-rules.js`)
  await cp(nativeUltraworkSrc, `${bridgeDstDir}/lfg-native-ultrawork.js`)
  await cp(devLoggerSrc, `${bridgeDstDir}/lfg-dev-logger.mjs`)
  const flavourSrc = "src/grok-adapter/flavour-pack-assets"
  const flavourDst = "dist/grok-install/flavour-pack-assets"
  await cp(flavourSrc, flavourDst, { recursive: true })

  await syncOmoSkillsToGrok({ allowExistingFallback: true, includeCache: false })
  const skillsSrc = "src/grok-adapter/skills"
  const skillsDst = "dist/grok-install/skills"
  await rm(skillsDst, { recursive: true, force: true })
  await cp(skillsSrc, skillsDst, { recursive: true })
  for (let attempt = 0; attempt < 8; attempt++) {
    await rm(fixtureDst, { recursive: true, force: true })
    try {
      await rename(fixtureTmp, fixtureDst)
      break
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null
      if (code !== "ENOTEMPTY" && code !== "EBUSY" && code !== "EEXIST") {
        throw error
      }
      if (attempt === 7) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)))
    }
  }

  await Promise.all(outputs.map(([, outfile]) => chmod(outfile, 0o755)))
} finally {
  await rm(buildLockDir, { recursive: true, force: true })
}

async function acquireBuildLock(lockDir) {
  const startedAt = Date.now()
  for (let attempt = 0; ; attempt++) {
    try {
      await mkdir(lockDir)
      return
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null
      if (code !== "EEXIST") {
        throw error
      }
      if (Date.now() - startedAt > 120_000) {
        throw new Error(`Timed out waiting for build lock at ${lockDir}`)
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(25 * (attempt + 1), 250)))
    }
  }
}

function mcpRuntimeCli(serverName) {
  return `#!/usr/bin/env node
import { argv, stdin, stdout, stderr } from "node:process";

const subcommand = argv[2] ?? "mcp";
if (subcommand !== "mcp") {
\tstderr.write("lfg ${serverName} runtime supports only the mcp subcommand\\n");
\tprocess.exit(2);
}

let buffer = "";
stdin.setEncoding("utf8");
stdin.on("data", (chunk) => {
\tbuffer += chunk;
\tfor (;;) {
\t\tconst newline = buffer.indexOf("\\n");
\t\tif (newline === -1) break;
\t\tconst line = buffer.slice(0, newline).trim();
\t\tbuffer = buffer.slice(newline + 1);
\t\tif (line.length > 0) handleMessage(line);
\t}
});
stdin.on("end", () => process.exit(0));

function handleMessage(line) {
\tlet message;
\ttry {
\t\tmessage = JSON.parse(line);
\t} catch {
\t\treturn;
\t}
\tif (!message || typeof message !== "object" || !("id" in message)) return;
\tif (message.method === "initialize") {
\t\twriteResponse(message.id, {
\t\t\tprotocolVersion: "2024-11-05",
\t\t\tcapabilities: { tools: {} },
\t\t\tserverInfo: { name: "lfg-${serverName}", version: "0.0.0" },
\t\t});
\t\treturn;
\t}
\tif (message.method === "tools/list") {
\t\twriteResponse(message.id, { tools: [] });
\t\treturn;
\t}
\tstdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } }) + "\\n");
}

function writeResponse(id, result) {
\tstdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}
`
}
