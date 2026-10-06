import type Stripe from 'stripe'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { ConsumerRightsOptions } from '../types.js'

/** A paragraph, or a labelled link rendered as an anchor in HTML. */
export type Block = { text: string } | { label: string, url: string }

export interface Rendered {
  subject: string
  blocks: Block[]
}

export type Headers = AbstractRequest['headers']

/** What a later registration applies to a service already registered. */
export interface Plumbing extends Pick<ConsumerRightsOptions, 'manage' | 'usage' | 'stripe'> {}

/**
 * A credit note's creation parameters in the API version the client is pinned to: the refund it corrects
 * is named by `refund` there, where the installed SDK's types (a newer version) list `refunds`.
 */
export interface PinnedCreditNoteParams extends Stripe.CreditNoteCreateParams { refund?: string }
