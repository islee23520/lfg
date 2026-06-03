import { readFile } from "node:fs/promises"

export type JsonObject = { readonly [key: string]: unknown }

export async function readJson(path: string, fallback: unknown): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown
  } catch (error) {
    if (error instanceof Error) return fallback
    throw error
  }
}

export async function readJsonObject(path: string): Promise<JsonObject> {
  const parsed = await readJson(path, {})
  return isRecord(parsed) ? parsed : {}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
