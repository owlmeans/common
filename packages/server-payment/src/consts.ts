import { contract, protocol, protocols, schema, typed } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { GUARD_ED25519 } from '@owlmeans/server-app'
import type { JSONSchemaType } from 'ajv'

export const STRIPE_PAYGATE_ALIAS = 'stripe'
export const STRIPE_PLUGIN_CONFIG = '_external:stripe'
export const STRIPE_SIGNATURE = 'Stripe-Signature'
export const GATEWAY_SERVICE = 'payment-gateway'
export const PAYMENT_OBSERVER = 'payment-observer'
export const RES_PAYGATE_CUSTOMER = 'payment-paygate-customer'
export const RES_PAYMENT_SUBSCRIPTION = 'payment-subscription'
export const RES_PAYMENT_FINGERPRINT = 'payment-fingerprint'
export const COMPLETION_TOP_UP = 'top-up'
export const COMPLETION_SUBSCRIPTION = 'subscription'

export interface PaygateParams { paygate: string }
export interface ResyncResult { ok: boolean }
const PaygateParamsSchema = schema<PaygateParams>({
  type: 'object', properties: { paygate: { type: 'string' } }, required: ['paygate'],
  additionalProperties: false,
} as JSONSchemaType<PaygateParams>)
const ResyncResultSchema = schema<ResyncResult>({
  type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'],
  additionalProperties: false,
} as JSONSchemaType<ResyncResult>)

const aliases = {
  base: 'payment-gate', webhook: 'payment-gate:webhook', resync: 'payment-gate:resync',
} as const
const base = protocol(route(aliases.base, '/payment-gate', backend()), contract())

/** Embedded gateway protocol tree; the alias strings are private adapter details. */
export const paymentGate = {
  base,
  webhook: protocol(
    route(aliases.webhook, '/webhook/:paygate', backend({ parent: base, method: RouteMethod.POST })),
    contract.request({ params: PaygateParamsSchema }, typed<undefined>()),
  ),
  resync: protocol(
    route(aliases.resync, '/resync', backend({ parent: base, method: RouteMethod.POST })),
    contract(ResyncResultSchema),
    { guards: GUARD_ED25519 },
  ),
} as const

export const paymentGateProtocols = protocols(paymentGate)
