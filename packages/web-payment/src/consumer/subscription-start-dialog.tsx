import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useLegalText, usePaymentText } from './copy.js'
import { ErrorLine, LanguageToggle, LegalLinks, linksFor, useShownLanguage } from './legal.js'
import type { SubscriptionStartDialogProps } from './types.js'

/**
 * The express request to start a subscription's services before its withdrawal period ends,
 * asked BEFORE the subscription checkout (§ 357a Abs. 2 BGB, art. 35 UoPK, L221-25; CJEU C-641/19).
 * Without it a withdrawal owes nothing for the time used.
 *
 * Same shape as the performance consent: the contract language first with a toggle, one
 * unchecked checkbox carrying the whole statement, and the confirm button — "Continue to payment",
 * the step before the paygate's own order button — disabled until it is ticked.
 *
 * Selectors: `[data-start-dialog]` (`data-language`, `data-contract-language`, `data-plan-sku`),
 * `[data-start-checkbox]`, `[data-start-confirm]`, `[data-start-decline]`,
 * `[data-start-language-toggle]`, `[data-legal-link]`.
 */
export const SubscriptionStartDialog = ({
  open, onOpenChange, view, planTitle, price, uiLanguage, pending = false, error, onConfirm, onDecline, links,
  onWithdraw, className,
}: SubscriptionStartDialogProps) => {
  const language = useShownLanguage(view?.language ?? '', uiLanguage, open)
  const legal = useLegalText(language.shown)
  const text = usePaymentText(language.shown)
  const [ticked, setTicked] = useState(false)
  useEffect(() => { setTicked(false) }, [open, language.shown, view?.textVersion, view?.planSku])
  if (view == null) {
    return null
  }

  // The same text `consentStatementOf(lng, 'subscription-start', { trader, plan })` renders on the server.
  const checkbox = legal('subscription-start.checkbox', { trader: view.trader, plan: planTitle })
  const shownLinks = linksFor(language.shown, view.links, links)
  const confirm = async () => {
    if (!ticked || pending) {
      return
    }
    await onConfirm({ planSku: view.planSku, textVersion: view.textVersion, language: language.shown, acknowledged: true })
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      closeLabel={text('consumer.close')}
      data-start-dialog="" data-subscription-start="" data-language={language.shown}
      data-contract-language={language.contract} data-plan-sku={view.planSku} data-text-version={view.textVersion}
      className={cn('max-h-[90vh] overflow-y-auto', className)}
    >
      <DialogHeader>
        <DialogTitle lang={language.shown}>{legal('subscription-start.title', { plan: planTitle })}</DialogTitle>
        <DialogDescription lang={language.shown}>{legal('subscription-start.intro')}</DialogDescription>
      </DialogHeader>
      <LanguageToggle language={language} hook="data-start-language-toggle" />
      <div className="grid gap-4" lang={language.shown}>
        {price != null && <div className="text-sm" data-start-price="">{price}</div>}
        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox
            id="subscription-start-checkbox" data-start-checkbox="" checked={ticked} disabled={pending}
            onCheckedChange={value => setTicked(value === true)} className="mt-0.5"
          />
          <Label htmlFor="subscription-start-checkbox" className="block text-sm leading-snug font-normal"
            data-start-statement="">
            {checkbox}
          </Label>
        </div>
        <LegalLinks links={shownLinks} legal={legal} onWithdraw={onWithdraw} />
        <ErrorLine error={error} text={text} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" data-start-decline="" disabled={pending}
          onClick={() => onDecline != null ? onDecline() : onOpenChange(false)}>
          {legal('subscription-start.decline')}
        </Button>
        <Button type="button" data-start-confirm="" disabled={!ticked || pending} onClick={() => void confirm()}>
          {pending ? text('consumer.pending') : legal('subscription-start.confirm')}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
