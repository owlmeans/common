---
node: payments
scope: "packages/{payment,server-payment,client-payment,web-payment}/**"
updated: 2026-09
---

# Payments

The public payment stack is a four-layer common family: `payment` owns provider-neutral catalogue,
entitlement, pricing and protocol contracts; `server-payment` embeds Stripe and Mongo state;
`client-payment` supplies shallow browser identity; `web-payment` supplies protocol-bound hooks and
the shadcn/Tailwind amount dialog.

Amount checkout treats `amountMinor` as net credit value. The configured adjustment is grossed up
with `ceil((amount + fixed) * 10000 / (10000 - rateBps))`; tax is added by Stripe and neither fee
nor tax increases the grant. Policies and selected amounts use safe integer minor units and are
validated at configuration and request boundaries.

Stripe amount sessions use one inline tax-exclusive `price_data` item against the synchronized
Product, quantity one, no adjustable quantity and no promotions. Quantity and subscription modes
retain reusable Prices. Fulfillment accepts only paid immediate/asynchronous events, compares the
actual currency/subtotal with metadata and marks a session fulfilled only after observers succeed.
Consumer observers use the Stripe external id as an append-only idempotency key.

Public HTTP bodies carry `entitySlug`; the server boundary resolves stable `entityId` before
calling the in-process gateway or persisting Stripe metadata. Protocol objects pass through
client/server code; aliases appear only at registry and broker adapters.
