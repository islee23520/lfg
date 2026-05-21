export type SmokePaths = {
  repoRoot: string
  pluginRoot: string
}

export type SmokeContext = {
  paths: SmokePaths
  tempDir: string
  env: NodeJS.ProcessEnv
}

export type SmokeCheck = {
  name: string
  run(context: SmokeContext): Promise<string[]> | string[]
}

export type CommandResult = {
  stdout: string
  stderr: string
  status: number | null
}
