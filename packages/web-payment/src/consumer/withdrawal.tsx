import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { baseLanguageOf } from '@owlmeans/payment'
import type { WithdrawalBody, WithdrawalCandidate, WithdrawalReceipt } from '@owlmeans/payment'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { dayUtc, lastDayUtc, momentUtc, money } from '../format.js'
import { legalTextOf, paymentTextOf, useLegalText, usePaymentText } from './copy.js'
import { Choice, Field, Honeypot, isEmail } from './fields.js'
import { ErrorLine, LanguageToggle, useShownLanguage, useUiLanguage } from './legal.js'
import type {
  DeclarationStep, WithdrawalDialogProps, WithdrawalFormProps, WithdrawalFunctionButtonProps,
} from './types.js'

/**
 * The withdrawal function's entry (CRD Art. 11a; § 356a BGB "Vertrag widerrufen"; L221-21
 * "Renoncer au contrat ici"): the statutory label in the CONTRACT language, and the interface
 * language's label as its `title` when the two differ.
 *
 * `[data-withdrawal-function]` with `data-language`.
 */
export const WithdrawalFunctionButton = ({
  language, uiLanguage, onClick, disabled, variant = 'outline', className,
}: WithdrawalFunctionButtonProps) => {
  const ui = useUiLanguage(uiLanguage)
  const contract = baseLanguageOf(language) || ui
  const label = legalTextOf(contract)('withdrawal.function')
  const title = contract !== ui ? legalTextOf(ui)('withdrawal.function') : undefined

  return <Button type="button" variant={variant} onClick={onClick} disabled={disabled} title={title} lang={contract}
    data-withdrawal-function="" data-language={contract} className={className}>
    {label}
  </Button>
}

const isWithdrawalReceipt = (receipt: object): receipt is WithdrawalReceipt => 'status' in receipt

interface Frame {
  title: string
  intro: string
  language: string
  step: DeclarationStep
}

interface StepsProps extends WithdrawalFormProps {
  /** How the title and intro are rendered — a section heading, or a dialog's title. */
  frame: (frame: Frame, body: ReactNode) => ReactNode
}

/** The three steps, framed by the caller. */
const WithdrawalSteps = ({
  mode, language: contractLanguage, uiLanguage, list, defaults, pending = false, error, receipt, onSubmit, onClose,
  formatAmount, frame,
}: StepsProps) => {
  const language = useShownLanguage(contractLanguage, uiLanguage)
  const legal = useLegalText(language.shown)
  const text = usePaymentText(language.shown)
  const candidates = useMemo(() => list?.candidates ?? [], [list])

  const initialPurchase = (): string => {
    const byId = candidates.find(candidate => candidate.purchaseId === defaults?.purchaseId)
    const byRef = candidates.find(candidate => candidate.contractRef === defaults?.contractRef)

    return (byId ?? byRef ?? (candidates.length === 1 ? candidates[0] : undefined))?.purchaseId ?? ''
  }
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [purchaseId, setPurchaseId] = useState(initialPurchase)
  const [contractRef, setContractRef] = useState(defaults?.contractRef ?? '')
  const [name, setName] = useState(defaults?.name ?? list?.name ?? '')
  const [email, setEmail] = useState(defaults?.email ?? list?.email ?? '')
  const [honeypot, setHoneypot] = useState('')
  const [checked, setChecked] = useState(false)
  const [submitted, setSubmitted] = useState<WithdrawalBody | null>(null)
  useEffect(() => {
    // The list may arrive after the form: preselect and prefill then, never over what was typed.
    if (purchaseId === '' && candidates.length > 0) setPurchaseId(initialPurchase())
    if (list?.name != null) setName(held => held === '' ? list.name ?? '' : held)
    if (list?.email != null) setEmail(held => held === '' ? list.email ?? '' : held)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list])
  useEffect(() => {
    if (receipt == null) setStep(current => submitted == null ? current : 'form')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt])

  const current: DeclarationStep = receipt != null ? 'receipt' : step

  const format = (minor: number, currency: string) => formatAmount != null
    ? formatAmount(minor, currency, language.shown) : money(minor, currency, language.shown)
  const candidate: WithdrawalCandidate | undefined = candidates.find(item => item.purchaseId === purchaseId)
  const contract = mode === 'in-app' ? candidate?.contractRef ?? '' : contractRef.trim()
  const errors = {
    contract: mode === 'in-app'
      ? (candidate == null ? text('consumer.required') : null)
      : (contract === '' ? text('consumer.required') : null),
    name: name.trim() === '' ? text('consumer.required') : null,
    email: email.trim() === '' ? text('consumer.required') : !isEmail(email.trim()) ? text('consumer.email-invalid') : null,
  }
  const shown = (key: keyof typeof errors) => checked ? errors[key] : null
  const valid = Object.values(errors).every(value => value == null)
  const body = (): WithdrawalBody => ({
    ...(mode === 'in-app' && candidate != null
      ? { purchaseId: candidate.purchaseId, contractRef: candidate.contractRef }
      : { contractRef: contract }),
    name: name.trim(),
    email: email.trim(),
    language: language.shown,
    ...(honeypot !== '' ? { honeypot } : {}),
  })
  const toReview = () => {
    setChecked(true)
    if (valid) setStep('review')
  }
  const confirm = async () => {
    if (!valid || pending) return
    const declared = body()
    setSubmitted(declared)
    await onSubmit(declared)
  }

  const estimateLine = (item: WithdrawalCandidate) => item.estimate != null
    ? <span data-withdrawal-estimate="" data-refund-minor={item.estimate.refundMinor}>
      {text('withdrawal.estimate', { amount: format(item.estimate.refundMinor, item.estimate.currency) })}
    </span>
    : <span data-withdrawal-estimate="" className="text-muted-foreground">{text('withdrawal.estimate-unknown')}</span>

  const summary = (declared: Pick<WithdrawalBody, 'name' | 'email'> & { contract: string }) =>
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border bg-muted/30 p-4 text-sm">
      <dt className="text-muted-foreground">{legal('withdrawal.name')}</dt><dd data-summary="name">{declared.name}</dd>
      <dt className="text-muted-foreground">{legal('withdrawal.contract')}</dt><dd data-summary="contract">{declared.contract}</dd>
      <dt className="text-muted-foreground">{legal('withdrawal.email')}</dt><dd data-summary="email">{declared.email}</dd>
    </dl>

  let content: ReactNode
  if (current === 'receipt' && receipt != null) {
    const receivedAt = new Date(receipt.receivedAt)
    const declared = submitted ?? body()
    const status = isWithdrawalReceipt(receipt) ? receipt.status : undefined
    content = <div className="grid gap-4" data-withdrawal-receipt="" data-status={status ?? 'received'}
      data-declaration-id={receipt.declarationId} data-received-at={Number.isNaN(receivedAt.getTime()) ? undefined : receivedAt.toISOString()}>
      <h3 className="text-sm font-medium">{text('consumer.receipt')}</h3>
      <p className="text-sm">{receipt.mailed
        ? legal('withdrawal.received', { date: momentUtc(receivedAt, language.shown), email: declared.email })
        : `${text('consumer.received-at')}: ${momentUtc(receivedAt, language.shown)} (UTC). ${text('consumer.not-mailed')}`}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border p-4 text-sm">
        <dt className="text-muted-foreground">{text('consumer.reference')}</dt>
        <dd data-withdrawal-reference="">{receipt.declarationId}</dd>
        <dt className="text-muted-foreground">{text('consumer.received-at')}</dt>
        <dd data-withdrawal-received-at="">{momentUtc(receivedAt, language.shown)} (UTC)</dd>
        <dt className="text-muted-foreground">{legal('withdrawal.name')}</dt><dd>{declared.name}</dd>
        <dt className="text-muted-foreground">{legal('withdrawal.contract')}</dt><dd>{declared.contractRef ?? ''}</dd>
        <dt className="text-muted-foreground">{legal('withdrawal.email')}</dt><dd>{declared.email}</dd>
        {status != null && <>
          <dt className="text-muted-foreground">{text('consumer.status')}</dt>
          <dd data-withdrawal-status="">{text(`withdrawal.status.${status}`)}</dd>
        </>}
        {isWithdrawalReceipt(receipt) && receipt.refundMinor != null && receipt.currency != null && <>
          <dt className="text-muted-foreground">{text('withdrawal.refund')}</dt>
          <dd data-withdrawal-refund="" data-refund-minor={receipt.refundMinor}>{format(receipt.refundMinor, receipt.currency)}</dd>
        </>}
      </dl>
      {isWithdrawalReceipt(receipt) && receipt.subscriptionCanceled === true
        && <p className="text-sm">{text('withdrawal.subscription-canceled')}</p>}
      {onClose != null && <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>{text('consumer.close')}</Button>
      </div>}
    </div>
  } else if (current === 'review') {
    content = <div className="grid gap-4">
      <h3 className="text-sm font-medium">{text('consumer.review')}</h3>
      <p className="text-sm">{legal('withdrawal.review')}</p>
      {summary({ name: name.trim(), email: email.trim(), contract })}
      {mode === 'in-app' && candidate != null && <p className="text-sm">{estimateLine(candidate)}</p>}
      <ErrorLine error={error} text={text} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={pending} onClick={() => setStep('form')}
          data-withdrawal-back="">{text('consumer.back')}</Button>
        <Button type="button" disabled={pending || !valid} onClick={() => void confirm()} data-withdrawal-confirm="">
          {pending ? text('consumer.pending') : legal('withdrawal.confirm')}
        </Button>
      </div>
    </div>
  } else {
    content = <form className="relative grid gap-4" noValidate onSubmit={event => { event.preventDefault(); toReview() }}>
      {mode === 'in-app'
        ? candidates.length === 0
          ? <p className="text-muted-foreground text-sm" data-withdrawal-none="">{text('withdrawal.none')}</p>
          : <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{legal('withdrawal.contract')}</legend>
            {candidates.map(item => <Choice
              key={item.purchaseId} id={`withdrawal-candidate-${item.purchaseId}`} name="withdrawal-candidate"
              checked={item.purchaseId === purchaseId} onSelect={() => setPurchaseId(item.purchaseId)} disabled={pending}
              hook={{ 'data-withdrawal-candidate-input': item.purchaseId }}
            >
              <span data-withdrawal-candidate="" data-purchase-id={item.purchaseId} data-contract-ref={item.contractRef}
                className="grid gap-0.5">
                <span className="font-medium">{item.contractRef} · {text(`withdrawal.kind.${item.kind}`)}</span>
                <span className="text-muted-foreground text-xs">
                  {text('withdrawal.purchased', { date: dayUtc(item.purchasedAt, language.shown) })}
                  {' · '}{text('withdrawal.paid', { amount: format(item.amountTotalMinor, item.currency) })}
                  {' · '}{text('withdrawal.until', { date: lastDayUtc(item.deadline, language.shown) })}
                </span>
                <span className="text-xs">{estimateLine(item)}</span>
              </span>
            </Choice>)}
            {shown('contract') != null && <p className="text-destructive text-xs">{shown('contract')}</p>}
          </fieldset>
        : <Field id="withdrawal-contract" label={legal('withdrawal.contract')} value={contractRef} onChange={setContractRef}
          error={shown('contract')} disabled={pending} hook={{ 'data-withdrawal-field': 'contract' }} />}
      <Field id="withdrawal-name" label={legal('withdrawal.name')} value={name} onChange={setName} error={shown('name')}
        autoComplete="name" disabled={pending} hook={{ 'data-withdrawal-field': 'name' }} />
      <Field id="withdrawal-email" type="email" label={legal('withdrawal.email')} value={email} onChange={setEmail}
        error={shown('email')} autoComplete="email" disabled={pending} hook={{ 'data-withdrawal-field': 'email' }} />
      {mode === 'public' && <Honeypot id="withdrawal-website" label={text('consumer.website')} value={honeypot} onChange={setHoneypot} />}
      <ErrorLine error={error} text={text} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || (mode === 'in-app' && candidates.length === 0)} data-withdrawal-continue="">
          {text('consumer.continue')}
        </Button>
      </div>
    </form>
  }

  return frame({ title: legal('withdrawal.title'), intro: legal('withdrawal.intro'), language: language.shown, step: current }, <>
    <LanguageToggle language={language} hook="data-withdrawal-language-toggle" />
    <div data-withdrawal-form="" data-withdrawal-step={current} data-step={current} data-mode={mode}
      data-language={language.shown} lang={language.shown} className="grid gap-4">
      {content}
    </div>
  </>)
}

/**
 * The withdrawal function as a page section: the form (in-app a contract picker with the estimated
 * refund, publicly a contract reference — and nothing but name, contract and e-mail is asked),
 * the review with the statutory confirm button ("Confirm withdrawal", "Widerruf bestätigen",
 * "Confirmer la rétractation"), and the receipt with the date and time of receipt in UTC. Legal
 * copy in the contract language, with a toggle to the interface language.
 *
 * Selectors: `[data-withdrawal-form]` / `[data-withdrawal-step="form|review|receipt"]` (also
 * `data-step`, `data-language`, `data-mode`), `[data-withdrawal-candidate]` (`data-purchase-id`),
 * `[data-withdrawal-estimate]`, `[data-withdrawal-field="contract|name|email"]`,
 * `[data-withdrawal-continue]`, `[data-withdrawal-confirm]`, `[data-withdrawal-receipt]`
 * (`data-status`, `data-declaration-id`, `data-received-at`), `[data-withdrawal-reference]`.
 */
export const WithdrawalForm = ({ className, ...props }: WithdrawalFormProps) => <WithdrawalSteps
  {...props}
  frame={(frame, body) => <section className={cn('grid gap-4', className)} data-withdrawal-section=""
    data-language={frame.language}>
    <header className="grid gap-1.5" lang={frame.language}>
      <h2 className="text-lg font-semibold leading-none">{frame.title}</h2>
      {frame.step === 'form' && <p className="text-muted-foreground text-sm">{frame.intro}</p>}
    </header>
    {body}
  </section>}
/>

/**
 * `WithdrawalForm` in a dialog: `[data-withdrawal-dialog]` carries `data-language` and `data-step`.
 * Closing it does not clear a receipt the application holds — reset it when the dialog closes.
 */
export const WithdrawalDialog = ({ open, onOpenChange, className, ...props }: WithdrawalDialogProps) =>
  <Dialog open={open} onOpenChange={onOpenChange}>
    {open && <WithdrawalSteps
      {...props}
      onClose={() => onOpenChange(false)}
      frame={(frame, body) => <DialogContent
        closeLabel={paymentTextOf(frame.language)('consumer.close')}
        data-withdrawal-dialog="" data-language={frame.language} data-step={frame.step}
        className={cn('max-h-[90vh] overflow-y-auto', className)}
      >
        <div className="grid gap-2" lang={frame.language}>
          <DialogTitle>{frame.title}</DialogTitle>
          <DialogDescription className={frame.step === 'form' ? undefined : 'sr-only'}>{frame.intro}</DialogDescription>
        </div>
        {body}
      </DialogContent>}
    />}
  </Dialog>
