import { bind } from '@owlmeans/server-entrypoint'
import { paymentGate } from './consts.js'
import { resync, resyncSubscriptions, webhook } from './actions/index.js'

/**
 * The payment gate's action handlers, for an application that declares the gate itself — its own
 * aliases, a route pinned to its own service: `bind(own.webhook, paymentGateHandlers.webhook)`.
 *
 * A handler reads its context from the entrypoint it is bound to, so the application's own
 * declaration is the one registered, mounted and run. That declaration keeps `paymentGate`'s paths
 * (`webhookUrlOf` registers the webhook at `paymentGate`'s path), contracts and guards. Bind each
 * one with `bind` itself: `bindAll` pairs a handler with the declaration it was made for, by object
 * identity, and leaves another declaration without one.
 */
export const paymentGateHandlers = Object.freeze({ webhook, resync, resyncSubscriptions })

/** Runtime-local bindings for the shared immutable payment-gateway protocol tree. */
export const paymentGateEntrypoints = [
  bind(paymentGate.base),
  bind(paymentGate.webhook, paymentGateHandlers.webhook),
  bind(paymentGate.resync, paymentGateHandlers.resync),
  bind(paymentGate.resyncSubscriptions, paymentGateHandlers.resyncSubscriptions),
]
