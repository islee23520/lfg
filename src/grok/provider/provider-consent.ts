import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const LEDGER_DIR = ".ledger"
const PROVIDER_CONSENT_FILE = "openai-compatible-provider-consent.json"

export type ProviderConsentOptions = {
  readonly env?: NodeJS.ProcessEnv
  readonly providerConsentPath?: string
  readonly home?: string
}

function resolveGrokHome(options: ProviderConsentOptions = {}): string {
  const env = options.env ?? process.env
  if (typeof options.home === "string" && options.home.length > 0) return options.home
  const fromEnv = env.LFG_TEST_GROK_HOME?.trim() || env.HOME?.trim()
  if (env.LFG_ALLOW_TEST_GROK_HOME === "1" && fromEnv) return fromEnv
  return homedir()
}

export function getProviderConsentPath(options: ProviderConsentOptions = {}): string {
  if (options.providerConsentPath) return options.providerConsentPath
  const home = resolveGrokHome(options)
  return join(home, ".grok", LEDGER_DIR, "lfg", PROVIDER_CONSENT_FILE)
}

export function readProviderConsent(options: ProviderConsentOptions = {}): boolean | null {
  const consentPath = getProviderConsentPath(options)
  if (!existsSync(consentPath)) return null
  try {
    const parsed = JSON.parse(readFileSync(consentPath, "utf8")) as {
      readonly installOpenAiCompatProvider?: unknown
    }
    if (parsed.installOpenAiCompatProvider === true) return true
    if (parsed.installOpenAiCompatProvider === false) return false
    return null
  } catch {
    return null
  }
}

export function saveProviderConsent(
  installOpenAiCompatProvider: boolean,
  options: ProviderConsentOptions = {},
): string {
  const consentPath = getProviderConsentPath(options)
  mkdirSync(dirname(consentPath), { recursive: true })
  writeFileSync(
    consentPath,
    `${JSON.stringify(
      {
        installOpenAiCompatProvider,
        recordedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  )
  return consentPath
}
