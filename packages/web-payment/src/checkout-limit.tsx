import { useI18nLib, useLanguage } from '@owlmeans/client-i18n'
import { cn } from '@/lib/utils'
import { money, shortMomentUtc } from './format.js'
import type { CheckoutLimitNoteProps } from './types.js'

/** The reasons the package phrases itself; any other reads the generic sentence. */
const KNOWN_REASONS = ['per-purchase', 'window', 'hold']

/**
 * What an amount checkout is narrowed to for this entity now: the largest amount (or that nothing
 * may be bought), why, and when it rises again — the same `CheckoutLimitView` the server refuses
 * with, so the note and a refusal never disagree.
 *
 * `[data-checkout-limit]` carries `data-max-minor`, `data-blocked`, `data-reason` and, when known,
 * `data-resets-at` (ISO).
 */
export const CheckoutLimitNote = ({ limit, reasonLabel, className }: CheckoutLimitNoteProps) => {
  const t = useI18nLib('web-payment', 'checkout-limit')
  const [locale] = useLanguage()
  if (limit == null || (!limit.narrowed && !limit.blocked)) {
    return null
  }

  const reason = limit.reason ?? ''
  const custom = typeof reasonLabel === 'function' ? reasonLabel(reason) : reasonLabel
  const explained = custom != null && custom !== ''
    ? custom
    : t(`reason.${KNOWN_REASONS.includes(reason) ? reason : 'other'}`)
  const resetsAt = limit.resetsAt != null ? new Date(limit.resetsAt) : null
  const resets = resetsAt != null && !Number.isNaN(resetsAt.getTime())
    ? t('resets', { date: shortMomentUtc(resetsAt, locale), interpolation: { escapeValue: false } })
    : null

  return <div
    data-checkout-limit="" data-max-minor={limit.maximumMinor} data-blocked={limit.blocked ? 'true' : 'false'}
    data-reason={reason} data-resets-at={resetsAt?.toISOString()}
    role={limit.blocked ? 'alert' : 'note'}
    className={cn('grid gap-1 rounded-lg border p-3 text-sm', limit.blocked ? 'border-destructive/50' : 'bg-muted/30', className)}
  >
    <p className={limit.blocked ? 'text-destructive font-medium' : 'font-medium'} data-checkout-limit-headline="">
      {limit.blocked
        ? t('blocked')
        : t('note', { amount: money(limit.maximumMinor, limit.currency, locale), interpolation: { escapeValue: false } })}
    </p>
    <p className="text-muted-foreground text-xs" data-checkout-limit-reason="">{explained}</p>
    {resets != null && <p className="text-muted-foreground text-xs" data-checkout-limit-resets="">{resets}</p>}
  </div>
}
