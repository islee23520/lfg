#!/usr/bin/env node
import { chmod, cp, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises"
import { build } from "esbuild"
import { syncOmoSkillsToGrok } from "./sync-omo-skills-to-grok.mjs"

const CLI_ENTRYPOINT_SOURCE = "src/cli"
const CLI_ENTRYPOINT_DIST = "dist"

const CLI_ENTRYPOINT_DIST_NAMES = {
  lfg: "lfg.js",
  selfTest: "self-test.js",
  publishReadiness: "publish-readiness.js",
  npmPublishAuth: "npm-publish-auth.js",
  npmRegistryVersion: "npm-registry-version.js",
  npmPublishBin: "npm-publish-bin.js",
  npmRegistryBin: "npm-registry-bin.js",
  lfgSetupTui: "lfg-setup-tui.js",
}

const OUTPUT_BUNDLES = [
  ["command/lfg.ts", CLI_ENTRYPOINT_DIST_NAMES.lfg],
  ["self-test.ts", CLI_ENTRYPOINT_DIST_NAMES.selfTest],
  ["publish/publish-readiness.ts", CLI_ENTRYPOINT_DIST_NAMES.publishReadiness],
  ["publish/npm-publish-auth.ts", CLI_ENTRYPOINT_DIST_NAMES.npmPublishAuth],
  ["publish/npm-registry-version.ts", CLI_ENTRYPOINT_DIST_NAMES.npmRegistryVersion],
  ["publish/npm-publish-bin.ts", CLI_ENTRYPOINT_DIST_NAMES.npmPublishBin],
  ["publish/npm-registry-bin.ts", CLI_ENTRYPOINT_DIST_NAMES.npmRegistryBin],
  ["setup/lfg-setup-tui.ts", CLI_ENTRYPOINT_DIST_NAMES.lfgSetupTui],
]

const GROK_INSTALL_DIR = "dist/grok-install"
const GROK_INSTALL_FIXTURE_SRC = "src/grok/fixture"
const GROK_INSTALL_FIXTURE_DST = `${GROK_INSTALL_DIR}/fixture`
const GROK_INSTALL_ASSETS_SRC = "src/grok/assets"
const GROK_INSTALL_ASSETS_DST = `${GROK_INSTALL_DIR}/assets`
const GROK_INSTALL_FLAVOUR_PACK_SRC = "src/grok/flavour"
const GROK_INSTALL_FLAVOUR_PACK_DST = `${GROK_INSTALL_DIR}/flavour`
const GROK_INSTALL_SKILLS_SRC = "src/grok/skills"
const GROK_INSTALL_SKILLS_DST = `${GROK_INSTALL_DIR}/skills`
const GROK_INSTALL_MCP_COMPONENT_DIRS = ["ast-grep", "git-bash", "lsp"]
const GROK_INSTALL_MCP_RUNTIME_DIRS = [
  ["ast-grep-mcp", "ast_grep"],
  ["git-bash-mcp", "git_bash"],
  ["lsp-daemon", "lsp"],
]

const buildDir = CLI_ENTRYPOINT_DIST
const buildLockDir = `${buildDir}/.build.lock`

const OUTPUTS = OUTPUT_BUNDLES.map(([entryPoint, outfile]) => [`${CLI_ENTRYPOINT_SOURCE}/${entryPoint}`, `${CLI_ENTRYPOINT_DIST}/${outfile}`])
const outputs = OUTPUTS

await mkdir(buildDir, { recursive: true })
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

  await mkdir(GROK_INSTALL_DIR, { recursive: true })
  await Promise.all(
    (await readdir(GROK_INSTALL_DIR, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("fixture.build-"))
      .map((entry) => rm(`${GROK_INSTALL_DIR}/${entry.name}`, { recursive: true, force: true })),
  )
  const fixtureTmp = `${GROK_INSTALL_FIXTURE_DST}.build-${process.pid}-${Date.now()}`
  await rm(fixtureTmp, { recursive: true, force: true })
  await cp(GROK_INSTALL_FIXTURE_SRC, fixtureTmp, { recursive: true })
  await cp(GROK_INSTALL_FIXTURE_SRC, GROK_INSTALL_DIR, { recursive: true })

  for (const componentDir of GROK_INSTALL_MCP_COMPONENT_DIRS) {
    await rm(`${GROK_INSTALL_DIR}/components/${componentDir}`, { recursive: true, force: true })
    await cp(`components/${componentDir}`, `${GROK_INSTALL_DIR}/components/${componentDir}`, { recursive: true, force: true })
  }

  await rm(`${GROK_INSTALL_DIR}/mcp-runtimes`, { recursive: true, force: true })
  for (const [runtimeDir, serverName] of GROK_INSTALL_MCP_RUNTIME_DIRS) {
    const runtimeDist = `${GROK_INSTALL_DIR}/mcp-runtimes/${runtimeDir}/dist`
    const runtimeCli = `${runtimeDist}/cli.js`
    await mkdir(runtimeDist, { recursive: true })
    await writeFile(runtimeCli, mcpRuntimeCli(serverName), "utf8")
    await chmod(runtimeCli, 0o755)
  }

  const bridgeSrc = `${GROK_INSTALL_ASSETS_SRC}/hooks/lfg-grok-hook-bridge.mjs`
  const configLoaderSrc = `${GROK_INSTALL_ASSETS_SRC}/config/lfg-config-loader.mjs`
  const projectOmoLedgerSrc = `${GROK_INSTALL_ASSETS_SRC}/ledger/lfg-project-omo-ledger.mjs`
  const sisyphusHooksSrc = `${GROK_INSTALL_ASSETS_SRC}/hooks/lfg-sisyphus-hooks.mjs`
  const nativeRulesSrc = `${GROK_INSTALL_ASSETS_SRC}/hooks/lfg-native-rules.js`
  const nativeUltraworkSrc = `${GROK_INSTALL_ASSETS_SRC}/hooks/lfg-native-ultrawork.js`
  const devLoggerSrc = `${GROK_INSTALL_ASSETS_SRC}/log/lfg-dev-logger.mjs`
  await mkdir(GROK_INSTALL_ASSETS_DST, { recursive: true })
  await cp(bridgeSrc, `${GROK_INSTALL_ASSETS_DST}/lfg-grok-hook-bridge.mjs`)
  await cp(configLoaderSrc, `${GROK_INSTALL_ASSETS_DST}/lfg-config-loader.mjs`)
  await cp(projectOmoLedgerSrc, `${GROK_INSTALL_ASSETS_DST}/lfg-project-omo-ledger.mjs`)
  await cp(sisyphusHooksSrc, `${GROK_INSTALL_ASSETS_DST}/lfg-sisyphus-hooks.mjs`)
  await cp(nativeRulesSrc, `${GROK_INSTALL_ASSETS_DST}/lfg-native-rules.js`)
  await cp(nativeUltraworkSrc, `${GROK_INSTALL_ASSETS_DST}/lfg-native-ultrawork.js`)
  await cp(devLoggerSrc, `${GROK_INSTALL_ASSETS_DST}/lfg-dev-logger.mjs`)

  await cp(GROK_INSTALL_FLAVOUR_PACK_SRC, GROK_INSTALL_FLAVOUR_PACK_DST, { recursive: true })

  await syncOmoSkillsToGrok({ allowExistingFallback: true, includeCache: false })
  await rm(GROK_INSTALL_SKILLS_DST, { recursive: true, force: true })
  await cp(GROK_INSTALL_SKILLS_SRC, GROK_INSTALL_SKILLS_DST, { recursive: true })

  for (let attempt = 0; attempt < 8; attempt++) {
    await rm(GROK_INSTALL_FIXTURE_DST, { recursive: true, force: true })
    try {
      await rename(fixtureTmp, GROK_INSTALL_FIXTURE_DST)
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