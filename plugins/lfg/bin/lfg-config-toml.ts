export type GrokByokBaseUrlSource = "environment" | "existing_endpoints"

export type GrokByokModelConfig = {
  readonly alias: string
  readonly modelId: string
  readonly displayName: string
  readonly apiKey: string
}

export function grokModelAlias(modelId: string): string {
  return modelId.trim().replaceAll(".", "-")
}

export function normalizeGrokBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const withoutTrailingSlash = withScheme.replace(/\/+$/, "")
  const withoutMethodPath = withoutTrailingSlash.replace(/\/(?:responses|chat\/completions|messages)$/i, "")
  return withoutMethodPath === "https://cliproxy.linalab.io" ? "https://cliproxy.linalab.io/v1" : withoutMethodPath
}

export function findExistingEndpointBaseUrl(source: string): string | null {
  return findTomlStringValue(source, "endpoints", "models_base_url") ?? findTomlStringValue(source, "endpoint", "models_base_url")
}

export function renderGrokByokConfig(previous: string, baseUrl: string, baseUrlSource: GrokByokBaseUrlSource, models: readonly GrokByokModelConfig[], secondaryAlias: string | null): string {
  let next = previous
  for (const model of models) next = removeTomlSection(removeTomlSection(next, `model.${model.modelId}`), `model.${model.alias}`)
  if (secondaryAlias) next = removeTomlSection(next, `model.${secondaryAlias}`)
  if (shouldWriteEndpointBaseUrl(previous, baseUrl, baseUrlSource)) next = upsertTomlStringKeyInSection(next, "endpoints", "models_base_url", baseUrl)

  const primaryAlias = models[0]?.alias
  if (primaryAlias && secondaryAlias) next = setTomlSectionKey(next, "ui", "fork_secondary_model", tomlString(primaryAlias))

  const body = next.trimEnd()
  const blocks = [...models.map(renderModelSection), ...(primaryAlias && secondaryAlias && primaryAlias !== secondaryAlias ? [renderModelSection({ ...models[0], alias: secondaryAlias, displayName: secondaryAlias })] : [])]
  const addition = blocks.join("\n\n")
  return body ? `${body}\n\n${addition}` : addition
}

export function removeTomlSection(source: string, section: string): string {
  const lines = source.split(/\r?\n/)
  const output: string[] = []
  let skipping = false
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (header) skipping = header[1] === section
    if (!skipping) output.push(line)
  }
  return output.join("\n")
}

function shouldWriteEndpointBaseUrl(previous: string, baseUrl: string, source: GrokByokBaseUrlSource): boolean {
  if (source === "environment") return true
  const existing = findExistingEndpointBaseUrl(previous)
  return existing !== null && normalizeGrokBaseUrl(existing) !== existing
}

function renderModelSection(model: GrokByokModelConfig): string {
  return [
    `[model.${model.alias}]`,
    `model = ${tomlString(model.modelId)}`,
    `name = ${tomlString(model.displayName)}`,
    `api_key = ${tomlString(model.apiKey)}`,
    'api_backend = "responses"',
    'auth_scheme = "bearer"',
    "",
  ].join("\n")
}

function upsertTomlStringKeyInSection(source: string, section: string, key: string, value: string): string {
  const lines = source.split(/\r?\n/)
  const output: string[] = []
  const keyPattern = new RegExp(`^\\s*${escapeRegex(key)}\\s*=`)
  let inSection = false
  let foundSection = false
  let wroteKey = false

  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (header && inSection && !wroteKey) {
      output.push(`${key} = ${tomlString(value)}`)
      wroteKey = true
    }
    if (header) {
      inSection = header[1] === section
      foundSection = foundSection || inSection
    }
    if (inSection && keyPattern.test(line)) {
      if (!wroteKey) output.push(`${key} = ${tomlString(value)}`)
      wroteKey = true
      continue
    }
    output.push(line)
  }

  if (foundSection && inSection && !wroteKey) output.push(`${key} = ${tomlString(value)}`)
  if (foundSection) return output.join("\n")
  const body = output.join("\n").trimEnd()
  const addition = `[${section}]\n${key} = ${tomlString(value)}`
  return body ? `${body}\n\n${addition}` : addition
}

function setTomlSectionKey(source: string, section: string, key: string, value: string): string {
  const lines = source.split(/\r?\n/)
  const output: string[] = []
  let inSection = false
  let foundSection = false
  let wroteKey = false
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (header && inSection && !wroteKey) {
      output.push(`${key} = ${value}`)
      wroteKey = true
    }
    if (header) {
      inSection = header[1] === section
      foundSection = foundSection || inSection
      output.push(line)
      continue
    }
    if (inSection && tomlAssignmentKey(line) === key) {
      if (!wroteKey) output.push(`${key} = ${value}`)
      wroteKey = true
      continue
    }
    output.push(line)
  }
  if (inSection && !wroteKey) output.push(`${key} = ${value}`)
  if (!foundSection) {
    const trimmed = output.join("\n").trimEnd()
    const addition = [`[${section}]`, `${key} = ${value}`, ""].join("\n")
    return trimmed ? `${trimmed}\n\n${addition}` : addition
  }
  return output.join("\n")
}

function findTomlStringValue(source: string, section: string, key: string): string | null {
  const keyPattern = new RegExp(`^\\s*${escapeRegex(key)}\\s*=\\s*(\"(?:(?:\\\\.)|[^\"\\\\])*\")`)
  let inSection = false
  for (const line of source.split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/)
    if (header) {
      inSection = header[1] === section
      continue
    }
    if (!inSection) continue
    const match = line.match(keyPattern)
    if (!match) continue
    const parsed = parseTomlBasicString(match[1])
    if (parsed !== null) return parsed
  }
  return null
}

function parseTomlBasicString(value: string | undefined): string | null {
  if (value === undefined) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === "string" ? parsed : null
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

function tomlAssignmentKey(line: string): string | null {
  const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/)
  return match ? match[1] : null
}

function tomlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function escapeRegex(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
