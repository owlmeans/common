import { contract, protocol, typed } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { GUARD_ED25519 } from '@owlmeans/server-app'
import { aliases } from './consts.local.js'
import { PaygateParamsSchema, ResyncResultSchema, ResyncSubscriptionsResultSchema } from './schemas.js'

const base = protocol(route(aliases.base, '/payment-gate', backend()), contract())

/** Embedded gateway protocol tree; the alias strings are private adapter details. */
export const paymentGate = {
  base,
  /** Public: Stripe signs the raw body, so no application guard may sit in front of it. */
  webhook: protocol(
    route(aliases.webhook, '/webhook/:paygate', backend({ parent: base, method: RouteMethod.POST })),
    contract.request({ params: PaygateParamsSchema }, typed<undefined>()),
  ),
  /** Re-sync products, prices, the portal configuration and the webhook endpoint. */
  resync: protocol(
    route(aliases.resync, '/resync', backend({ parent: base, method: RouteMethod.POST })),
    contract(ResyncResultSchema),
    { guards: GUARD_ED25519 },
  ),
  /** Re-read every live paygate subscription and apply it as a webhook would. */
  resyncSubscriptions: protocol(
    route(aliases.resyncSubscriptions, '/resync-subscriptions', backend({ parent: base, method: RouteMethod.POST })),
    contract(ResyncSubscriptionsResultSchema),
    { guards: GUARD_ED25519 },
  ),
} as const
