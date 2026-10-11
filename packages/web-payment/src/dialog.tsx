import { useEffect, useMemo, useState } from 'react'
import { useI18nLib, useLanguage } from '@owlmeans/client-i18n'
import { type AmountCheckoutPolicy, type CheckoutLimitView, checkoutPricingHelper, amountNarrowingHelper } from '@owlmeans/payment'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { amountInputHelper } from './amount.js'
import { CheckoutLimitNote } from './checkout-limit.js'
import { PriceEstimateSummary } from './estimate-summary.js'
import type { AmountCheckoutDialogProps } from './types.js'
import { formatHelper } from './format.js'

/**
 * The policy the dialog offers: `policy` narrowed by `limit` — the same `narrowAmountPolicy` the
 * server refuses with. A policy the package cannot narrow (an invalid one) is offered as given.
 */
const effectivePolicyOf = (policy: AmountCheckoutPolicy, limit?: CheckoutLimitView | null): AmountCheckoutPolicy => {
  if (limit == null || (!limit.narrowed && !limit.blocked)) {
    return policy
  }
  try {
    return amountNarrowingHelper.narrowAmountPolicy(policy, [{
      maximumMinor: limit.maximumMinor,
      reason: limit.reason ?? 'limit',
      ...(limit.resetsAt != null ? { resetsAt: limit.resetsAt } : {}),
      ...(limit.remainingMinor != null ? { remainingMinor: limit.remainingMinor } : {}),
    }]).policy
  } catch {
    return policy
  }
}

export const AmountCheckoutDialog = ({
  open, onOpenChange, policy: basePolicy, pending = false, disabled = false, onConfirm, estimate, limit, legalNote, details,
}: AmountCheckoutDialogProps) => {
  const t = useI18nLib('web-payment', 'amount-checkout')
  const [locale] = useLanguage()
  const policy = useMemo(() => effectivePolicyOf(basePolicy, limit), [basePolicy, limit])
  const blocked = limit?.blocked === true
  // The limit, not the plan, set the maximum — also when `policy` arrives already narrowed.
  const limited = limit != null && limit.narrowed && limit.maximumMinor <= policy.maximumMinor
  const [value, setValue] = useState(() => amountInputHelper.inputAmount(policy.defaultMinor, locale))
  useEffect(() => {
    if (open) setValue(amountInputHelper.inputAmount(policy.defaultMinor, locale))
  }, [open, policy.defaultMinor, locale])

  const amountMinor = useMemo(() => amountInputHelper.parseAmountMinor(value, locale), [value, locale])
  const error = blocked
    ? null
    : amountMinor == null
      ? t('invalid')
      : amountMinor < policy.minimumMinor
        ? t('below', { amount: formatHelper.money(policy.minimumMinor, policy.currency, locale) })
        : amountMinor > policy.maximumMinor
          ? t(limited ? 'above-limit' : 'above', { amount: formatHelper.money(policy.maximumMinor, policy.currency, locale) })
          : null
  const valid = !blocked && error == null && amountMinor != null
  const chargeMinor = valid ? checkoutPricingHelper.chargeAmountMinor(amountMinor, policy) : 0
  const adjustmentMinor = valid && amountMinor != null ? chargeMinor - amountMinor : 0
  const locked = pending || blocked || disabled
  const limitNote = limit != null ? <CheckoutLimitNote limit={limit} /> : null
  const submit = async () => {
    if (amountMinor == null || !valid || locked) return
    checkoutPricingHelper.assertCheckoutAmount(policy, amountMinor)
    await onConfirm(amountMinor, estimate?.country)
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      closeLabel={t('close')} data-amount-checkout="" data-blocked={blocked ? 'true' : 'false'}
      // With `details` the dialog is sized by the window, not by its content: 90% of it, half from `lg`
      // (a landscape tablet and wider). Every class replaces its base twin (`w-full`,
      // `max-w-[calc(100%-2rem)]`, `sm:max-w-lg`), so no base cap is left to narrow it. Its body
      // scrolls in any case: the tier details, the estimate and the legal note can outgrow a short
      // screen, and the confirm button must stay reachable.
      className={cn('max-h-[90vh] overflow-y-auto', details != null && 'w-[90vw] max-w-none sm:max-w-none lg:w-[50vw]')}
    >
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      {/* With `details` the two blocks are a wrapping flex row that fills the dialog's content box:
          purchase 3 to side 2 (`flex-3` / `flex-2`, basis 0), a `gap-x-6` between them — the dialog's own
          padding — and the WHOLE side column drops under the purchase block once the dialog cannot hold
          both minimums. Both edges therefore meet the footer's: the confirm button ends where the side
          column does, or the purchase block once it is alone on its row. */}
      <div className={details != null ? 'flex flex-wrap gap-x-6 gap-y-5' : 'grid gap-5'}>
        <div className={cn('grid content-start gap-5', details != null && 'min-w-60 flex-3')}>
          {details == null && limitNote}
          {policy.presetsMinor.length > 0 && <div className="@container">
            <div className="grid grid-cols-2 gap-2 @sm:grid-cols-4" aria-label={t('presets')}>
              {policy.presetsMinor.map(preset => <Button
                key={preset} type="button" variant={preset === amountMinor ? 'default' : 'outline'} data-amount-preset={preset}
                disabled={locked} onClick={() => setValue(amountInputHelper.inputAmount(preset, locale))}
              >{formatHelper.money(preset, policy.currency, locale)}</Button>)}
            </div>
          </div>}
          <div className="grid gap-2">
            <Label htmlFor="payment-amount">{t('custom')}</Label>
            <Input
              id="payment-amount" inputMode="decimal" autoComplete="off" value={value}
              disabled={locked} aria-invalid={error != null} aria-describedby="payment-amount-help"
              onChange={event => setValue(event.target.value)}
            />
            {!blocked && <p id="payment-amount-help" className={error == null ? 'text-muted-foreground text-xs' : 'text-destructive text-xs'}>
              {error ?? t('bounds', {
                minimum: formatHelper.money(policy.minimumMinor, policy.currency, locale),
                maximum: formatHelper.money(policy.maximumMinor, policy.currency, locale),
              })}
            </p>}
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
            <dt className="text-muted-foreground">{t('credits')}</dt><dd>{valid && amountMinor != null ? formatHelper.money(amountMinor, policy.currency, locale) : '—'}</dd>
            <dt className="text-muted-foreground">{t('adjustment')}</dt><dd>{valid ? formatHelper.money(adjustmentMinor, policy.currency, locale) : '—'}</dd>
            <dt className="font-medium">{t('subtotal')}</dt><dd className="font-medium">{valid ? formatHelper.money(chargeMinor, policy.currency, locale) : '—'}</dd>
          </dl>
          {estimate != null
            ? valid && <PriceEstimateSummary control={estimate} subtotalMinor={chargeMinor} currency={policy.currency} />
            : <p className="text-muted-foreground text-xs">{t('tax-note')}</p>}
        </div>
        {details != null && <aside data-amount-details="" className="grid min-w-44 flex-2 gap-5 self-start">{limitNote}{details}</aside>}
        {legalNote != null && <div className={cn('text-muted-foreground text-xs', details != null && 'basis-full')} data-legal-note="">{legalNote}</div>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
        <Button type="button" data-amount-confirm="" disabled={!valid || locked} onClick={() => void submit()}>
          {pending ? t('pending') : t('continue')}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
