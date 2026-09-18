---
name: server-payment
description: Public in-process Stripe gateway for OwlMeans backends — amount and quantity checkout, subscriptions, protocol-bound webhook routes, product sync, fulfillment observers and entitlement gates. Use when wiring @owlmeans/server-payment or changing Stripe payment behavior.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-payment

**Install:** `bun add @owlmeans/server-payment@^0.1.18-rc.11`

Public MIT package. It embeds Stripe into an application backend and owns everything between
Stripe and an entity's entitlements: the subscription store, one-time fulfillments, the usage
ledger of counted limits, plan resolution, the two gate services and Stripe's own configuration
(products, prices, the portal, the webhook endpoint). The application owns its catalogue, what a
purchase is worth to it (credits, provisioning) and its side effects. Contracts — plans, limits,
promos, the entitlement view, refusals — are `@owlmeans/payment`; the model across packages is
the `entitlements` skill.

## Wiring

```typescript
stripeSecrets(cfg, { api: '/secrets/stripe-key' })     // webhook secret: optional override
portalBranding(cfg, { returnUrl: 'https://app.example.com/billing', headline: 'Example' })
declarePaymentProduct(cfg, { sku: 'app-plans', type: ProductType.Service, services: ['app'], name: 'Plans' })
declarePaymentPlan(cfg, { productSku: 'app-plans', sku: 'free', rank: 0, free: true, price: 0, … })
declarePaymentPlan(cfg, { productSku: 'app-plans', sku: 'pro-monthly', rank: 10, price: 20,
  recurring: { interval: 'month' }, capabilities: […], limits: { seats: {…} } })

appendPaymentGatewayService(context)                     // the process that talks to Stripe
appendPaymentGatewayService(context, { manage: false })  // a worker that only reads entitlements
export const serverBindings = [...paymentGateEntrypoints]
observer(context).onSubscription(async event => { /* keyed by event.eventKey */ })
```

- `appendPaymentGatewayService` registers seven resources, the catalogue service
  (`PAYMENT_SERVICE`), the completion observer, the gateway (`GATEWAY_SERVICE`), the capability
  gate (`ENTITLEMENT_GATE`), the limit gate (`LIMIT_GATE`) and the entitlement service
  (`ENTITLEMENT_SERVICE`), each only when not registered already.
- **`manage: false`** registers the same surface with no Stripe client: no bootstrap at init, and
  `createLink`, `portalLink`, `resyncSubscription`, `resyncAll` and the webhook route throw
  `PaygateError('unmanaged')`. `grantInternalPlan` and the whole entitlement service work, because
  they are Mongo only.
- Gateway methods take the stable `entityId`. A public handler resolves it from its request
  entity first; protocol bodies carry `entitySlug`.
- A value in `stripeSecrets` / `portalBranding` that starts with `/` is read from that file at
  boot, and a missing file fails the boot — so leave `webhook` out unless the file exists.

## Declaring plans

- **`rank`** orders a product's plans; a higher rank is an upgrade. A safe integer `>= 0`; absent
  reads as `0`.
- **The free plan is a plan**: `free: true`, `price: 0`, no `gateways`. It is never synchronized to
  Stripe and never checked out; an entity without an entitling subscription resolves to it.
- `gateways` names the paygates a plan is sold through; absent inherits the product's.
- `declarePaymentPlan` refuses before recording: a bad rank or a priced/gatewayed free plan
  (`PlanRankConflict`), a capability set under the reserved `limit` scope, or a limit that is
  malformed — a window limit without its window, a lifetime/occupancy limit with one, a ceiling that
  is not a safe integer, a promo whose `until` is not a `Date` (`LimitMisdeclared('<key>:<reason>')`).
- `assertPlanDeclarations` runs when the gateway initializes and fails the boot on two free plans
  at one rank, or two paid non-consumable plans of one product at one rank.
- A limit key may use a different kind on different plans (lifetime on the free plan, a monthly window
  on a paid one). The counter window is derived from the kind, so each kind counts separately and a
  lifetime count stays with the entity through upgrades, downgrades and cancellations.

## Records

None declares an ObjectId reference: `entityId` is an organization key and every other id is Stripe's.

| Collection | One row per | Indexes |
|---|---|---|
| `payment-paygate-customer` | Stripe customer (`deletedAt` once deleted) | `{paygate, externalId}` unique · `{paygate, entityId}` · `{paygate, profileId}` |
| `payment-subscription` | subscription: `sub_…`, `free:<entityId>`, `internal:<planSku>:<entityId>` | `{paygate, externalId}` unique · `{entityId, status, rank:-1}` · `{entityId, planSku}` · `{paygate, customerId}` · `{paygate, itemId}` sparse · `{paygate, status, updatedAt}` |
| `payment-fulfillment` | one-time checkout session | `{paygate, externalId}` unique · `{paygate, paymentIntentId}` sparse · `{paygate, chargeId}` sparse · `{entityId, createdAt:-1}` |
| `payment-webhook` | managed webhook endpoint (`secret` is `secure: true`) | `{paygate, service, url}` unique |
| `payment-usage` | usage event — the ledger | `{entityId, limitKey, eventKey}` unique · `{entityId, limitKey, window}` · `{entityId, limitKey, ref}` sparse · `{entityId, createdAt:-1}` |
| `payment-usage-counter` | (entity, limit, window) projection | `{entityId, limitKey, window}` unique |
| `payment-fingerprint` | synchronized product (`<productSku>`) or portal (`portal:<service>`) | `{sku}` unique |

Every stored property is declared in the record schema: the resource writes a property its schema
does not know as a string, and the collection validator rejects it.

## Checkout and fulfillment

- `Amount`: one inline `price_data` item for the synchronized product, quantity 1, tax-exclusive,
  no promotion codes; the net `amountMinor` and the grossed-up `chargeAmountMinor` travel in the
  session metadata. `Quantity`: the reusable price under the plan lookup key, adjustable quantity.
  Subscription: `planSku` (else the product's first recurring plan), quantity 1.
- A plan the paygate does not sell — a free plan, another gateway's plan — is refused
  (`ProductError`). Every session enables automatic tax, billing address and tax id collection.
- `checkout.session.completed` and `…async_payment_succeeded` fulfill only a `payment`-mode session
  with `payment_status === 'paid'`; an amount session must match its metadata currency and subtotal.
- A pending `payment-fulfillment` row (with `paymentIntentId` and `invoiceId`) is written before
  observers run; `fulfilledAt` is stamped after they succeed. An observer throw escapes so Stripe
  redelivers, and the observer must stay idempotent by `externalId` — a crash after its side effect
  and before the stamp redelivers the same session.

## The subscription store

- **The effective plan** is the highest-ranked row in `ENTITLING_STATUSES` (catalogue rank; the
  newest on a tie), else the declared free plan, else `PlanRequired`. An internal row with a past
  `periodEnd` no longer entitles; a row naming a plan the catalogue lost is skipped (logged once).
- `mapStatus`: `active`→Active, `trialing`→Trial, `past_due`→PastDue (entitled, flagged),
  `unpaid`/`paused`→Suspended, `incomplete`→Created, `incomplete_expired`→Ended, `canceled`→Canceled.
  `pause_collection` on an active or trialing subscription is Suspended with `pausedAt`.
- **State is written before observers, and classified against what observers were last told.**
  `propagated` holds the last propagated `{planSku, rank, status, cancelAtPeriodEnd, pausedAt,
  renewedInvoiceId}`; it and `lastEventId` are stamped only after every observer succeeded. An
  observer that throws therefore sees the same change again when Stripe retries, while an observer
  that reads entitlements already sees the new plan.
- Classification, first match: `created` (the first propagated state that entitles — an
  `incomplete` subscription reports nothing yet) · `canceled` · `paused` · `resumed` (pause cleared,
  or suspended → entitling) · `upgraded`/`downgraded` by rank on a plan change (equal rank reads
  `upgraded`) · `cancel-scheduled` · `cancel-undone` · `renewed` (a paid cycle invoice, once per
  invoice) · `past-due` · `suspended` · `trial-ending` · otherwise nothing is reported.
- A repeated delivery (`lastEventId`) is ignored, and a webhook payload older than the stored state
  (`event.created` before `syncedAt`) is not applied. State Stripe is asked for (invoice events,
  resync) is always fresh.
- `grantInternalPlan(ctx, entityId, planSku, { force?, periodEnd? })` upserts an internal row,
  keeps its `createdAt` (what promos are grandfathered against), and reports `created` once. A
  plan that is not free needs `force`.
- `resyncSubscription(ctx, { entityId | subscriptionId })` retrieves and applies each subscription
  exactly as a webhook would; one Stripe no longer has is canceled. `resyncAll` covers every
  non-terminal Stripe row. Both answer how many rows changed.

## The usage ledger

`payment-usage` events are the source of truth; `payment-usage-counter` is the projection that
admission reads.

- **`consume({ entityId, limitKey, eventKey, amount?, ref?, reason? })`** — the counter is
  incremented FIRST, by one conditional upsert that matches only while `used <= limit - amount`,
  then the event is appended. No room ⇒ `LimitExhausted` with `used`, `limit`, `resetsAt`, and no
  event. **Invariant: the counter may over-count, never over-admit.**
- **An event key is idempotent.** A key already written replays its outcome (`replayed: true`)
  before admission is asked — at the ceiling too; a concurrent duplicate that loses the unique event
  undoes its increment and replays the winner. A released key stays released.
- Key a consumption by the record it pays for (`eventKey: <purpose>:<recordId>`, `ref: recordId`).
  `consumption(entityId, limitKey, eventKey)` answers whether that event still holds a unit;
  `consumptionByRef(entityId, limitKey, ref)` answers the newest active event of a record — for a
  unit acquired under a fresh key per cycle.
- **`release`** appends `release:<eventKey>` first, decrements only when that append was new (never
  below zero), then stamps `releasedAt`. The default amount is the consumed amount.
- A lapsed promo makes the ceiling `0`; an undeclared key is `LimitUnknown`.
- **`reconcileCounters(entityId?)`** recomputes every counter from the ledger sum, deletes past
  day/month counters with no events (never lifetime or occupancy), and creates the current window
  counter of every window limit.
- **`reconcileOccupancy(entityId, key, actual)`** sets an occupancy counter to the live count and
  keeps the ledger equal to it with one adjusting event per UTC day (`reconcile:<key>:<YYYY-MM-DD>`,
  adjusted in place by a later run that day). `overSince` is set when over the limit and cleared
  within it. It never stops anything — what happens to an entity over its limit is the
  application's decision.
- `reconcileEntity(ctx, entityId, { freePlanSku?, resync? })` and `reconcileAll(ctx, { freePlanSku?,
  resync?, entities? })` combine the optional Stripe resync, the free-plan backfill and the counter
  repair; a failing entity is counted, never fatal.

## Entitlements and gates

- `entitlements(ctx)` → `effectivePlan`, `entitlements` (the `EntitlementView`, with
  `plan.subscribedAt` = the subscription's `createdAt`), `hasCapability`, `limitState`, the ledger
  operations above. It takes no context argument and never calls Stripe.
- **Capability gate** (`makeCapabilityGate(alias = ENTITLEMENT_GATE, { productSkus?, resolveEntity?,
  requirePermission? })`, also `makeEntitlementGate`): authentication and an entity are required
  (`AuthForbidden`); it passes when the view grants ANY parameter. The plan is the authority — a
  token permission set to `false` denies, a token grant alone never allows, and `requirePermission`
  (IAM `hasPermission`) is off by default because platform tokens carry no permissions. An
  unreadable store refuses. Refusal: `CapabilityRequired(params)`.
- **Limit gate** (`makeLimitGate(alias = LIMIT_GATE, { resolveEntity? })`): passes when ANY
  `limit:<key>[>=n]` has `remaining >= n`; malformed and undeclared parameters are skipped, a store
  error refuses. Refusal: `LimitExhausted` for the first declared key. **It never consumes.**
- The two gates are two aliases because an entrypoint's gates are collected per gate service.
  `entitlementsOf(ctx, entityId, productSkus?)` returns the capability sets in force.

## Stripe self-management

Runs in `initialize()` of a managed gateway, after the context is ready; each step is independent
and logged when it fails.

- **Products and prices** of plans sold through Stripe, fingerprinted per product. An amount plan
  owns no reusable price.
- **The portal configuration** (`ensurePortalConfiguration`): customer update (email, address, tax
  id), invoice history, payment method update, cancellation at period end without proration, and
  price switching between every product's active recurring prices with prorations — both
  subscription features off when nothing recurring is sold. `portalBranding` supplies the business
  profile and default return URL; fingerprint `portal:<service>` holds its id, and its hash covers
  the catalogue, the branding and the deployment key, so an unchanged declaration makes no call.
- **Each deployment owns its own portal configuration**, tagged
  `{ owlmeans: 'payment', service, deployment: webhookUrlOf(ctx) }` (`STRIPE_DEPLOYMENT_KEY`) — the
  webhook URL keys it even when undeliverable (local). The configuration the fingerprint row names
  is retrieved and updated, unless its metadata tags it for another deployment or service, which is
  never overwritten. Without a usable row, only an active configuration tagged with exactly this
  service and deployment key is adopted (how a forced `resync`, which clears fingerprints, finds its
  own again); a configuration carrying only the service label is not. Stripe cannot delete portal
  configurations, so one a deployment can no longer identify stays behind and a new one is created.
- **`portalLink(ctx, entityId, { flow, planSku?, returnUrl })`**: a customer is required
  (`PortalUnavailable('customer')`); `Manage` opens the home, `PaymentMethod` the payment form;
  `Cancel`, `Update` and `Change` need an entitling Stripe subscription
  (`PortalUnavailable('subscription')`), and `Change` confirms its stored item switching to
  `planSku`'s price as exactly one item. Deep links return with `after_completion: redirect`.
  `PortalUnavailable` declares 409, so a portal asked of an entity with nothing to manage answers
  409 Conflict, never 500.
- **The webhook endpoint** (`ensureWebhookEndpoint`): at `webhookUrlOf(ctx)` — this service's
  public URL plus the webhook route — on the API version read back from the client
  (`apiVersionOf`, the SDK default; never a literal), subscribed to `WEBHOOK_EVENTS`. A URL that is
  not https on a public dotted host is skipped. An unchanged `{url, apiVersion, events}` hash makes
  no call; `force` (the `resync` route) first verifies the stored endpoint exists and recreates one
  deleted from outside; changed events update in place; a changed API version deletes and recreates
  (the version is create-only); an endpoint already at this exact URL that no row names is replaced
  (its secret is unknowable). The secret — returned only by create — is stored field-encrypted where
  the database has a key.
- **A deployment is its webhook URL, and deletes only what it remembers.** Deployments of one
  service may share a Stripe account, each with its own database and URL. A `payment-webhook` row of
  the same paygate and service at another URL is a URL this deployment has left: after the current
  endpoint is in place, the endpoint that row names is deleted (already gone is fine) and the row
  removed. An endpoint at another URL that no row names belongs to another deployment and is never
  deleted; the `{ owlmeans: 'payment', service }` metadata on created endpoints is an operator's
  label, never deletion authority. A retired deployment's endpoint is removed by hand. The portal
  configuration follows the same identity (above).
- **Signature verification** tries the configured `webhook` override, then the stored secret
  (`stripeWebhookSecrets`); none configured is `WebhookSetupError('secret')`.
- **Do not bump the Stripe SDK major**: the pinned API version reads `current_period_*`,
  `invoice.subscription` and `charge.invoice` at the top level, and they move in later versions.

## Event dispatch

| Event | Persisted | Observer · event key |
|---|---|---|
| `customer.created` / `.updated` | customer upsert | — |
| `customer.deleted` | customer `deletedAt` | — |
| `checkout.session.completed` / `.async_payment_succeeded` | paid payment session ⇒ fulfillment, `fulfilledAt` after observers | `onTopUp` · `externalId` (session id) |
| `checkout.session.async_payment_failed` | fulfillment `failedAt` | `onPaymentFailed {kind:'checkout'}` · `payment-failed:<session>:0` |
| `checkout.session.expired` | unfulfilled fulfillment purged | — |
| `customer.subscription.created` / `.updated` / `.pending_update_applied` / `.pending_update_expired` / `.paused` / `.resumed` | subscription applied | `onSubscription` · classified |
| `customer.subscription.deleted` | applied as Canceled + `endedAt` | `canceled` |
| `customer.subscription.trial_will_end` | applied | `trial-ending` |
| `invoice.paid` | cycle invoice ⇒ subscription re-read, applied as a renewal; otherwise `latestInvoiceId` | `renewed` |
| `invoice.payment_failed` / `.payment_action_required` | subscription re-read and applied | classified (`past-due`), then `onPaymentFailed {kind:'invoice', attempt, nextAttemptAt, actionRequired}` · `payment-failed:<invoice>:<attempt>` |
| `invoice.upcoming` | nothing (enabled for the application's own use) | — |
| `invoice.marked_uncollectible` | subscription re-read and applied | classified (`suspended`) |
| `invoice.voided` | `latestInvoiceId` refreshed | — |
| `charge.refunded` (each refund of the charge), `refund.created` / `.updated` (succeeded only) | fulfillment `refundedMinor` / `refundedAt` | `onRefund` · `refund:<refund>` |
| `refund.failed` | — | — |
| `charge.dispute.created` / `.funds_withdrawn` / `.funds_reinstated` / `.closed` | target `disputedAt`, `disputeStatus` | `onDispute {phase}` · `dispute:<dispute>:<phase>` |

A refund or dispute resolves to its target by payment intent (fulfillment), by charge (stored
charge, the charge's payment intent, else its invoice), by invoice (the subscription whose latest
invoice it is, else the invoice's subscription). Nothing resolved ⇒ logged, no observer.

## Observer API and idempotency keys

Callbacks run sequentially and are awaited; a throw escapes so Stripe redelivers. Every callback
must be idempotent by its key.

| Callback | Payload | Key |
|---|---|---|
| `onTopUp` | `TopUpCompletion` (`amount` / `quantity`) | `externalId` — the session id |
| `onSubscription` | `SubscriptionEvent {change, previous, current, active, eventKey, invoiceId?, externalEventId?}`; snapshots carry `rank`, `status`, period, `capabilities`, `limits` | `subscription:<id>:created:<createdAt ISO>` · `…:renewed:<invoice>` · `…:upgraded|downgraded:<planSku>` · `…:trial-ending:<trialEnd ISO>` · `…:<change>:<event id>` (`sync-<ISO>` from a resync) |
| `onRefund` | `RefundEvent {target, amountMinor, refundedTotalMinor, paidMinor?, partial, netAmountMinor?, chargeAmountMinor?, …}` | `refund:<refund>` |
| `onDispute` | `DisputeEvent {phase, status, amountMinor, …}` | `dispute:<dispute>:<phase>` |
| `onPaymentFailed` | `PaymentFailedEvent {kind, attempt?, nextAttemptAt?, actionRequired?, …}` | `payment-failed:<session|invoice>:<attempt>` |

A proportional claw-back of a top-up uses the net credited value against what was paid:
`netAmountMinor * refundedTotalMinor / paidMinor`.

## Protocols and security

`paymentGate` is an immutable protocol tree bound by `paymentGateEntrypoints` with
`bind(protocol, handler)`: `webhook` (`POST /payment-gate/webhook/:paygate`) is public because
Stripe signs the untouched raw body — never put an application guard on it; `resync` (products,
portal, webhook endpoint, fingerprints ignored) and `resyncSubscriptions` (`{ scanned, updated }`)
carry `GUARD_ED25519`, so another service of the deployment triggers them with its own key.

## Testing

Unit specs run a real server context — real catalogue, services and gates — over in-memory
resources and a fake Stripe that records every SDK call, so "no Stripe call" is an assertion. The
Mongo-gated spec proves admission under concurrency and the collection validators against a real
database.

## External docs

- https://docs.stripe.com/api/checkout/sessions/create — Checkout accepts inline `price_data` with integer minor-unit `unit_amount`; automatic tax is enabled on the Session and amount items are tax-exclusive.
- https://docs.stripe.com/checkout/fulfillment — Fulfillment must be idempotent, check payment state and support delayed-payment success events rather than trusting completion alone.
- https://docs.stripe.com/api/webhook_endpoints/create — the signing `secret` is returned only by create; update accepts `enabled_events`, `disabled`, `url`, `description`, `metadata`; `api_version` is create-only.
- https://docs.stripe.com/api/events/types — the event names `WEBHOOK_EVENTS` subscribes to.
- https://docs.stripe.com/api/subscriptions/object — statuses `incomplete|incomplete_expired|trialing|active|past_due|canceled|unpaid|paused`; `pause_collection` pauses collection without changing the status; `paused` only after a trial without a payment method; on `2025-02-24.acacia` (stripe-node 17) `current_period_start/end` and `invoice.subscription` are top-level and move in later versions.
- https://docs.stripe.com/customer-management/portal-deep-links and https://docs.stripe.com/api/customer_portal/sessions/create — `flow_data.type` ∈ `payment_method_update|subscription_cancel|subscription_update|subscription_update_confirm`; `subscription_update_confirm.items` holds exactly one `{ id: <subscription item id>, price, quantity }`; `after_completion` is `redirect|hosted_confirmation|portal_homepage`; the configuration must enable `subscription_update` (with `products[{product, prices[]}]`) and `subscription_cancel`.
- https://docs.stripe.com/api/customer_portal/configurations/create — `features.{customer_update, invoice_history, payment_method_update, subscription_cancel{enabled, mode, proration_behavior}, subscription_update{enabled, default_allowed_updates, products, proration_behavior}}`, `business_profile`, `default_return_url`, `metadata`; updatable by id, retrievable and listable (`active`, paginated), and never deletable — a configuration can only be deactivated.

## Related

- [[entitlements]] — the model across packages
- [[payment]] — the contracts: grammars, window algebra, views, refusals
- [[web-payment]] — hooks and pieces over the entitlement view
- [[mongo-resource]] — raw collection access, duplicate-key detection, field locking
