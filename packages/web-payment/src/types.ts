import type { ReactNode } from 'react'
import type { CallOptions, RequestShape } from '@owlmeans/entrypoint'
import type {
  AmountCheckoutPolicy, CapabilityView, CreateCheckoutResponse, EntitlementPlanView, LimitView,
  PortalLinkBody, PriceEstimate, PriceEstimateBody,
} from '@owlmeans/payment'

export type CheckoutResult = CreateCheckoutResponse
export interface AmountCheckoutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  policy: AmountCheckoutPolicy
  pending?: boolean
  /** Chosen amount and, where tax estimation collected it, the billing country. */
  onConfirm: (amountMinor: number, country?: string) => Promise<void> | void
  /** A live tax/currency estimate for the credit line — absent: the plain "tax at checkout" note. */
  estimate?: PriceEstimateControl
}

/** What `usePriceEstimate` returns: the latest answer, the chosen country, and its lifecycle. */
export interface PriceEstimateControl {
  estimate: PriceEstimate | null
  /** ISO 3166-1 alpha-2, or `''` before a country is known. */
  country: string
  /** A request is in flight — including the first, silent one. */
  loading: boolean
  /** The last request failed; `estimate` is the previous good answer, if any. */
  failed: boolean
  onCountryChange: (country: string) => void
}

/** The request of a price-estimate protocol: its body is a `PriceEstimateBody`. */
export type PriceEstimateRequest = RequestShape & { body: PriceEstimateBody }

type PriceEstimateCall<Request extends PriceEstimateRequest> = Omit<Request, 'body'> & {
  body?: Omit<Request['body'], 'country'>
}

/** A price-estimate protocol's call arguments with `body.country` left to `usePriceEstimate`. */
export type PriceEstimateArguments<Request extends PriceEstimateRequest> = {} extends PriceEstimateCall<Request>
  ? [request?: PriceEstimateCall<Request> & CallOptions]
  : [request: PriceEstimateCall<Request> & CallOptions]

/** A limit row plus what a UI derives from it. */
export interface LimitStatus extends LimitView {
  /** No room for one more unit — including a limit that is not included (`limit: 0`). */
  exhausted: boolean
  /**
   * How full the limit is, clamped to `[0, 1]`. A `0` ceiling reads `1` once anything is used and
   * `0` otherwise: the ratio says how full, `exhausted` says whether anything is left.
   */
  ratio: number
}

/**
 * What a plan's status line says, in precedence order: an inactive or blocked status, paused,
 * suspended, trial, past due, cancellation scheduled, free, renews, active.
 */
export type PlanStatusLineKind =
  | 'created' | 'canceled' | 'expired' | 'ended' | 'blocked'
  | 'paused' | 'suspended' | 'trial' | 'past-due' | 'cancel-scheduled'
  | 'free' | 'renews' | 'active'

/** How a status line should be coloured: entitled and fine, needs attention, revoked, or over. */
export type PlanStatusTone = 'ok' | 'warning' | 'critical' | 'inactive'

export interface PlanStatusLine {
  kind: PlanStatusLineKind
  tone: PlanStatusTone
  /** The date the line names — trial end, cancellation, pause start or renewal. */
  date?: Date
}

/** How a promo is inscribed: free until its end, kept by a grandfathered plan, or over. */
export type PromoInscription = 'free-until' | 'grandfathered' | 'ended'

/** The request of a portal protocol: its body is a `PortalLinkBody`. */
export type PortalRequest = RequestShape & { body: PortalLinkBody }

type PortalCall<Request extends PortalRequest> = Omit<Request, 'body'> & {
  body?: Omit<Request['body'], 'flow'>
}

/** A portal protocol's call arguments with `body.flow` left to `usePortal`. */
export type PortalArguments<Request extends PortalRequest> = {} extends PortalCall<Request>
  ? [request?: PortalCall<Request> & CallOptions]
  : [request: PortalCall<Request> & CallOptions]

/** A plan offered next to the entity's own — an upgrade, a downgrade, a plan comparison column. */
export interface PlanOffer {
  sku: string
  title: string
  /** The price as the application formats it (`$20 / month`); the package never formats prices. */
  priceLabel: string
  highlight?: boolean
}

export interface PlanCardProps {
  /** The entity's effective plan. */
  plan: EntitlementPlanView
  /** Render an offered plan instead; the status line then shows only when the offer is current. */
  offer?: PlanOffer
  /** Defaults to `offer.sku === plan.sku` when an offer is given. */
  current?: boolean
  pending?: boolean
  actionLabel?: string
  /** Called with the rendered sku (`offer.sku`, else `plan.sku`). */
  onAction?: (sku: string) => Promise<void> | void
  className?: string
  children?: ReactNode
}

export interface LimitMeterProps {
  limit: LimitView
  label: string
  /** Show when a window limit resets. Default `true`. */
  showReset?: boolean
  compact?: boolean
  className?: string
}

export interface CapabilityListProps {
  capabilities: CapabilityView[]
  /** Product copy by capability `param`; a capability without a label is not rendered. */
  labels: Record<string, string>
  onlyGranted?: boolean
  className?: string
}
