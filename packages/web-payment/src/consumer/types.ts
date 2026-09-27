import type { ReactNode } from 'react'
import type {
  CancellationBody, CancellationReceipt, ConsumerRightsLinks, DeclarationReceipt, PerformanceConsentBody,
  PerformanceConsentView, SubscriptionStartBody, SubscriptionStartView, WithdrawalBody, WithdrawalCandidateList,
  WithdrawalReceipt,
} from '@owlmeans/payment'

/**
 * The legal documents of a language: a record by language (`de`, `de-AT` → `de`) or a function (a
 * policy read through `linksOf(policy, lng)`). Absent for a language, the view's own links are used.
 */
export type LegalLinksSource =
  | Record<string, ConsumerRightsLinks | undefined>
  | ((language: string) => ConsumerRightsLinks | null | undefined)

/** Formats an amount of minor units for a language; the default is `Intl.NumberFormat`. */
export type AmountFormatter = (minor: number, currency: string, language: string) => string

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
