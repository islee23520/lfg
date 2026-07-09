/**
 * Creates OmO-specific environment context (timezone, locale).
 *
 * This upstream helper is host-neutral: working directory, platform, and date
 * are intentionally left to the host system prompt to avoid duplication.
 */
export function createEnvContext(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const locale = Intl.DateTimeFormat().resolvedOptions().locale

  return `
<omo-env>
  Timezone: ${timezone}
  Locale: ${locale}
</omo-env>`
}
