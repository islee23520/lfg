import { constants } from "node:fs"
import { access, stat } from "node:fs/promises"
import { delimiter, extname, isAbsolute, join } from "node:path"

export async function findExecutableInPath(
  command: string,
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  const candidates = (base: string): readonly string[] => {
    if (platform !== "win32" || extname(base).length > 0) return [base]
    const pathExt = env.PATHEXT ?? env.Pathext ?? ".COM;.EXE;.BAT;.CMD"
    return [
      base,
      ...pathExt
        .split(";")
        .filter(Boolean)
        .map((extension) => `${base}${extension.startsWith(".") ? extension : `.${extension}`}`),
    ]
  }

  if (isAbsolute(command)) {
    for (const candidate of candidates(command)) {
      if (await isExecutableFile(candidate, platform)) return candidate
    }
    return null
  }

  const path = env.PATH ?? env.Path ?? ""
  const pathDelimiter = platform === "win32" ? ";" : delimiter
  for (const directory of path.split(pathDelimiter).filter(Boolean)) {
    for (const candidate of candidates(join(directory, command))) {
      if (await isExecutableFile(candidate, platform)) return candidate
    }
  }
  return null
}

async function isExecutableFile(path: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    await access(path, platform === "win32" ? constants.F_OK : constants.X_OK)
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}
