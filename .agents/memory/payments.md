---
node: payments
scope: "packages/{payment,server-payment,client-payment,web-payment}/**"
updated: 2026-09
---

# Payments

## Facts

- Four-layer common family: `payment` owns the provider-neutral catalogue, entitlement, pricing
  and consumer-rights contracts; `server-payment` embeds Stripe and Mongo state; `client-payment`
  supplies shallow browser identity; `web-payment` supplies protocol-bound hooks, the
  shadcn/Tailwind amount dialog and, on `./consumer`, the consumer-rights pieces.
- Amount checkout treats `amountMinor` as net credit value. The configured adjustment is grossed
  up with `ceil((amount + fixed) * 10000 / (10000 - rateBps))`; tax is added by Stripe and neither
  fee nor tax increases the grant. Safe-integer minor units, validated at configuration and request.
- Stripe amount sessions use one inline `price_data` item (the declared pricing policy's
  `tax_behavior`) against the synchronized Product, quantity one, no adjustable quantity, no
  promotions; quantity and subscription modes keep reusable Prices. Fulfillment accepts only paid
  immediate/asynchronous events, checks the session's currency/subtotal against its metadata and
  marks a session fulfilled only after observers succeed.
- Entitlements (rules: `entitlements` skill): ranked plans (`rank`, `free`, `gateways`),
  `PlanCapability` + `LimitDeclaration` (`window` day/month UTC, `lifetime`, `occupancy`), promos
  `{until, grandfather?}`; capabilities `[scope:]perm[>=n]` under `ENTITLEMENT_GATE`, limits
  `limit:<key>[>=n]` under `LIMIT_GATE`; `limit` is a reserved scope `hasEntitlement` refuses.
  `CapabilityRequired` / `LimitExhausted` extend `AuthForbidden` (403); the consumer-rights refusals
  (428/409) and `CheckoutLimitExceeded` (409) declare their status and never extend it.
- Protocols: `payment` declares no fixed checkout/portal protocols (applications declare them over
  its body schemas) but ships two factories — `makeConsumerRightsProtocols` (guarded account
  subtree, optional unguarded public subtree + sticky screens) and `makeCheckoutReadProtocols`
  (`amountPolicy`, `planPrices`) — bound by `server-payment`'s `consumerRightsEntrypoints` /
  `checkoutReadEntrypoints`. Subscription state is `server-payment`'s store, a free tier a `free`
  plan, a one-time purchase a fulfillment (plus a `payment-purchase` row under a consumer-rights
  policy).
- Observers are idempotent by their key: paygate callbacks by the Stripe id (a throw makes Stripe
  redeliver); `onConsent`/`onWithdrawal`/`onCancellation` by `consent:`/`withdrawal:`/
  `cancellation:<id>` (a throw is recorded and `reconcile()` retries it).

## Invariants

- Public HTTP bodies carry `entitySlug`; the server boundary resolves the stable `entityId` before
  calling the in-process gateway or persisting Stripe metadata. Protocol objects pass through
  client/server code; aliases appear only at registry and broker adapters.
- View schemas type dates as ISO strings (a Fastify response serializer writes a `DateSchema`
  object date as `{}`); plan records keep `DateSchema`. Error messages live under the shared
  `errors` resource keyed by type name.

## Gotchas

- A consent or limit refusal recognised in development never opens its dialog in production →
  a production error body is only the incident id, so the class never arrives → recognise it by
  class/marker OR status (`httpStatusOf(e) === 428`, `@owlmeans/api/status`).

## Pointers

- Skills `payment`, `server-payment` (+ its `reference.md`), `web-payment`, `entitlements`.
