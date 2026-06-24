import { homedir, userInfo } from "node:os"

const TEST_HOME_ENABLED = "1" as const

export function resolveGrokSetupHome(env: NodeJS.ProcessEnv = process.env): string {
  const testHomeAllowed =
    env.LFG_ALLOW_TEST_GROK_HOME === TEST_HOME_ENABLED ||
    (env.LFG_ALLOW_TEST_GROK_HOME !== "0" && process.env.LFG_ALLOW_TEST_GROK_HOME === TEST_HOME_ENABLED)
  if (testHomeAllowed) {
    const explicitTestHome = env.LFG_TEST_GROK_HOME?.trim()
    if (explicitTestHome !== undefined && explicitTestHome.length > 0) {
      return explicitTestHome
    }
    const isolatedHome = env.HOME?.trim()
    if (isolatedHome !== undefined && isolatedHome.length > 0) {
      return isolatedHome
    }
  }
  try {
    const realHome = userInfo().homedir.trim()
    if (realHome.length > 0) {
      return realHome
    }
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error
    }
  }
  return homedir()
}
