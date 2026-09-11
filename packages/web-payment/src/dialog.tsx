import { useEffect, useMemo, useState } from 'react'
import { useI18nLib, useLanguage } from '@owlmeans/client-i18n'
import { assertCheckoutAmount, chargeAmountMinor } from '@owlmeans/payment'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inputAmount, parseAmountMinor } from './amount.js'
import type { AmountCheckoutDialogProps } from './types.js'

const money = (minor: number, currency: string, locale: string): string => new Intl.NumberFormat(locale, {
  style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2,
}).format(minor / 100)

export const AmountCheckoutDialog = ({
  open, onOpenChange, policy, pending = false, onConfirm,
}: AmountCheckoutDialogProps) => {
  const t = useI18nLib('web-payment', 'amount-checkout')
  const [locale] = useLanguage()
  const [value, setValue] = useState(() => inputAmount(policy.defaultMinor, locale))
  useEffect(() => {
    if (open) setValue(inputAmount(policy.defaultMinor, locale))
  }, [open, policy.defaultMinor, locale])

  const amountMinor = useMemo(() => parseAmountMinor(value, locale), [value, locale])
  const error = amountMinor == null
    ? t('invalid')
    : amountMinor < policy.minimumMinor
      ? t('below', { amount: money(policy.minimumMinor, policy.currency, locale) })
      : amountMinor > policy.maximumMinor
        ? t('above', { amount: money(policy.maximumMinor, policy.currency, locale) })
        : null
  const valid = error == null && amountMinor != null
  const chargeMinor = valid ? chargeAmountMinor(amountMinor, policy) : 0
  const adjustmentMinor = valid && amountMinor != null ? chargeMinor - amountMinor : 0
  const submit = async () => {
    if (amountMinor == null || !valid || pending) return
    assertCheckoutAmount(policy, amountMinor)
    await onConfirm(amountMinor)
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent closeLabel={t('close')}>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t('presets')}>
          {policy.presetsMinor.map(preset => <Button
            key={preset} type="button" variant={preset === amountMinor ? 'default' : 'outline'}
            disabled={pending} onClick={() => setValue(inputAmount(preset, locale))}
          >{money(preset, policy.currency, locale)}</Button>)}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="payment-amount">{t('custom')}</Label>
          <Input
            id="payment-amount" inputMode="decimal" autoComplete="off" value={value}
            disabled={pending} aria-invalid={error != null} aria-describedby="payment-amount-help"
            onChange={event => setValue(event.target.value)}
          />
          <p id="payment-amount-help" className={error == null ? 'text-muted-foreground text-xs' : 'text-destructive text-xs'}>
            {error ?? t('bounds', {
              minimum: money(policy.minimumMinor, policy.currency, locale),
              maximum: money(policy.maximumMinor, policy.currency, locale),
            })}
          </p>
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
          <dt className="text-muted-foreground">{t('credits')}</dt><dd>{valid && amountMinor != null ? money(amountMinor, policy.currency, locale) : '—'}</dd>
          <dt className="text-muted-foreground">{t('adjustment')}</dt><dd>{valid ? money(adjustmentMinor, policy.currency, locale) : '—'}</dd>
          <dt className="font-medium">{t('subtotal')}</dt><dd className="font-medium">{valid ? money(chargeMinor, policy.currency, locale) : '—'}</dd>
        </dl>
        <p className="text-muted-foreground text-xs">{t('tax-note')}</p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
        <Button type="button" disabled={!valid || pending} onClick={() => void submit()}>{pending ? t('pending') : t('continue')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
