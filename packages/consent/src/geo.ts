import {
  CONSENT_AUTO_MAX_AGE, CONSENT_GEO_TIMEOUT, CONSENT_GEO_UNKNOWN, CONSENT_REQUIRED_COUNTRIES,
  CONSENT_SCHEMA_VERSION, CONSENT_TRACE_PATH, DEFAULT_CONSENT_CATEGORIES,
} from './consts.js'
import {
  AUTO_SKEW, CLOUDFLARE_LOCATOR_ALIAS, CLOUDFLARE_LOCATOR_PRIORITY, COUNTRY_CODE,
} from './consts.local.js'
import { consentPluginHelper } from './plugins.js'
import type { ConsentGeoPlugin, ConsentOptions, ConsentRecord } from './types.js'
import type { ConsentNavigator } from './types.local.js'
import type { ConsentAutoState, ConsentGeoHelper, ConsentGeoVerdict } from './geo/types.js'

export const createConsentGeoHelper = (): ConsentGeoHelper => {
  const now = (): number => Math.floor(Date.now() / 1000)

  const enabled = (opts?: ConsentOptions): boolean => {
    const geo = opts?.geo
    if (geo == null) {
      return false
    }

    return (geo.cloudflare != null && geo.cloudflare !== false)
      || consentPluginHelper.consentPlugins().some(plugin => plugin.locate != null
        && plugin.alias !== CLOUDFLARE_LOCATOR_ALIAS)
  }

  const parseTrace = (text: string): Record<string, string> => {
    const trace: Record<string, string> = {}
    for (const line of text.split(/\r?\n/)) {
      const at = line.indexOf('=')
      if (at > 0 && /^[a-z_]+$/.test(line.slice(0, at))) {
        trace[line.slice(0, at)] = line.slice(at + 1).trim()
      }
    }

    return trace
  }

  const cloudflareLocator = (): ConsentGeoPlugin => ({
    alias: CLOUDFLARE_LOCATOR_ALIAS,
    priority: CLOUDFLARE_LOCATOR_PRIORITY,
    locate: async opts => {
      const setting = opts.geo?.cloudflare
      if (setting == null || setting === false) {
        throw new Error('consent:geo:cloudflare:off')
      }
      if (typeof fetch !== 'function') {
        throw new Error('consent:geo:cloudflare:no-fetch')
      }
      const path = typeof setting === 'object' ? setting.path ?? CONSENT_TRACE_PATH : CONSENT_TRACE_PATH
      const response = await fetch(path, { credentials: 'omit', cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`consent:geo:cloudflare:status:${response.status}`)
      }
      const trace = parseTrace(await response.text())
      // Every trace names the edge that answered; an HTML fallback page names nothing at all.
      if (trace.loc == null || (trace.colo == null && trace.fl == null)) {
        throw new Error('consent:geo:cloudflare:not-a-trace')
      }

      return { country: trace.loc }
    },
  })

  const requiresConsent = (country: string | null, opts?: ConsentOptions): boolean => {
    const code = country?.trim().toUpperCase() ?? ''
    if (!COUNTRY_CODE.test(code) || CONSENT_GEO_UNKNOWN.includes(code)) {
      return true
    }

    return (opts?.geo?.countries ?? CONSENT_REQUIRED_COUNTRIES)
      .some(candidate => candidate.toUpperCase() === code)
  }

  const decide = async (opts: ConsentOptions): Promise<ConsentGeoVerdict> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('consent:geo:timeout')), opts.geo?.timeout ?? CONSENT_GEO_TIMEOUT
      )
    })
    try {
      const location = await Promise.race([consentPluginHelper.locateConsent(opts), timeout])

      return requiresConsent(location.country, opts) ? 'ask' : 'auto'
    } catch {
      return 'ask'
    } finally {
      clearTimeout(timer)
    }
  }

  const privacySignal = (): boolean =>
    typeof navigator !== 'undefined'
      && (navigator as unknown as ConsentNavigator).globalPrivacyControl === true

  const automaticRecord = (opts?: ConsentOptions): ConsentRecord => {
    const optOut = privacySignal()
    const record: ConsentRecord = { v: CONSENT_SCHEMA_VERSION, auto: now() }
    for (const category of opts?.categories ?? DEFAULT_CONSENT_CATEGORIES) {
      record[category.key] = category.required === true || !optOut
    }

    return record
  }

  const autoState = (record: ConsentRecord | null): ConsentAutoState | null => {
    if (record == null || typeof record.auto !== 'number') {
      return null
    }
    const age = now() - record.auto

    return age <= CONSENT_AUTO_MAX_AGE && age >= -AUTO_SKEW ? 'fresh' : 'stale'
  }

  return {
    enabled, parseTrace, cloudflareLocator, requiresConsent, decide, privacySignal, automaticRecord,
    autoState,
  }
}

export const consentGeoHelper = createConsentGeoHelper()
