/** Serialize `npm pack` invocations across vitest workers/files (#22 flake). */
let chain: Promise<void> = Promise.resolve()

export async function withNpmPackLock<T>(run: () => Promise<T>): Promise<T> {
  const previous = chain
  let release!: () => void
  chain = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await run()
  } finally {
    release()
  }
}