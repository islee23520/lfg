import { join } from "node:path"

const HEPHAESTUS_RELATIVE_PATH = join("components", "rules", "bundled-rules", "hephaestus.md")

export type EnsureHephaestusModelGateResult = {
  readonly ensured: boolean
  readonly patched: boolean
  readonly path: string
  readonly reason: string
}

export async function ensureHephaestusModelGate(
  pluginRoot: string,
): Promise<EnsureHephaestusModelGateResult> {
  const targetPath = join(pluginRoot, HEPHAESTUS_RELATIVE_PATH)
  return {
    ensured: true,
    patched: false,
    path: targetPath,
    reason: "hephaestus not default, gate not needed",
  }
}
