export type AppServerAvailability = "available" | "missing"

export type AppServerThreadStatus = "active" | "idle" | "notLoaded" | "systemError" | "unknown"

export type AppServerThread = {
  readonly id: string
  readonly sessionId: string | null
  readonly cwd: string | null
  readonly name: string | null
  readonly preview: string | null
  readonly status: AppServerThreadStatus
  readonly updatedAt: number | null
}

export type AppServerSnapshot = {
  readonly availability: AppServerAvailability
  readonly daemonStarted: boolean
  readonly threads: readonly AppServerThread[]
  readonly error: string | null
  readonly recipes: readonly string[]
}

export type AppServerHandoff =
  | {
      readonly transport: "app-server"
      readonly attached: boolean
      readonly thread: AppServerThread
      readonly turnId: string | null
      readonly error: null
    }
  | {
      readonly transport: "codex-exec-fallback"
      readonly attached: false
      readonly thread: null
      readonly turnId: null
      readonly error: string
    }

export interface AppServerClient {
  snapshot(input: { readonly cwd?: string; readonly startDaemon?: boolean }): Promise<AppServerSnapshot>
  handoff(input: {
    readonly cwd: string
    readonly prompt: string
    readonly model?: string
    readonly threadId?: string
  }): Promise<AppServerHandoff>
}
