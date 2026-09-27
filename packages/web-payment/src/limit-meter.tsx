import { LimitKind } from '@owlmeans/payment'
import { Progress } from '@/components/ui/progress'
import { PromoNote, useEntitlementCopy } from './copy.js'
import { limitStatusOf } from './selectors.js'
import type { LimitMeterProps } from './types.js'

const classes = (...names: Array<string | false | null | undefined>): string =>
  names.filter(Boolean).join(' ')

/**
 * One limit: `used of limit`, a bar, when a window limit resets and any promo behind it. A limit
 * of `0` is "not included" and draws no bar.
 */
export const LimitMeter = ({ limit, label, showReset = true, compact = false, className }: LimitMeterProps) => {
  const copy = useEntitlementCopy()
  const status = limitStatusOf(limit)!
  const included = limit.limit > 0
  const usage = !included
    ? copy.text('limit.not-included')
    : copy.text(limit.unit != null ? 'limit.usage-unit' : 'limit.usage', {
      used: copy.count(limit.used), limit: copy.count(limit.limit), unit: limit.unit ?? '',
    })
  const resets = showReset && limit.kind === LimitKind.Window && limit.resetsAt != null
    ? copy.text('limit.resets-on', { date: copy.day(limit.resetsAt) })
    : null
  const exhausted = included && status.exhausted

  return <div
    data-limit-meter=""
    data-limit-key={limit.key}
    data-limit-kind={limit.kind}
    data-included={included ? 'true' : 'false'}
    data-exhausted={status.exhausted ? 'true' : 'false'}
    className={classes('grid', compact ? 'gap-1 text-xs' : 'gap-2 text-sm', className)}
  >
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <span className="font-medium">{label}</span>
      <span data-limit-usage="" className={classes(
        'tabular-nums', exhausted ? 'text-destructive' : 'text-muted-foreground',
      )}>{usage}</span>
    </div>
    {included && <Progress
      value={Math.round(status.ratio * 100)}
      aria-label={label}
      className={classes(compact && 'h-1.5', exhausted && '[&>[data-slot=progress-indicator]]:bg-destructive')}
    />}
    {(exhausted || resets != null || limit.promo != null) && <p className={classes(
      'text-muted-foreground flex flex-wrap gap-x-3 gap-y-1', compact ? 'text-[0.6875rem]' : 'text-xs',
    )}>
      {exhausted && <span data-limit-exhausted="" className="text-destructive">{copy.text('limit.exhausted')}</span>}
      {resets != null && <span data-limit-resets="">{resets}</span>}
      <PromoNote promo={limit.promo} copy={copy} />
    </p>}
  </div>
}
