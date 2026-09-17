import { Button } from '@/components/ui/button'
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card'
import { useEntitlementCopy } from './copy.js'
import { planStatusLineOf } from './selectors.js'
import type { PlanCardProps, PlanStatusTone } from './types.js'

const TONE_DOT: Record<PlanStatusTone, string> = {
  ok: 'bg-primary',
  warning: 'bg-destructive/60',
  critical: 'bg-destructive',
  inactive: 'bg-muted-foreground',
}

const classes = (...names: Array<string | false | null | undefined>): string =>
  names.filter(Boolean).join(' ')

/**
 * One plan: the entity's own (a status line) or an offered one (its price). The package renders no
 * product copy — titles, prices and the action label come from the application.
 */
export const PlanCard = ({
  plan, offer, current, pending = false, actionLabel, onAction, className, children,
}: PlanCardProps) => {
  const copy = useEntitlementCopy()
  const sku = offer?.sku ?? plan.sku
  const isCurrent = current ?? (offer != null && offer.sku === plan.sku)
  const status = offer == null || isCurrent ? planStatusLineOf(plan) : null
  const statusText = status == null
    ? null
    : copy.text(status.date != null ? `status.${status.kind}-on` : `status.${status.kind}`, {
      date: copy.day(status.date),
    })

  return <Card
    data-plan-card=""
    data-plan-sku={sku}
    data-plan-status={status?.kind}
    data-plan-tone={status?.tone}
    data-current={isCurrent ? 'true' : undefined}
    className={classes(offer?.highlight === true && 'border-primary ring-1 ring-primary', className)}
  >
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{offer?.title ?? plan.title}</CardTitle>
        {isCurrent && <span data-plan-current="" className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
          {copy.text('plan.current')}
        </span>}
      </div>
      {status != null && <CardDescription data-plan-status-line="" className="flex items-center gap-2">
        <span aria-hidden="true" className={classes('size-2 shrink-0 rounded-full', TONE_DOT[status.tone])} />
        <span>{statusText}</span>
      </CardDescription>}
    </CardHeader>
    {(offer != null || children != null) && <CardContent className="grid gap-4">
      {offer != null && <p data-plan-price="" className="text-2xl font-semibold tracking-tight">{offer.priceLabel}</p>}
      {children}
    </CardContent>}
    {onAction != null && actionLabel != null && <CardFooter>
      <Button
        type="button" className="w-full" variant={isCurrent ? 'outline' : 'default'} disabled={pending}
        onClick={() => void onAction(sku)}
      >{actionLabel}</Button>
    </CardFooter>}
  </Card>
}
