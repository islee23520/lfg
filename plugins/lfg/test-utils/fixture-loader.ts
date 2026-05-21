import { readFile } from "node:fs/promises"
import { join } from "node:path"

export async function loadFixture<T = unknown>(name: string): Promise<T> {
  const text = await readFile(join(import.meta.dir, "..", "..", "..", "tests", "fixtures", name), "utf8")
  return JSON.parse(text) as T
}
