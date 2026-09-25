import { useEffect, useState, type ReactNode } from 'react'
import { CancellationKind } from '@owlmeans/payment'
import type { CancellationBody, CancellationReceipt } from '@owlmeans/payment'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { dayUtc, momentUtc } from '../format.js'
import { useLegalText, usePaymentText } from './copy.js'
import { Choice, Field, Honeypot, isEmail } from './fields.js'
import { ErrorLine, LanguageToggle, useShownLanguage } from './legal.js'
import type { CancellationFormProps, DeclarationStep } from './types.js'

const isCancellationReceipt = (receipt: object): receipt is CancellationReceipt => 'status' in receipt

/** Today as a UTC calendar day, `YYYY-MM-DD` — the earliest date a termination may name. */
const todayUtc = (): string => new Date().toISOString().slice(0, 10)

/**
 * The cancellation function (§ 312k BGB "Verträge hier kündigen" → "Jetzt kündigen"; L215-1-1 /
 * D215-1 "Résilier votre contrat" → a summary → "Notification de la résiliation"), for a public
 * page reachable without a login and for the same function in-app.
 *
 * Step 1 asks for the kind (ordinary, or extraordinary with its reason), the name, the contract or
 * customer reference, the date (the earliest possible, or a specific one) and the e-mail address
 * the acknowledgement goes to; a honeypot field no person reaches rides along. Step 2 is the
 * summary with the statutory confirm button; step 3 the receipt — date and time of receipt in UTC,
 * the effective date when known — with a print button, so it can be kept.
 *
 * Selectors: `[data-cancellation-form]` / `[data-cancellation-step="form|review|receipt"]` (also
 * `data-step`, `data-language`, `data-mode`), `[data-cancellation-field="kind|reason|name|contract|
 * effective|date|email"]`, `[data-cancellation-continue]`, `[data-cancellation-confirm]`,
 * `[data-cancellation-receipt]` (`data-status`, `data-declaration-id`, `data-received-at`,
 * `data-effective-at`), `[data-cancellation-print]`.
 */
export const CancellationForm = ({
  mode, language: contractLanguage, uiLanguage, defaults, pending = false, error, receipt, onSubmit, onPrint, onClose,
  className,
}: CancellationFormProps) => {
  const language = useShownLanguage(contractLanguage, uiLanguage)
  const legal = useLegalText(language.shown)
  const text = usePaymentText(language.shown)

  const [step, setStep] = useState<'form' | 'review'>('form')
  const [kind, setKind] = useState<CancellationKind>(CancellationKind.Ordinary)
  const [reason, setReason] = useState('')
  const [name, setName] = useState(defaults?.name ?? '')
  const [contractRef, setContractRef] = useState(defaults?.contractRef ?? '')
  const [effective, setEffective] = useState<'earliest' | 'date'>('earliest')
  const [date, setDate] = useState('')
  const [email, setEmail] = useState(defaults?.email ?? '')
  const [honeypot, setHoneypot] = useState('')
  const [checked, setChecked] = useState(false)
  const [submitted, setSubmitted] = useState<CancellationBody | null>(null)
  useEffect(() => {
    if (receipt == null && submitted != null) setStep('form')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt])

  const current: DeclarationStep = receipt != null ? 'receipt' : step
  const extraordinary = kind === CancellationKind.Extraordinary
  const earliestDate = todayUtc()
  const errors = {
    reason: extraordinary && reason.trim() === '' ? text('consumer.required') : null,
    name: name.trim() === '' ? text('consumer.required') : null,
    date: effective === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < earliestDate) ? text('consumer.date-invalid') : null,
    email: email.trim() === '' ? text('consumer.required') : !isEmail(email.trim()) ? text('consumer.email-invalid') : null,
  }
  const shown = (key: keyof typeof errors) => checked ? errors[key] : null
  const valid = Object.values(errors).every(value => value == null)
  const body = (): CancellationBody => ({
    kind,
    ...(extraordinary ? { reason: reason.trim() } : {}),
    name: name.trim(),
    ...(contractRef.trim() !== '' ? { contractRef: contractRef.trim() } : {}),
    ...(defaults?.subscriptionId != null ? { subscriptionId: defaults.subscriptionId } : {}),
    effective,
    ...(effective === 'date' ? { date } : {}),
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
  const print = () => {
    if (onPrint != null) onPrint()
    else if (typeof window !== 'undefined') window.print()
  }

  const kindLabel = (value: CancellationKind) => legal(value === CancellationKind.Extraordinary
    ? 'cancellation.kind-extraordinary' : 'cancellation.kind-ordinary')
  const effectiveLabel = (declared: CancellationBody) => declared.effective === 'date' && declared.date != null
    ? dayUtc(`${declared.date}T00:00:00Z`, language.shown) : legal('cancellation.effective-earliest')
  const summary = (declared: CancellationBody, hook?: string) =>
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border bg-muted/30 p-4 text-sm"
      {...(hook != null ? { [hook]: '' } : {})}>
      <dt className="text-muted-foreground">{legal('cancellation.kind')}</dt><dd data-summary="kind">{kindLabel(declared.kind)}</dd>
      {declared.reason != null && <>
        <dt className="text-muted-foreground">{legal('cancellation.reason')}</dt>
        <dd data-summary="reason" className="whitespace-pre-wrap">{declared.reason}</dd>
      </>}
      <dt className="text-muted-foreground">{legal('cancellation.name')}</dt><dd data-summary="name">{declared.name}</dd>
      <dt className="text-muted-foreground">{legal('cancellation.contract')}</dt><dd data-summary="contract">{declared.contractRef ?? '—'}</dd>
      <dt className="text-muted-foreground">{legal('cancellation.effective')}</dt><dd data-summary="effective">{effectiveLabel(declared)}</dd>
      <dt className="text-muted-foreground">{legal('cancellation.email')}</dt><dd data-summary="email">{declared.email}</dd>
    </dl>

  let content: ReactNode
  if (current === 'receipt' && receipt != null) {
    const receivedAt = new Date(receipt.receivedAt)
    const declared = submitted ?? body()
    const status = isCancellationReceipt(receipt) ? receipt.status : undefined
    const effectiveAt = isCancellationReceipt(receipt) && receipt.effectiveAt != null ? new Date(receipt.effectiveAt) : null
    const effectiveKnown = effectiveAt != null && !Number.isNaN(effectiveAt.getTime())
    content = <div className="grid gap-4" data-cancellation-receipt="" data-status={status ?? 'received'}
      data-declaration-id={receipt.declarationId}
      data-received-at={Number.isNaN(receivedAt.getTime()) ? undefined : receivedAt.toISOString()}
      data-effective-at={effectiveKnown ? effectiveAt.toISOString() : undefined}>
      <h3 className="text-sm font-medium">{text('consumer.receipt')}</h3>
      <p className="text-sm">{receipt.mailed
        ? legal('cancellation.received', { date: momentUtc(receivedAt, language.shown), email: declared.email })
        : `${text('consumer.received-at')}: ${momentUtc(receivedAt, language.shown)} (UTC). ${text('consumer.not-mailed')}`}</p>
      {effectiveKnown && <p className="text-sm font-medium" data-cancellation-effective="">
        {text('cancellation.effective-at', { date: dayUtc(effectiveAt, language.shown) })}
      </p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border p-4 text-sm">
        <dt className="text-muted-foreground">{text('consumer.reference')}</dt>
        <dd data-cancellation-reference="">{receipt.declarationId}</dd>
        <dt className="text-muted-foreground">{text('consumer.received-at')}</dt>
        <dd data-cancellation-received-at="">{momentUtc(receivedAt, language.shown)} (UTC)</dd>
        {status != null && <>
          <dt className="text-muted-foreground">{text('consumer.status')}</dt>
          <dd data-cancellation-status="">{text(`cancellation.status.${status}`)}</dd>
        </>}
      </dl>
      {summary(declared)}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end print:hidden">
        {onClose != null && <Button type="button" variant="outline" onClick={onClose}>{text('consumer.close')}</Button>}
        <Button type="button" variant="outline" onClick={print} data-cancellation-print="">{text('consumer.print')}</Button>
      </div>
    </div>
  } else if (current === 'review') {
    content = <div className="grid gap-4">
      <h3 className="text-sm font-medium">{text('consumer.review')}</h3>
      <p className="text-sm">{legal('cancellation.summary')}</p>
      {summary(body(), 'data-cancellation-summary')}
      <ErrorLine error={error} text={text} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={pending} onClick={() => setStep('form')}
          data-cancellation-back="">{text('consumer.back')}</Button>
        <Button type="button" disabled={pending || !valid} onClick={() => void confirm()} data-cancellation-confirm="">
          {pending ? text('consumer.pending') : legal('cancellation.confirm')}
        </Button>
      </div>
    </div>
  } else {
    content = <form className="relative grid gap-4" noValidate onSubmit={event => { event.preventDefault(); toReview() }}>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{legal('cancellation.kind')}</legend>
        {[CancellationKind.Ordinary, CancellationKind.Extraordinary].map(value => <Choice
          key={value} id={`cancellation-kind-${value}`} name="cancellation-kind" checked={kind === value}
          onSelect={() => setKind(value)} disabled={pending} hook={{ 'data-cancellation-field': 'kind', 'data-kind': value }}
        >{kindLabel(value)}</Choice>)}
      </fieldset>
      {extraordinary && <Field id="cancellation-reason" label={legal('cancellation.reason')} value={reason} onChange={setReason}
        error={shown('reason')} disabled={pending} multiline hook={{ 'data-cancellation-field': 'reason' }} />}
      <Field id="cancellation-name" label={legal('cancellation.name')} value={name} onChange={setName} error={shown('name')}
        autoComplete="name" disabled={pending} hook={{ 'data-cancellation-field': 'name' }} />
      <Field id="cancellation-contract" label={legal('cancellation.contract')} value={contractRef} onChange={setContractRef}
        disabled={pending} hook={{ 'data-cancellation-field': 'contract' }} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{legal('cancellation.effective')}</legend>
        <Choice id="cancellation-effective-earliest" name="cancellation-effective" checked={effective === 'earliest'}
          onSelect={() => setEffective('earliest')} disabled={pending}
          hook={{ 'data-cancellation-field': 'effective', 'data-effective': 'earliest' }}>
          {legal('cancellation.effective-earliest')}
        </Choice>
        <Choice id="cancellation-effective-date" name="cancellation-effective" checked={effective === 'date'}
          onSelect={() => setEffective('date')} disabled={pending}
          hook={{ 'data-cancellation-field': 'effective', 'data-effective': 'date' }}>
          {legal('cancellation.effective-date')}
        </Choice>
        {effective === 'date' && <Field id="cancellation-date" type="date" label={legal('cancellation.effective-date')}
          value={date} onChange={setDate} min={earliestDate} error={shown('date')} disabled={pending}
          hook={{ 'data-cancellation-field': 'date' }} />}
      </fieldset>
      <Field id="cancellation-email" type="email" label={legal('cancellation.email')} value={email} onChange={setEmail}
        error={shown('email')} autoComplete="email" disabled={pending} hook={{ 'data-cancellation-field': 'email' }} />
      <Honeypot id="cancellation-website" label={text('consumer.website')} value={honeypot} onChange={setHoneypot} />
      <ErrorLine error={error} text={text} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} data-cancellation-continue="">{text('consumer.continue')}</Button>
      </div>
    </form>
  }

  return <section className={cn('grid gap-4', className)} data-cancellation-section="" data-language={language.shown}>
    <header className="grid gap-1.5" lang={language.shown}>
      <h2 className="text-lg font-semibold leading-none">{legal('cancellation.title')}</h2>
      {current === 'form' && <p className="text-muted-foreground text-sm">{legal('cancellation.intro')}</p>}
    </header>
    <LanguageToggle language={language} hook="data-cancellation-language-toggle" />
    <div data-cancellation-form="" data-cancellation-step={current} data-step={current} data-mode={mode}
      data-language={language.shown} lang={language.shown} className="grid gap-4">
      {content}
    </div>
  </section>
}
