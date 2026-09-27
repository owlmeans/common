import { useEffect, useState } from 'react'
import type { PerformanceConsentView } from '@owlmeans/payment'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { lastDayUtc, dayUtc, money } from '../format.js'
import { useLegalText, usePaymentText } from './copy.js'
import { ErrorLine, LanguageToggle, LegalLinks, linksFor, useShownLanguage } from './legal.js'
import type { PerformanceConsentDialogProps } from './types.js'

/** The latest deadline of the view — its own, else the latest of its purchases. */
const deadlineOf = (view: PerformanceConsentView): Date | undefined => {
  if (view.deadline != null) {
    return new Date(view.deadline)
  }
  const times = view.purchases
    .map(purchase => purchase.deadline != null ? new Date(purchase.deadline).getTime() : NaN)
    .filter(time => !Number.isNaN(time))

  return times.length > 0 ? new Date(Math.max(...times)) : undefined
}

/**
 * The express request to start performing now, asked before credits bought inside their
 * withdrawal window are spent (CRD Art. 16(m), § 356 Abs. 5 BGB, art. 38 UoPK, L221-28).
 *
 * The legal copy is shown in the CONTRACT language (`view.language`) with a toggle to the
 * interface language; the purchases it covers are listed with their deadlines; ONE checkbox
 * carries the whole statement and starts unchecked, and the confirm button stays disabled until
 * it is ticked. Toggling the language unticks it — the statement agreed to is the one on screen —
 * and `onConfirm` records the language actually shown.
 *
 * Selectors: `[data-consent-dialog]` (with `data-language`, `data-contract-language`),
 * `[data-consent-purchase]` (`data-purchase-id`, `data-deadline`), `[data-consent-checkbox]`,
 * `[data-consent-confirm]`, `[data-consent-decline]`, `[data-consent-language-toggle]`,
 * `[data-legal-link]`.
 */
export const PerformanceConsentDialog = ({
  open, onOpenChange, view, uiLanguage, pending = false, error, onConfirm, onDecline, links, onWithdraw,
  formatAmount, className,
}: PerformanceConsentDialogProps) => {
  const language = useShownLanguage(view?.language ?? '', uiLanguage, open)
  const legal = useLegalText(language.shown)
  const text = usePaymentText(language.shown)
  const [ticked, setTicked] = useState(false)
  useEffect(() => { setTicked(false) }, [open, language.shown, view?.textVersion])
  if (view == null) {
    return null
  }

  const format = (minor: number, currency: string) => formatAmount != null
    ? formatAmount(minor, currency, language.shown) : money(minor, currency, language.shown)
  // The same text `consentStatementOf(lng, 'performance', { trader })` renders on the server.
  const checkbox = legal('performance-consent.checkbox', { trader: view.trader })
  const deadline = deadlineOf(view)
  const shownLinks = linksFor(language.shown, view.links, links)
  const confirm = async () => {
    if (!ticked || pending) {
      return
    }
    await onConfirm({
      purchaseIds: view.purchases.map(purchase => purchase.purchaseId),
      textVersion: view.textVersion,
      language: language.shown,
      acknowledged: true,
      uiLanguage: language.ui,
    })
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      closeLabel={text('consumer.close')}
      data-consent-dialog="" data-performance-consent="" data-language={language.shown}
      data-contract-language={language.contract} data-text-version={view.textVersion}
      className={cn('max-h-[90vh] overflow-y-auto', className)}
      {...(deadline == null ? { 'aria-describedby': undefined } : {})}
    >
      <DialogHeader>
        <DialogTitle lang={language.shown}>{legal('performance-consent.title')}</DialogTitle>
        {deadline != null && <DialogDescription lang={language.shown}>
          {legal('performance-consent.intro', { count: view.purchases.length, deadline: lastDayUtc(deadline, language.shown) })}
        </DialogDescription>}
      </DialogHeader>
      <LanguageToggle language={language} hook="data-consent-language-toggle" />
      <div className="grid gap-4" lang={language.shown}>
        {view.purchases.length > 0 && <section className="grid gap-2" aria-label={text('consumer.purchases')}>
          <h3 className="text-sm font-medium">{text('consumer.purchases')}</h3>
          <ul className="grid gap-1.5 text-sm">
            {view.purchases.map(purchase => <li
              key={purchase.purchaseId} data-consent-purchase="" data-purchase-id={purchase.purchaseId}
              data-deadline={purchase.deadline != null ? new Date(purchase.deadline).toISOString() : undefined}
              className="rounded-md border px-3 py-2"
            >
              {purchase.deadline != null
                ? legal('performance-consent.purchase', {
                  date: dayUtc(purchase.purchasedAt, language.shown),
                  amount: format(purchase.amountTotalMinor, purchase.currency),
                  deadline: lastDayUtc(purchase.deadline, language.shown),
                })
                : `${dayUtc(purchase.purchasedAt, language.shown)} (${format(purchase.amountTotalMinor, purchase.currency)})`}
            </li>)}
          </ul>
        </section>}
        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox
            id="performance-consent-checkbox" data-consent-checkbox="" checked={ticked} disabled={pending}
            onCheckedChange={value => setTicked(value === true)} className="mt-0.5"
          />
          <Label htmlFor="performance-consent-checkbox" className="block text-sm leading-snug font-normal"
            data-consent-statement="">
            {checkbox}
          </Label>
        </div>
        <LegalLinks links={shownLinks} legal={legal} onWithdraw={onWithdraw} />
        <ErrorLine error={error} text={text} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" data-consent-decline="" disabled={pending}
          onClick={() => onDecline != null ? onDecline() : onOpenChange(false)}>
          {legal('performance-consent.decline')}
        </Button>
        <Button type="button" data-consent-confirm="" disabled={!ticked || pending} onClick={() => void confirm()}>
          {pending ? text('consumer.pending') : legal('performance-consent.confirm')}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
