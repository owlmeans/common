import { useEffect, useMemo, useState } from 'react'
import { useI18nLib, useLanguage } from '@owlmeans/client-i18n'
import { assertCheckoutAmount, chargeAmountMinor, narrowAmountPolicy } from '@owlmeans/payment'
import type { AmountCheckoutPolicy, CheckoutLimitView } from '@owlmeans/payment'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inputAmount, parseAmountMinor } from './amount.js'
import { CheckoutLimitNote } from './checkout-limit.js'
import { PriceEstimateSummary } from './estimate-summary.js'
import { money } from './format.js'
import type { AmountCheckoutDialogProps } from './types.js'

/**
 * The policy the dialog offers: `policy` narrowed by `limit` — the same `narrowAmountPolicy` the
 * server refuses with. A policy the package cannot narrow (an invalid one) is offered as given.
 */
const effectivePolicyOf = (policy: AmountCheckoutPolicy, limit?: CheckoutLimitView | null): AmountCheckoutPolicy => {
  if (limit == null || (!limit.narrowed && !limit.blocked)) {
    return policy
  }
  try {
    return narrowAmountPolicy(policy, [{
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
  open, onOpenChange, policy: basePolicy, pending = false, onConfirm, estimate, limit, legalNote,
}: AmountCheckoutDialogProps) => {
  const t = useI18nLib('web-payment', 'amount-checkout')
  const [locale] = useLanguage()
  const policy = useMemo(() => effectivePolicyOf(basePolicy, limit), [basePolicy, limit])
  const blocked = limit?.blocked === true
  // The limit, not the plan, set the maximum — also when `policy` arrives already narrowed.
  const limited = limit != null && limit.narrowed && limit.maximumMinor <= policy.maximumMinor
  const [value, setValue] = useState(() => inputAmount(policy.defaultMinor, locale))
  useEffect(() => {
    if (open) setValue(inputAmount(policy.defaultMinor, locale))
  }, [open, policy.defaultMinor, locale])

  const amountMinor = useMemo(() => parseAmountMinor(value, locale), [value, locale])
  const error = blocked
    ? null
    : amountMinor == null
      ? t('invalid')
      : amountMinor < policy.minimumMinor
        ? t('below', { amount: money(policy.minimumMinor, policy.currency, locale) })
        : amountMinor > policy.maximumMinor
          ? t(limited ? 'above-limit' : 'above', { amount: money(policy.maximumMinor, policy.currency, locale) })
          : null
  const valid = !blocked && error == null && amountMinor != null
  const chargeMinor = valid ? chargeAmountMinor(amountMinor, policy) : 0
  const adjustmentMinor = valid && amountMinor != null ? chargeMinor - amountMinor : 0
  const locked = pending || blocked
  const submit = async () => {
    if (amountMinor == null || !valid || locked) return
    assertCheckoutAmount(policy, amountMinor)
    await onConfirm(amountMinor, estimate?.country)
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent closeLabel={t('close')} data-amount-checkout="" data-blocked={blocked ? 'true' : 'false'}>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-5">
        {limit != null && <CheckoutLimitNote limit={limit} />}
        {policy.presetsMinor.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t('presets')}>
          {policy.presetsMinor.map(preset => <Button
            key={preset} type="button" variant={preset === amountMinor ? 'default' : 'outline'} data-amount-preset={preset}
            disabled={locked} onClick={() => setValue(inputAmount(preset, locale))}
          >{money(preset, policy.currency, locale)}</Button>)}
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
              minimum: money(policy.minimumMinor, policy.currency, locale),
              maximum: money(policy.maximumMinor, policy.currency, locale),
            })}
          </p>}
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
          <dt className="text-muted-foreground">{t('credits')}</dt><dd>{valid && amountMinor != null ? money(amountMinor, policy.currency, locale) : '—'}</dd>
          <dt className="text-muted-foreground">{t('adjustment')}</dt><dd>{valid ? money(adjustmentMinor, policy.currency, locale) : '—'}</dd>
          <dt className="font-medium">{t('subtotal')}</dt><dd className="font-medium">{valid ? money(chargeMinor, policy.currency, locale) : '—'}</dd>
        </dl>
        {estimate != null
          ? valid && <PriceEstimateSummary control={estimate} subtotalMinor={chargeMinor} currency={policy.currency} />
          : <p className="text-muted-foreground text-xs">{t('tax-note')}</p>}
        {legalNote != null && <div className="text-muted-foreground text-xs" data-legal-note="">{legalNote}</div>}
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
