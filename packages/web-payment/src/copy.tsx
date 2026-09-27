import { useMemo } from 'react'
import { useI18nLib, useLanguage } from '@owlmeans/client-i18n'
import type { PromoView } from '@owlmeans/payment'
import { promoInscriptionOf } from './selectors.js'

/**
 * A calendar date in UTC — the calendar limit windows are counted in, so "resets on" names the day
 * the counter actually rolls. An unparseable date renders as nothing.
 */
const formatDay = (date: Date | string | null | undefined, locale: string): string => {
  if (date == null) {
    return ''
  }
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) {
    return ''
  }
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(value)
  } catch {
    return value.toISOString().slice(0, 10)
  }
}

const formatCount = (value: number, locale: string): string => {
  try {
    return new Intl.NumberFormat(locale).format(value)
  } catch {
    return String(value)
  }
}

export interface EntitlementCopy {
  text: (key: string, values?: Record<string, string>) => string
  day: (date: Date | string | null | undefined) => string
  count: (value: number) => string
}

/** The `entitlement` branch of the `web-payment` library resource, with locale-aware formatting. */
export const useEntitlementCopy = (): EntitlementCopy => {
  const t = useI18nLib('web-payment', 'entitlement')
  const [locale] = useLanguage()

  return useMemo(() => ({
    // React escapes what it renders; i18next escaping on top would print `&#x2F;` for a slash.
    text: (key, values) => t(key, { ...values, interpolation: { escapeValue: false } }),
    day: date => formatDay(date, locale),
    count: value => formatCount(value, locale),
  }), [t, locale])
}

/** The inscription of a promo: free until its end, kept for a grandfathered plan, or ended. */
export const PromoNote = ({ promo, copy }: { promo?: PromoView, copy: EntitlementCopy }) => {
  const kind = promoInscriptionOf(promo)
  if (kind == null || promo == null) {
    return null
  }

  return <span data-promo={kind} className={kind === 'ended' ? 'text-muted-foreground' : 'text-primary'}>
    {copy.text(`promo.${kind}`, { date: copy.day(promo.until) })}
  </span>
}
