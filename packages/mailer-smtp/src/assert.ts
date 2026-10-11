import type { SmtpMailerOptions, SmtpSettings } from './types.js'

/** Validate the settings required by an authenticated production relay. */
export const assertSmtpSettings = (
  smtp: SmtpSettings | undefined, alias: string, opts: SmtpMailerOptions = {}
): SmtpSettings => {
  const required: Array<keyof Pick<SmtpSettings, 'host' | 'from' | 'user' | 'pass'>> =
    opts.authenticated === true ? ['host', 'from', 'user', 'pass'] : ['host']
  const missing = required.filter(key => smtp?.[key] == null || String(smtp[key]).trim() === '')
  if (missing.length > 0) {
    throw new SyntaxError(`${alias}: cfg.smtp.${missing.join(', cfg.smtp.')} is not configured`)
  }

  return smtp as SmtpSettings
}
