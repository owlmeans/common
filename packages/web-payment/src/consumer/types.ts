import type { ReactNode } from 'react'
import type { CancellationBody, CancellationReceipt, ConsumerRightsLinks, DeclarationReceipt, PerformanceConsentBody, PerformanceConsentView, SubscriptionStartBody, SubscriptionStartView, WithdrawalBody, WithdrawalCandidateList, WithdrawalReceipt, CopyValues, PerformanceConsentResponse } from '@owlmeans/payment'



import type { RegisteredEntrypoint, RequestShape } from '@owlmeans/entrypoint'


/**
 * The legal documents of a language: a record by language (`de`, `de-AT` → `de`) or a function (a
 * policy read through `linksOf(policy, lng)`). Absent for a language, the view's own links are used.
 */
export type LegalLinksSource =
  | Record<string, ConsumerRightsLinks | undefined>
  | ((language: string) => ConsumerRightsLinks | null | undefined)

/** Formats an amount of minor units for a language; the default is `Intl.NumberFormat`. */
export interface AmountFormatter { (minor: number, currency: string, language: string): string }

/** `true` shows the package's generic failure sentence; a node is shown as given. */
export type PieceError = ReactNode | boolean

/** What every consumer-rights dialog shares. */
export interface LegalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * The interface language — what the toggle switches to, and what the toggle itself is phrased
   * in. Default: the active i18n language.
   */
  uiLanguage?: string
  pending?: boolean
  error?: PieceError
  /** Links per language; default: the view's own links. */
  links?: LegalLinksSource
  /**
   * Opens the withdrawal function in-app. Absent, the "withdraw from contract here" link points at
   * the links' `withdrawalFunction` page, and is left out when there is none.
   */
  onWithdraw?: () => void
  /** Called on the decline button; closing the dialog any other way is `onOpenChange(false)`. */
  onDecline?: () => void
  className?: string
}

export interface PerformanceConsentDialogProps extends LegalDialogProps {
  /** `null` renders nothing. */
  view: PerformanceConsentView | null
  /**
   * The express request, recorded in the language it was SHOWN in (`language`), with the
   * interface language beside it (`uiLanguage`) — pass it to the record protocol as the body.
   */
  onConfirm: (body: PerformanceConsentBody) => Promise<unknown> | unknown
  formatAmount?: AmountFormatter
}

export interface SubscriptionStartDialogProps extends LegalDialogProps {
  view: SubscriptionStartView | null
  /** The plan's title, as the application names it — it is part of the statement. */
  planTitle: string
  /** What the application shows about the price (amount, split, tax) above the statement. */
  price?: ReactNode
  onConfirm: (body: SubscriptionStartBody) => Promise<unknown> | unknown
}

/** Where a declaration is made: signed in (a candidate list) or on the public page (a contract reference). */
export type DeclarationMode = 'in-app' | 'public'

/** The three steps every statutory function takes: the form, the review with the statutory button, the receipt. */
export type DeclarationStep = 'form' | 'review' | 'receipt'

export interface WithdrawalFormProps {
  mode: DeclarationMode
  /** The language of the contract (the billing country's); the form shows its legal copy in it. */
  language: string
  uiLanguage?: string
  /** In-app: the contracts that can still be withdrawn from. */
  list?: WithdrawalCandidateList | null
  /** Prefill. In-app, `purchaseId` (or `contractRef`) preselects a candidate. */
  defaults?: { name?: string, email?: string, contractRef?: string, purchaseId?: string }
  pending?: boolean
  error?: PieceError
  /** The answer to the submitted declaration — its presence is the receipt step. */
  receipt?: WithdrawalReceipt | DeclarationReceipt | null
  onSubmit: (body: WithdrawalBody) => Promise<unknown> | unknown
  /** Offered on the receipt step. */
  onClose?: () => void
  formatAmount?: AmountFormatter
  className?: string
}

export interface WithdrawalDialogProps extends Omit<WithdrawalFormProps, 'onClose' | 'className'> {
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
}

export interface WithdrawalFunctionButtonProps {
  /** The contract language: the statutory label is shown in it. */
  language: string
  /** Its label in this language becomes the `title` when the two differ. Default: the active language. */
  uiLanguage?: string
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'outline'
  className?: string
}

export interface CancellationFormProps {
  mode: DeclarationMode
  language: string
  uiLanguage?: string
  defaults?: { name?: string, email?: string, contractRef?: string, subscriptionId?: string }
  pending?: boolean
  error?: PieceError
  receipt?: CancellationReceipt | DeclarationReceipt | null
  onSubmit: (body: CancellationBody) => Promise<unknown> | unknown
  /** The receipt's print button; default `window.print()`. */
  onPrint?: () => void
  onClose?: () => void
  className?: string
}

/** A translator bound to ONE language, whatever the active i18n language is. */
export interface FixedText { (key: string, values?: CopyValues): string }

/**
 * A legal-copy translator bound to ONE language. A `context` (a policy's `consentContext`) reads
 * the `<path>_<context>` variant first and the base text where there is none.
 */
export interface LegalText { (path: string, values?: CopyValues, context?: string): string }

export interface AskerOptions<Args extends unknown[], View, Answer> {
  /** Read the current view. */
  load: (...args: Args) => Promise<View>
  /** Whether the view asks the person anything. */
  required: (view: View) => boolean
  /** Show the view to the person (open the dialog). */
  show: (view: View) => void
  /**
   * The answer when nothing needs asking — and when the read FAILS: the server's refusal stays
   * the authority, and a flaky read must never block work that needs no consent.
   */
  skip: Answer
}

export interface Asker<Args extends unknown[], Answer> {
  /** Read, and ask only when the view requires it. Concurrent calls share ONE pending answer. */
  ask: (...args: Args) => Promise<Answer>
  /** Answer the pending `ask` (the dialog confirmed or was declined); nothing when none waits. */
  settle: (answer: Answer) => void
  /** Whether an `ask` is waiting for the person. */
  waiting: () => boolean
}

export interface EnsureOptions {
  /**
   * Asked after the server refused with a 428 although the last answer said nothing was needed.
   * The view is always read fresh; `force` records why the caller asks.
   */
  force?: boolean
}

export interface ConsentGate {
  /**
   * `true` when nothing needs consent or the person confirmed and it was recorded; `false` when
   * they declined or closed the dialog. A failed read answers `true`. One pending answer is shared.
   */
  ensure: (opts?: EnsureOptions) => Promise<boolean>
  /**
   * Run `action`; when it is refused for the spend consent (`isPerformanceConsentRefusal` — the
   * class, its marker, or a bare 428, also wrapped inside another error), ask with
   * `ensure({ force: true })` and run it again exactly ONCE. A decline throws `ConsentDeclined`;
   * a second refusal, or any other failure, propagates as it is.
   */
  withConsent: <T>(action: () => Promise<T>) => Promise<T>
}

export interface FieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string | null
  type?: 'text' | 'email' | 'date'
  autoComplete?: string
  disabled?: boolean
  min?: string
  /** A `data-*` hook for tests (`data-withdrawal-field="name"`). */
  hook?: Record<string, string>
  multiline?: boolean
}

export interface ChoiceProps {
  id: string
  name: string
  checked: boolean
  onSelect: () => void
  disabled?: boolean
  hook?: Record<string, string>
  children: ReactNode
}

export interface HoneypotProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}

export interface UsePerformanceConsentOptions {
  /** Read the view on mount, so `required` is known before anything asks. Default `false`. */
  enabled?: boolean
  uiLanguage?: string
  links?: LegalLinksSource
  /** Open the withdrawal function; the consent dialog closes (declined) first. */
  onWithdraw?: () => void
  /** After the consent was recorded — refresh an account feed, say. */
  onRecorded?: (response: PerformanceConsentResponse) => void
}

export interface PerformanceConsentControl {
  view: PerformanceConsentView | null
  /** From the last read; `null` before any. */
  required: boolean | null
  /**
   * `true` when no consent is needed or it was confirmed and recorded, `false` on a decline or a
   * closed dialog. Reads the view fresh; a failed read answers `true`. Concurrent calls share one
   * pending answer — one dialog.
   */
  ensure: (opts?: EnsureOptions) => Promise<boolean>
  refresh: () => Promise<PerformanceConsentView | null>
  /** Spread into ONE `PerformanceConsentDialog`. */
  dialog: PerformanceConsentDialogProps
}

export interface UseSubscriptionStartOptions {
  uiLanguage?: string
  links?: LegalLinksSource
  onWithdraw?: () => void
}

export interface SubscriptionStartParams {
  /** The plan's title as the application names it — part of the statement. */
  planTitle: string
  /** The price line the dialog shows above the statement. */
  price?: ReactNode
}

export interface SubscriptionStartControl {
  /**
   * The start request id to send with the subscription checkout (`CreateCheckoutBody.
   * startRequestId`); `''` when none is needed (or the view could not be read — the checkout's
   * own refusal then decides); `null` when the person declined or closed the dialog.
   */
  ensure: (planSku: string, params: SubscriptionStartParams) => Promise<string | null>
  view: SubscriptionStartView | null
  /** Spread into ONE `SubscriptionStartDialog`. */
  dialog: SubscriptionStartDialogProps
}

export interface DeclarationControl<Body, Receipt> {
  /** Send the declaration; the revived receipt, or `null` when it failed (`error` holds why). */
  submit: (body: Body) => Promise<Receipt | null>
  receipt: Receipt | null
  pending: boolean
  error: unknown
  /** Forget the receipt and the error — before the form is shown again. */
  reset: () => void
}

export interface WithdrawalControl<Receipt extends DeclarationReceipt> extends DeclarationControl<WithdrawalBody, Receipt> {
  /** In-app: the contracts that can still be withdrawn from; `null` before the first read. */
  list: WithdrawalCandidateList | null
  load: () => Promise<WithdrawalCandidateList | null>
  /** Spread into a `WithdrawalForm` / `WithdrawalDialog` (with `mode` and `language`). */
  form: {
    list: WithdrawalCandidateList | null
    pending: boolean
    error: boolean
    receipt: Receipt | null
    onSubmit: (body: WithdrawalBody) => Promise<Receipt | null>
  }
}

export interface CancellationControl<Receipt extends DeclarationReceipt> extends DeclarationControl<CancellationBody, Receipt> {
  /** Spread into a `CancellationForm` (with `mode` and `language`). */
  form: {
    pending: boolean
    error: boolean
    receipt: Receipt | null
    onSubmit: (body: CancellationBody) => Promise<Receipt | null>
  }
}

export interface ShownLanguage {
  /** The language the legal copy is shown in now (base code). */
  shown: string
  /** The contract language (base code). */
  contract: string
  ui: string
  /** The contract and interface languages differ, so a toggle is offered. */
  canToggle: boolean
  toggle: () => void
}

export interface LanguageToggleProps {
  language: ShownLanguage
  /** An extra `data-*` hook of the piece that hosts the toggle (`data-consent-language-toggle`). */
  hook?: string
  className?: string
}

export interface LegalLinksProps {
  links?: ConsumerRightsLinks
  legal: FixedText
  onWithdraw?: () => void
  className?: string
}

export interface ConsentGateValue extends ConsentGate {
  /** From the last read of the view; `null` before any, and always outside a provider. */
  required: boolean | null
}

export interface PerformanceConsentProviderProps<RecordRequest extends RequestShape & { body: PerformanceConsentBody }> {
  view: RegisteredEntrypoint<{}, PerformanceConsentView>
  record: RegisteredEntrypoint<RecordRequest, PerformanceConsentResponse>
  options?: UsePerformanceConsentOptions
  children?: ReactNode
}
