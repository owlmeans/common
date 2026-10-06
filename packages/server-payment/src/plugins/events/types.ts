import type Stripe from 'stripe'

export interface EventHandler { (event: Stripe.Event): Promise<void> }

/** The Stripe event dispatch table of one context and client. */
export interface StripeEventHandler {
  /** The handler of each event type this package processes. */
  handlers: Record<string, EventHandler>
  /** Run the handler of an event's type; every other type is ignored. A throw escapes so Stripe delivers again. */
  process: (event: Stripe.Event) => Promise<void>
}
