import { writeFile } from "node:fs/promises"
import { join } from "node:path"

export async function writeGrokInstallStamp(pluginRoot: string, version: string): Promise<string> {
  const installStampPath = join(pluginRoot, "lfg-install.json")
  const stamp = { packageName: "@islee23520/lfg", version, platform: "grok" as const }
  await writeFile(installStampPath, `${JSON.stringify(stamp, null, 2)}\n`, "utf8")
  return installStampPath
}