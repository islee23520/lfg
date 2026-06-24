import { createServer, type IncomingMessage, type ServerResponse } from "node:http"

export type ModelDescriptor = { readonly id: string; readonly context_window?: number; readonly max_model_len?: number }

type ModelServerOptions = {
  readonly requiredApiKey?: string
}

export async function withModelServer(descriptors: readonly ModelDescriptor[], run: (baseUrl: string) => Promise<void>): Promise<void>
export async function withModelServer(
  descriptors: readonly ModelDescriptor[],
  options: ModelServerOptions,
  run: (baseUrl: string) => Promise<void>,
): Promise<void>
export async function withModelServer(modelIds: readonly string[], run: (baseUrl: string) => Promise<void>): Promise<void>
export async function withModelServer(
  modelIds: readonly string[],
  options: ModelServerOptions,
  run: (baseUrl: string) => Promise<void>,
): Promise<void>
export async function withModelServer(
  descriptorsOrIds: readonly (string | ModelDescriptor)[],
  optionsOrRun?: ModelServerOptions | ((baseUrl: string) => Promise<void>),
  maybeRun?: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const options = typeof optionsOrRun === "function" || optionsOrRun === undefined ? {} : optionsOrRun
  const run = typeof optionsOrRun === "function" ? optionsOrRun : maybeRun
  if (typeof run !== "function") {
    throw new Error("model server callback is required")
  }
  const descriptors: readonly ModelDescriptor[] = descriptorsOrIds.map((descriptor) =>
    typeof descriptor === "string" ? { id: descriptor } : descriptor,
  )
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.url !== "/v1/models") {
      response.writeHead(404, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: "not found" }))
      return
    }
    const expectedAuthorization = options.requiredApiKey === undefined ? null : `Bearer ${options.requiredApiKey}`
    if (expectedAuthorization !== null && request.headers.authorization !== expectedAuthorization) {
      response.writeHead(401, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: "Missing API key" }))
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ data: descriptors.map(modelDescriptorJson) }))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (typeof address !== "object" || address === null) {
    server.close()
    throw new Error("model test server did not expose a TCP address")
  }
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }
}

function modelDescriptorJson(descriptor: ModelDescriptor): {
  readonly id: string
  readonly context_window?: number
  readonly max_model_len?: number
} {
  return {
    id: descriptor.id,
    ...(descriptor.context_window !== undefined ? { context_window: descriptor.context_window } : {}),
    ...(descriptor.max_model_len !== undefined ? { max_model_len: descriptor.max_model_len } : {}),
  }
}
