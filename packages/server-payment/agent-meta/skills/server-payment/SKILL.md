---
name: server-payment
description: Public provider-agnostic paygate host for OwlMeans backends — payment providers registered per context (PaymentProvider / Paygate capabilities, ensurePaymentProviders, paygatesOf, forSale, the defined reaction to every absent capability, the boot feature checks), amount and quantity checkout, subscriptions, the checkout plugin seam (per-entity narrowing, admission, holds), protocol-bound webhook routes dispatching neutral paygate events, the catalogue sync with per-currency prices, fulfillment observers, entitlement gates, internal plan grants and revokes, entitlement grants (payment-grant units and capabilities beside the plan), and the EU consumer-rights service (country lock, purchases and withdrawal windows, spend consent, subscription start requests, the withdrawal and cancellation functions with automatic refunds and credit notes, durable-medium mails, reconcile). Use when wiring @owlmeans/server-payment, writing a payment provider, or changing payment behavior.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-payment

**Install:** `bun add @owlmeans/server-payment@^0.2.0-alpha.0`

Public MIT package. It embeds payments into an application backend and owns everything between a
paygate and an entity's entitlements: the subscription store, one-time fulfillments, the usage
ledger of counted limits, plan resolution, the two gate services, the paygate bootstrap (products,
prices, the portal, the webhook endpoint — each delegated to the paygate) and the EU consumer-rights
records and functions. **It names no paygate and depends on none**: a paygate is a payment provider
package (OwlMeans connect) registered in the context. The application owns its catalogue, what a
purchase is worth to it (credits, provisioning), its usage meter and its side effects. Contracts —
plans, limits, promos, the entitlement view, the consumer-rights views, calculators, copy and
refusals — are `@owlmeans/payment`; the model across packages is the `entitlements` skill. Field
lists, the service contract and the step-by-step algorithms are in the `reference` part
([parts/reference.md](parts/reference.md)); a provider's own SDK behaviour is its package's skill.

## Wiring

```typescript
declarePaymentPricing(cfg, {                           // absent entirely: today's fixed behaviour, unchanged
  tax: { automatic: true, behavior: TaxBehavior.Exclusive, collectTaxId: true, estimate: true },
  currency: { adaptive: true, adaptiveFeeRate: 0.04, estimate: true },   // the fee is optional: see "The estimate"
})                                                     // `tax` and `currency` only — a provider declares its own settings
declareConsumerRights(cfg, {                           // absent: no consumer-rights behaviour at all
  textVersion: 'terms-2026-09', links: { en: { billingTerms, withdrawalInformation, withdrawalFunction, cancellation } },
  currencies: { eu: 'eur', other: 'usd' },
  mechanisms: { countryLock: true, checkoutTerms: true, performanceConsent: true, subscriptionStart: true,
    withdrawal: true, automaticRefunds: true, cancellation: true, purchaseConfirmation: true },
  trader: { name: 'Example', legalName: 'Example Ltd', address: '…', email: 'support@example.com' },
  mail: { from: 'billing@example.com', bcc: ['archive@example.com'] },   // alias: default MAILER_SERVICE
  consentContext: 'included',                          // optional: the `_included` consent copy variant
})
declarePaymentProduct(cfg, { sku: 'app-plans', type: ProductType.Service, services: ['app'], name: 'Plans' })
declarePaymentPlan(cfg, { productSku: 'app-plans', sku: 'free', rank: 0, free: true, price: 0, … })
declarePaymentPlan(cfg, { productSku: 'app-plans', sku: 'pro-monthly', rank: 10, price: 20,
  recurring: { interval: 'month' }, currencyPrices: { usd: 20 },
  withdrawal: { components: [{ key: 'services', basis: 'time', shareMinor: 1000 },
    { key: 'credits', basis: 'units', shareMinor: 1000 }] }, capabilities: […] })

appendMyPaygate(context)                                 // a provider package's `append…` — in EVERY process, before or after the gateway
appendPaymentGatewayService(context)                     // the process that talks to the paygates
appendPaymentGatewayService(context, { manage: false })  // a worker that only reads entitlements and asserts consent
// One deployment, several managed processes on one database: the same owner and webhookService everywhere
appendPaymentGatewayService(context, { owner: 'app-api', webhookService: 'app-hooks' })                   // receives the webhook, bootstraps at boot
appendPaymentGatewayService(context, { owner: 'app-api', webhookService: 'app-hooks', bootstrap: false }) // checkout and portal only
appendConsumerRights(context, { manage, usage: myUsageMeter })   // before or after the gateway; idempotent
paymentAccessOf(context).consumerRights().useMailRenderer(myRenderer)   // lazy service: works while wiring
paymentAccessOf(context).gateway().use(myCheckoutPlugin)  // a tier / cap / hold plugin — once the context is initialized
export const serverBindings = [
  ...paymentGateEntrypoints,                            // the library's own, unpinned `paymentGate`
  ...consumerRightsEntrypoints(consumerProtocols, { guardMoney, throttle, subjectOf, planNameOf }),
  ...checkoutReadEntrypoints(checkoutProtocols),
]
// …or the gate re-declared by the application (its aliases, pinned to its service, the library's paths):
export const hookBindings = [
  bind(own.base),
  bind(own.webhook, paymentGateHandlers.webhook),
  bind(own.resync, paymentGateHandlers.resync),
  bind(own.resyncSubscriptions, paymentGateHandlers.resyncSubscriptions),
]
paymentAccessOf(context).observer().onSubscription(async event => { /* keyed by event.eventKey */ })
```

- `appendPaymentGatewayService` registers twelve resources, the catalogue service
  (`PAYMENT_SERVICE`), the payment providers service (`PAYMENT_PROVIDERS`), the completion observer,
  the gateway (`GATEWAY_SERVICE`), the capability gate (`ENTITLEMENT_GATE`), the limit gate
  (`LIMIT_GATE`), the entitlement service (`ENTITLEMENT_SERVICE`) and the consumer-rights service
  (`CONSUMER_RIGHTS_SERVICE`), each only when not registered already. `appendConsumerRights` does the
  consumer-rights part alone.
- **Registration order is free.** Whichever of `appendConsumerRights`, the provider and the gateway
  comes first, `usage` is installed on the one service and `manage` resolves as the application's
  explicit value, else the gateway's, else managed. The consumer-rights resources keep the aliases of
  the first registration.
- **The consumer-rights service and the providers service are lazy** (like the completion observer):
  `paymentAccessOf(ctx).consumerRights()`, `useMeter`, `useMailRenderer` and a provider's registration
  work while the application is wired; the gateway's initialization initializes the consumer rights, so
  its boot checks still run at boot. The gateway is NOT lazy: `paymentAccessOf(ctx).gateway()` (and
  `.use(plugin)`) needs the initialized context.
- **`manage: false`** registers the same surface without talking to a paygate: no bootstrap at init,
  and `createLink`, `portalLink`, `estimatePrice`, `resyncSubscription`, `resyncAll`, the webhook
  route, `withdraw` and `cancel` throw `PaygateError('unmanaged')`. `grantInternalPlan`,
  `revokeInternalPlan`, the entitlement grants, the entitlement service, `amountPolicy`, `planPrices`
  and the consumer-rights reads, `recordConsent`, `recordStartRequest` and `assertConsent` work,
  because they are Mongo only. Register the provider there too: the webhook route resolves the paygate
  first, and the boot checks its features.
- **Three keys of a deployment's paygate state**, each a `PaymentGatewayOptions` field, each read back
  on the gateway (`paymentAccessOf(ctx).gateway().webhookService / owner / bootstrap`):
  - `webhookService` (default `cfg.service`) — the `cfg.services` alias whose host and base form
    `webhookOf(ctx).webhookUrlOf(paygate)` (`/<base>/payment-gate/webhook/<paygate>`), the portal's
    deployment key too (`webhookOf(ctx).deploymentOf(paygate)` = `{ owner, webhookUrl }`). Name the
    process that RECEIVES the webhook (the one serving `paymentGate`) in every process, so every
    bootstrap computes one URL.
  - `owner` (default `cfg.service`) — the `payment-webhook` rows' `service`, the signing-secret
    lookup and the labels a paygate puts on its own objects. One value in every process of the
    database, so each finds and replaces the others' rows.
  - `bootstrap` (default: `manage`) — run `paygateBootstrapOf(ctx).bootstrap()` at boot. Exactly one
    kind of process keeps it (the receiver). A managed process with `bootstrap: false` still serves
    checkout, the portal, estimates, the resyncs and the webhook route, and a FORCED bootstrap
    (`resync`, an application's maintenance `paygateBootstrapOf(ctx).bootstrap({ force: true })`)
    still runs there — same URL, same rows, fingerprinted, so idempotent from any process.
  - Refused at construction: `bootstrap: true` with `manage: false`, an empty `owner` or
    `webhookService` (`PaygateError`). A managed, bootstrapping gateway fails its initialization when
    `webhookService` is not declared in `cfg.services` (`WebhookSetupError('service:<alias>')`).
- **Boot checks** (gateway initialization): a declared policy feature a registered paygate lacks
  fails the boot — `tax.automatic` → `automaticTax`, `tax.collectTaxId` → `taxIdCollection`,
  `currency.adaptive` → `adaptiveCurrency`, the consumer-rights `checkoutTerms` → `termsConsent`
  (`PaygateError('feature:<flag>:<paygate>')`); a managed, bootstrapping gateway with no provider
  registered fails (`PaygateError('provider:none')`), a managed one without bootstrap only warns.
- Every process that registers the gateway runs the collection validators (`collMod`) of all
  twelve records at init: a process of an older version narrows the validators again, so roll
  the processes of one deployment out together.
- Gateway methods take the stable `entityId`. A public handler resolves it from its request
  entity first; protocol bodies carry `entitySlug`.

## The paygate contract

A provider implements `PaymentProvider { id, features, bind(ctx): Paygate }` (`paygate/types.ts`) and
is registered with `ensurePaymentProviders(ctx).register(provider)` — one registered under a taken id
replaces it. `paygatesOf(ctx)` binds each provider once per context: `find(id)` (or `null`), `get(id)`
(`UnknownPaygate`), `all()` in registration order, and `forSale(product, plan, requested?)` — the
paygates the plan is sold through (`planHelper.isSoldThrough`) that can sell it (a recurring plan needs
`subscriptions`), narrowed to `requested`. `paymentAccessOf(ctx).paygates()` is the same registry.

`features` (`PaygateFeatures`): `automaticTax`, `taxIdCollection`, `adaptiveCurrency`, `termsConsent`,
`customTextMax?` (the host refuses a longer text, `ConsumerRightsError('copy:length:<field>')`),
`sessionTtl?` (the plugins' lifetime is clamped into it; absent, a session takes none). The paygate
always has `settlementCurrency()`, `customers` (`ensure`, `retrieve`, `setCountry`, `locks`) and
`checkout` (`createSession`, `expireSession`, `units`, `listCompleted?`); every other capability has a
defined host reaction to its absence:

| Absent | Host reaction |
|---|---|
| `subscriptions` | a recurring plan is not for sale through it; resync skips its rows; a subscription withdrawal is `review`; a cancellation is only received |
| `payments` | every withdrawal of its purchases is `review` (no paygate call); refunds and disputes resolve without charge or invoice reads |
| `payments.creditNotes` | a withdrawal refunds proportionally, without a corrective document |
| `webhook` | its route throws `PaygateError('capability:webhook')`; the bootstrap skips the endpoint |
| `catalogue` | the product sync skips it; a quantity or subscription checkout throws `ProductError('price:<lookup key>')` |
| `portal` | `portalLink` throws `PortalUnavailable('paygate')`; the bootstrap skips the configuration |
| `tax` | an estimate answers `at-checkout` |
| `fx` | a conversion between two currencies throws `PaygateError('fx-rate:<from>:<to>')`; an estimate has no local line |
| `checkout.listCompleted` | the consumer-rights reconcile backfills no purchase |

Every call that moves money or ends a contract carries a `PaygateCall { idempotencyKey, comment? }`:
the host computes the keys (`withdrawal:<id>:<step>[:<attempt>]`, `cancellation:<id>:schedule[:<attempt>]`)
and the notes (`withdrawal:<id>`, `cancellation:<id>`). What the host reads back is neutral data —
`CheckoutSnapshot`, `PaygateSubscription` (the status already mapped to `SubscriptionStatus`),
`PaygateInvoice`, `PaygateCharge`, `PaygateRefund`, `PaygateDispute` — and a webhook delivery is
verified by the paygate into ordered `PaygateEvent`s (`customer`, `checkout`, `subscription`, `invoice`,
`refund`, `dispute`). A provider reaches the host's stores through `paymentAccessOf(ctx)`
(`paygateCustomers`, `paymentWebhooks`, `fingerprints`, `pluginConfig`), `consumerRecordsOf(ctx)` and
`webhookOf(ctx)`; its own settings are its own plugin records.

## Declaring plans

- **`rank`** orders a product's plans; a higher rank is an upgrade. A safe integer `>= 0`; absent
  reads as `0`.
- **The free plan is a plan**: `free: true`, `price: 0`, no `gateways`. It is never synchronized to
  a paygate and never checked out; an entity without an entitling subscription resolves to it.
- `gateways` names the paygates a plan is sold through; absent inherits the product's, and neither
  declared means EVERY registered paygate (`declarePaymentProduct` no longer defaults it). An empty
  list sells it through none.
- **`currencyPrices`** (`{ usd: 20 }`, major units, lowercase codes) are exact prices in further
  currencies, synced as further currencies of the reusable price; a declared price in the price's
  default currency replaces its converted amount. Only for recurring and quantity plans.
- **`withdrawal.components`** state the separately priced parts of a subscription for a withdrawal
  (CJEU C-641/19): `{ key, basis: 'time' | 'units', shareMinor }`, the shares summing to
  `round(price × 100)`. Absent: the whole price is one `time` component. They also pick the start
  statement: a `units` part → the `_units` variant, otherwise the base (time-only) texts
  (`consumerCopyHelper.startContextOf`, `@owlmeans/payment`).
- `declarePaymentPlan` refuses before recording: a bad rank or a priced/gatewayed free plan
  (`PlanRankConflict`), a capability set under the reserved `limit` scope, a malformed limit
  (`LimitMisdeclared('<key>:<reason>')`), a malformed or amount-mode `currencyPrices` or components
  that do not add up (`ProductError('currency-prices:…' | 'withdrawal:<sku>:…')`).
- `makePlanDeclarationsModel(cfg).assertPlans()` runs when the gateway initializes and fails the boot on two free plans
  at one rank, or two paid non-consumable plans of one product at one rank.
- A limit key may use a different kind on different plans; each kind counts separately and a
  lifetime count stays with the entity through upgrades, downgrades and cancellations.

## Records

None declares an ObjectId reference: `entityId` is an organization key and every other id is the paygate's; every row of a paygate carries its id in `paygate`.

| Collection | One row per | Indexes |
|---|---|---|
| `payment-paygate-customer` | paygate customer (`country`, `currency` from its events; `deletedAt`) | `{paygate, externalId}` unique · `{paygate, entityId}` · `{paygate, profileId}` |
| `payment-subscription` | subscription: a paygate's id, `free:<entityId>`, `internal:<planSku>:<entityId>` (+ `currency` and the checkout evidence) | `{paygate, externalId}` unique · `{entityId, status, rank:-1}` · `{entityId, planSku}` · `{paygate, customerId}` · `{paygate, itemId}` sparse · `{paygate, status, updatedAt}` |
| `payment-fulfillment` | one-time checkout session (+ evidence: country, e-mail, totals, terms, `purchaseId`) | `{paygate, externalId}` unique · `{paygate, paymentIntentId}` sparse · `{paygate, chargeId}` sparse · `{entityId, createdAt:-1}` |
| `payment-webhook` | managed webhook endpoint of an owner (`service` = the gateway's `owner`; `secret` is `secure: true`) | `{paygate, service, url}` unique |
| `payment-usage` | usage event — the ledger | `{entityId, limitKey, eventKey}` unique · `{entityId, limitKey, window}` · `{entityId, limitKey, ref}` sparse · `{entityId, createdAt:-1}` |
| `payment-usage-counter` | (entity, limit, window) projection | `{entityId, limitKey, window}` unique |
| `payment-grant` | entitlement grant beside the plan: `kind` (`units` / `capability`), `limitKey`, `capability`, `amount`, `used`, `startsAt`, `endsAt?`, `status` (`active` / `revoked`), `ref`, `note`, `revokedAt` | (§ Entitlement grants) |
| `payment-fingerprint` | synchronized product (`<productSku>`, with `prices[]` — one paygate syncs a product) or a paygate's own fingerprint (its portal configuration) | `{sku}` unique |
| `payment-billing-profile` | organization: the billing country fixed at the first purchase | `{entityId}` unique · `{paygate, customerId}` sparse |
| `payment-purchase` | purchase = contract + withdrawal window (a paid one-time checkout, a subscription's first invoice) | `{purchaseId}` unique · `{contractRef}` unique · `{entityId, deadline:-1}` · `{entityId, purchasedAt:-1}` · `{sessionId}` unique sparse · `{paygate, subscriptionId}` · `{invoiceId}` · `{invoiceNumber}` · `{paygate, paymentIntentId}` |
| `payment-consumer-consent` | append-only: a performance consent or a subscription start request | `{entityId, decidedAt:-1}` · `{kind, entityId, planSku, decidedAt:-1}` |
| `payment-consumer-declaration` | append-only: a withdrawal or cancellation declaration | `{kind, receivedAt:-1}` · `{entityId, receivedAt:-1}` sparse · `{purchaseId}` sparse |
| `payment-consumer-event` | append-only: one execution or audit step (mail, refund, lock …) | `{recordId, at}` · `{entityId, at:-1}` sparse · `{action, ok, at}` |

- Every stored property is declared in the record schema (`additionalProperties: false`): the
  resource writes a property its schema does not know as a string, and the collection validator
  rejects it. New fields on existing records are optional, so old rows stay valid.
- **A map is stored as an array** (`prices[].options: [{ currency, unitAmount }]`): the resource
  coerces a currency-keyed map's values to strings.
- A compound sparse index still indexes a row that lacks only some of its keys — a unique index
  that must skip absent values is single-field (`{sessionId}`).
- Conditional writes (`consentedAt`, `withdrawnAt`) are raw `$set`s guarded by the old value
  (`paymentUtils.conditionalSet`), so a concurrent declaration of the same purchase loses; declarations,
  consents and events are only ever created.

## Checkout

`gateway.createLink(ctx, params)` (`checkoutOf(ctx).createCheckoutLink`): the plans of the product
for sale through some paygate (`params.paygate` narrows), the named plan (else the product's first
recurring plan, a consumable's first plan), the paygate `forSale` answers first — a plan no paygate
sells is `ProductError('plan:<sku>')`, none at all `ProductError('plan')`. The host decides the whole
session and hands the paygate a `SessionInput`; the paygate only translates it.

- `Amount`: one inline line at the charge amount (`checkoutPricingHelper.chargeAmountMinor`, the
  declared `tax.behavior`), the policy narrowed by the plugins first. `Quantity`: the reusable price
  under the plan lookup key (`catalogue.price`), adjustable quantity. Subscription: the plan's reusable
  price, quantity 1, and the subscription's own metadata.
- `CreateLinkParams.locale` is a caller-validated locale the paygate supports. `submitText` is
  trusted application copy — a string, or a function of `CheckoutTextContext {language, currency,
  unitAmountMinor, interval, region, country}` — on every mode; never caller-provided text.
- `automaticTax` / `collectTaxId` / `adaptiveCurrency` exactly as `PricingPolicy` declares them
  (`adaptiveCurrency` only when the charge currency is the settlement currency), `keepAddress` when the
  saved address carries the locked or pinned country and is tax-locatable.
- **Metadata** (session; a subscription's own too): `pricingMode`, `currency`, `entityId`,
  `profileId?`, `service`, `productSku`, `planSku`; an amount checkout's `amountCurrency`,
  `amountMinor`, `sourceChargeAmountMinor`, `chargeAmountMinor`; under a consumer-rights policy below.
  The checkout events read them back — they are the host's, never a paygate's.
- **Without a consumer-rights policy every session is what it always was**: the charge currency is the
  settlement currency (FX through the paygate's `fx`), local-currency pricing as declared.

### Under a consumer-rights policy

- **The country.** A locked billing profile overrides `params.country`; another declared country is
  `BillingCountryLocked` (409), and so is a saved customer address that left the locked country
  (an operator relocks). An organization that already paid before its country was locked is
  locked lazily from its paygate customer's address (`source: 'customer'`). Before any lock, the
  declared country is preselected on a customer without an address (`customers.setCountry(…, { replace: false })`).
- **The currency.** Charge currency = the profile's currency, else `consumerRegionHelper.chargeCurrencyOf(region)`
  (`policy.currencies`). An amount checkout whose policy currency IS the charge currency is
  charged exactly — no FX call; any other goes through the paygate's FX reference rate (rounded up). A
  subscription or quantity session is forced to the charge currency only when its synced price
  carries it (default or further currency) — otherwise it is left to the paygate and warned.
- **Terms.** `mechanisms.checkoutTerms` puts the terms checkbox (`collectTerms`) with the
  `checkout.terms-acceptance.in-scope | other` copy and the billing language's links on every session.
  A paygate may create the session without it when its own account cannot collect it — then the
  metadata says `termsCollected: 'false'` and it audits a `checkout-terms-fallback` event.
- **Texts.** An in-scope top-up without `submitText` says what it buys (`checkout.top-up`, with the
  country's name); a subscription without `submitText` shows the renewal price in the charge
  currency (`checkout.renewal.<interval>`), and the after-submit text links the cancellation page while
  that mechanism is on. Every text is asserted within the paygate's `customTextMax`.
- **Start requests.** A subscription needs a fresh start request bound to the organization, the
  plan and the current text version (`assertStartRequest` → `SubscriptionStartRequired`, 428),
  unless the organization is already locked outside the territories — a country picked before
  checkout may differ from the address typed at the paygate.
- **Metadata**: `region`, `country`, `language`, `termsVersion`, `copyVersion`, `termsCollected`
  (`'true'` when the checkbox is on the session), `ipCountry` (the `cf-ipcountry` the app passes),
  `startRequestId`, `countryPinned` (`'true'` only under the paygate's customer country lock when the
  session kept the pinned address). The purchase's `termsAccepted` comes only from the completed
  session's own terms acceptance — absent when nothing was collected.

### Free completions

A completed amount checkout with promotion codes enabled, a positive subtotal fully discounted, zero
tax and a zero total fulfills (`checkoutSnapshotHelper.canFulfill`) as a paid one does; currency,
subtotal and credit-value metadata checks still apply, fulfillment keeps the full selected credits.
A zero-total top-up keeps its purchase receipt and country lock but has no monetary withdrawal
deadline, spending-consent window or refundable amount; a discounted paid purchase refunds
proportionally to the actual payment. `DisputeEvent.paidMinor` is the actual charge total.

### Customer locks (`customers.locks()`, provider configuration)

- **E-mail** — every `createLink` must pass `CreateLinkParams.email` (the application's verified
  e-mail of the buyer), else `PaygateError('customer-email')` before any paygate call; it is passed to
  `customers.ensure`, which pins it on the paygate customer. Without the lock `email` is ignored.
- **Country** — the known country (the locked profile's, else `params.country`) is written to the
  customer as a country-only address (`setCountry(…, { replace: true })`) when the saved one carries no
  or another country — over another country only before any lock. When the saved address is
  tax-locatable the session keeps it (`keepAddress`): tax on the pinned country, and metadata
  `countryPinned: 'true'` makes the first completed purchase lock THAT country.

## Checkout plugins

`paymentAccessOf(ctx).gateway().use(plugin)` seats a `CheckoutPlugin` per gateway instance (the `ExecutionService.use`
registry: a plugin whose `alias` is registered already replaces it). All hooks are optional:

| Hook | Called | Contract |
|---|---|---|
| `narrow(ctx, {entityId, productSku, planSku?, base, at})` | every amount checkout and every `gateway.amountPolicy` | answers an `AmountNarrowing` or `null`; a throw fails the checkout closed |
| `admit(ctx, CheckoutAttempt)` | before the session, every mode | throw (`CheckoutLimitExceeded`) to veto; may return `{ reservationId }` |
| `created(ctx, CheckoutCreated)` | after the session | gets `sessionId`, `url`, `expiresAt`, amounts, its own `reservationId`; a throw expires the session, releases every hold and propagates |
| `settled(ctx, CheckoutSettled)` | webhook: `paid`, `expired`, `failed`; and `failed` for a checkout that never became usable | errors are logged, never raised |
| `sessionTtlSeconds` | — | the smallest declared, clamped into the paygate's `features.sessionTtl`, becomes the session's `expiresAt`; none declared, or a paygate without bounds: its own default |

- **One narrowing path.** `createLink` and `gateway.amountPolicy(ctx, entityId, productSku,
  planSku?)` both call `checkoutPluginsOf(ctx).narrowAmountFor` → `amountNarrowingHelper.narrowAmountPolicy` (`@owlmeans/payment`); an amount
  above the narrowed maximum, or any amount while `blocked`, is `CheckoutLimitExceeded` (409). A
  control and a refusal cannot disagree. An amount above the plan's own maximum stays the base
  policy's error.
- A veto, a paygate refusal, a session without a URL or a throwing `created` (the fresh session is
  expired first) releases what the earlier plugins admitted
  (`settled` with `outcome: 'failed'` and their `reservationId`).
- `gateway.planPrices(ctx, productSku)` answers `PlanPriceView[]` (a default entry per Price plus
  one per further currency) from the synced fingerprint rows — no paygate call.

## Catalogue sync and the estimate

- `productSyncOf(ctx).syncProducts(paygate)` — for every product with a plan sold through the paygate:
  a recurring or quantity plan whose catalogue currency differs from the paygate's settlement currency
  is converted at its FX reference rate (rounded up); its **further currencies** are the declared
  `currencyPrices`, plus the catalogue currency (exact `round(price × 100)`) when it is one of the
  policy's region currencies. The resolved amounts, currencies, options and the declared tax behavior
  are fingerprinted; an unchanged fingerprint makes no paygate call. Otherwise `catalogue.syncProduct`
  brings the product and its prices to the declaration (the paygate keeps a subscriber's accepted
  price) and the host stores the product's `prices[]` (`SyncedPrice`: price id, lookup key, default
  currency and amount, options, tax behavior, interval, source amount) on the fingerprint row — what
  `planPrices`, checkout currency forcing and the estimate read. A row from before `prices[]` existed
  syncs once more. `syncPaymentProducts()` syncs every paygate.
- `estimatePrice` (`estimateOf(ctx).estimatePrice`): the paygate's `tax.calculate` for one
  product/plan's reference amount at a country — cached per gateway-service instance for 24 h per
  distinct (paygate, currency, country, amount, tax code, behavior, matching tax ids, exemption);
  failures are never cached. **A locked profile overrides the requested country** (`source: 'profile'`,
  `locked: true`); without one the paygate customer's country serves (`source: 'customer'`), its tax
  ids of that country and its exemption included. The estimate carries `region`. Under a policy with
  region currencies a recurring plan is estimated in the charge currency at its synced unit amount;
  the `local` line only when the session's CHARGE currency is the settlement currency — the same test
  the session takes. An amount plan stays estimated in its policy currency but is charged in the
  region's currency, so an EU top-up gets its local line through the policy → settlement → local chain.
- **The local line prices the conversion the way checkout does.** `currency.adaptiveFeeRate`
  declares the paygate's local-currency conversion fee: `local.exchangeRate` = the quote's base rate
  `/ (1 + fee)` (and `fxFeeRate` = the fee), divided by the source's reference rate for an amount plan.
  Absent, `local.exchangeRate` is the quote's own fee-inclusive rate. A paygate without `fx` gives no
  local line; a paygate without `tax` answers `at-checkout`.

## The subscription store

- **The effective plan** is the highest-ranked row in `ENTITLING_STATUSES` (catalogue rank; the
  newest on a tie), else the declared free plan, else `PlanRequired`.
- **A subscription row may override its plan.** `PaymentSubscriptionRecord.overrides`
  (`SubscriptionOverrides`: `limits: { <key>: { limit } }`) is applied by `planHelper.overriddenPlan(plan, row)`
  inside `resolveEffectivePlan` and `snapshotOf`, so ceilings, the entitlement view, both gates and
  observers read one answer and nothing else needs to know. An override sets the ceiling of a key
  the plan declares and drops that key's promo; kind and window stay the plan's (counters are keyed
  by them); an undeclared key or a ceiling that is not a safe integer `>= 0` is ignored. An operator
  writes it, no paygate does: every sync and re-grant spreads the previous row, so it survives. It
  belongs to the row — it follows the subscription through a plan change, ends with it, and the
  free-plan fallback (no row) has none. A new overridable parameter is a new optional key of
  `SubscriptionOverrides`, declared in `PaymentSubscriptionSchema` and merged in `planHelper.overriddenPlan`.
- The paygate maps its own status to `SubscriptionStatus` (`PaygateSubscription.status`, the raw word
  in `externalStatus`); a paused subscription is stored with `pausedAt`. The plan is the price's plan
  (`PaygateSubscription.planSku`), else `metadata.planSku`, else the row's.
- **State is written before observers, and classified against what observers were last told**
  (`propagated`, stamped with `lastEventId` only after every observer succeeded).
  `CommitOptions.beforePropagate(record, change)` runs between the write and the observers — a
  paygate subscription's purchase is written there on `created`, so the window exists before an
  observer grants the bundle.
- Classification, first match: `created` · `canceled` · `paused` · `resumed` · `upgraded` /
  `downgraded` · `cancel-scheduled` · `cancel-undone` · `renewed` (once per invoice) · `past-due` ·
  `suspended` · `trial-ending`.
- A repeated delivery (`lastEventId`) is ignored; an older payload than the stored state is not
  applied. `resyncSubscription` / `resyncAll` (`paygateSubscriptionsOf(ctx)`) re-read through each
  row's paygate and apply as a webhook would; a subscription the paygate no longer has is canceled,
  a row of an unregistered paygate or one without `subscriptions` is skipped.
- **Internal plans** (`paygate: INTERNAL_PAYGATE`, row `internal:<planSku>:<entityId>`; Mongo only,
  so they work unmanaged): `gateway.grantInternalPlan(ctx, entityId, planSku, { force?, periodEnd? })`
  upserts the row — the free plan, or any plan with `force: true` (else `ProductError`); `periodEnd`
  is when it stops entitling (absent: never). A re-grant of a row that stopped entitling (revoked,
  or past its period end) RE-ACTIVATES the same row: `createdAt` stays the first grant's (subscription
  windows, credit frames and grandfathered promos keep their anchor), `restartedAt` is stamped, and
  observers hear `created` again under a key carrying `restartedAt`; a restart whose observers
  failed is told again by the next grant. `gateway.revokeInternalPlan(ctx, entityId, planSku)` ends it
  now — `status: canceled`, `canceledAt` = now, `periodEnd` = `endedAt` = now (or the period end
  already past) — observers hear `canceled`; idempotent, answers whether anything changed.

## The usage ledger

`payment-usage` events are the source of truth; `payment-usage-counter` is the projection that
admission reads. `consume` increments the counter FIRST by one conditional upsert (`used <= limit
- amount`), then appends the event — **the counter may over-count, never over-admit**. An event
key is idempotent; `release` appends `release:<eventKey>` first. `reconcileCounters`,
`reconcileOccupancy`, `reconcileOf(ctx).reconcileEntity` and `.reconcileAll` repair it (details: the `entitlements`
skill).

## Entitlement grants

`entitlementGrantsOf(ctx)` (also `paymentAccessOf(ctx).grants()`; resource `payment-grant`,
`RES_PAYMENT_GRANT`, registered with the other payment resources; Mongo only) gives ONE organization
units or a capability beside its plan:

- `grant(entityId, { kind, limitKey?, amount?, capability?, startsAt?, endsAt?, ref?, note? })` —
  `units` needs a limit key some declared plan has (`LimitUnknown`) and a positive safe integer
  `amount`; `capability` (required for `capability`, optional on `units` — the capability those
  units need) is `scope:permission[>=n]`, never under the `limit` scope. `revoke(grantId,
  { entityId? })` (idempotent; `entityId` refuses another organization's), `get`, `list(entityId,
  { active?, at?, kind?, limitKey? })` (newest first), `inForce(entityId, at?)`.
- In force while `active` from `startsAt` until `endsAt` (exclusive); revoked or ended → ignored at
  read time: its used units stay consumed, its unused ones are gone.
- **Units are consumed AFTER the plan's allowance**: `consumeLimit` takes from the plan counter while
  it has room, else from the first units grant in force with room (earliest end first, then oldest),
  the event written in the grant's window `grant:<grantId>` (`GRANT_WINDOW_PREFIX`,
  `grantFoldHelper.windowOf`); `releaseLimit` gives a unit back to where it came from.
  `reconcileCounters` (and `reconcileOf(ctx).reconcileEntity` / `.reconcileAll`) rebuilds each units
  grant's `used` from its `grant:<id>` events; `reconcileOccupancy` holds what the grants say and brings the plan counter to the rest, so a unit
  of a revoked grant falls back on the plan (over-limit → the application's grace).
- **Folded, never a new field**: `limitState`, the consume outcome and the entitlement view read
  `limit + Σ amount`, `used + Σ used`, `remaining` (`grantFoldHelper.foldLimitView`); capability
  grants (and a units grant's capability) are merged into the effective plan by
  `resolveEffectivePlan` (`grantFoldHelper.withCapabilities`: the grant's row replaces a promo's or a
  smaller one, a plan that already covers it is left alone).
- Every grant and revoke tells `onEntitlementGrant` (`EntitlementGrantEvent`: `grant`, `change`
  `granted` / `revoked`, key `grant:<id>:<change>`) in the process that wrote it; a throw is logged
  and never undoes the grant — an application that provisions on it also reconciles nightly.

## Entitlements and gates

- `paymentAccessOf(ctx).entitlements()` → `effectivePlan`, `entitlements` (the `EntitlementView`), `hasCapability`,
  `limitState`, the ledger operations. Never calls a paygate.
- **Capability gate** (`ENTITLEMENT_GATE`) passes when the view grants ANY parameter; **limit gate**
  (`LIMIT_GATE`) when any `limit:<key>[>=n]` has room — it never consumes. Both refuse with
  `AuthForbidden` refusals (403) and fail closed on an unreadable store.
- The consumer-rights refusals (428/409) and `CheckoutLimitExceeded` are not entitlement refusals.

## Consumer rights

The EU right of withdrawal (with the Art. 11a withdrawal function), spend consent for prepaid
credits, subscription start requests, the cancellation function and a billing country fixed at the
first purchase. The service is `paymentAccessOf(ctx).consumerRights()` (`.consumerRightsOf()` is null-safe); its
full contract is in the `reference` part ([parts/reference.md](parts/reference.md)).

- **A purchase** is a paid one-time checkout, or a subscription's FIRST invoice — renewals,
  internal grants and manual credits never are. Its row (`purchaseId` `<paygate>:<checkout session id>` /
  `<paygate>:<subscription id>` — `consumerRecordsOf(ctx).purchaseIdOf(paygate, id)`, `contractRef`
  `CR-YYMMDD-XXXXXX` over an unambiguous alphabet, retried on a
  collision) is written **before anything is granted**: in `checkout.session.completed` before
  `onTopUp`, in the first subscription commit before the `created` observers. A completed
  subscription checkout then refines it with the buyer's own country, e-mail, totals and terms
  acceptance. Window = in scope, before `deadline` (`withdrawalDeadlineHelper.withdrawalDeadlineOf`, policy margin),
  neither withdrawn nor refunded; a full refund closes it (`refundedAt`).
- **In scope** when the buyer's own country or the organization's locked country is in the policy's
  territories; an unknown country is protected by default. A business tax id does not exempt.
- **The lock**: the first completed purchase's `customer_details.address.country` (else the
  declared one) locks the profile — first write wins through the unique index; a later different
  country is a `lock-mismatch` event, never a relock. The request's `cf-ipcountry` is stored as
  `ipCountry` beside it, and the `lock` event flags `ipMismatch`. The profile records the paygate it
  came from (`LockOptions.paygate`, default the first registered). Its currency is an entitling paygate
  subscription's currency when one exists (two subscriptions of one customer can not differ), else the
  region's. Only `lock(entityId, country, 'manual', { force: true, by,
  reason })` replaces a lock, audited as `relock`.
- **Unlock** (an operator, Mongo only — unmanaged works): `unlock(entityId, { by, reason })` deletes
  the profile (only while it still holds the country read) and appends an `unlock` event carrying the
  whole row; it answers the profile as it was, or `null`. After an unlock no lock is taken from the
  paygate customer's saved address — neither at checkout nor by `reconcile` — so the next COMPLETED
  purchase locks the country again from its own address.
- **Performance consent** (top-ups only — a start request covers a subscription's own invoice):
  required while an open in-scope top-up window has none. `assertConsent` is one indexed query and
  throws `PerformanceConsentRequired` (428, `pending`, latest `deadline`); an application calls it
  only where credits will actually be spent. `consentView` carries the policy's `consentContext`
  as `context`. `recordConsent` renders the statement itself (`consumerCopyHelper.consentStatementOf` with the
  trader's `name` and the policy's `consentContext`, so the stored verbatim text and the consent
  mail are the `_<context>` variant the dialog showed; without a context the base statement),
  stores that `context` on the record, refuses a stale `textVersion` with a fresh 428, covers only
  the open windows the body lists, stamps `consentedAt` conditionally, mails the confirmation, then
  tells `onConsent`.
- **Start requests follow the plan's withdrawal arithmetic.** `startView(entityId, planSku)` names
  `context = consumerCopyHelper.startContextOf(plan)` (`'units'` for a plan with a `units` component, absent for a
  time-only one); `recordStartRequest(subject, body, origin, { plan })` renders the statement with
  the SAME `consumerCopyHelper.startContextOf(plan)` and the plan's short name the application passes (default: its
  localized title), stores it verbatim with its `context`, and the start mail repeats it with
  `email.start.rule` of that variant (the record's `context`). Usable `startRequestTtlSeconds`
  (3600); the purchase takes it as `servicesStartedAt`/`consentedAt`.
- **Withdrawal** (`withdraw(subject | null, body, origin)`, managed only): in-app by `purchaseId`,
  public by contract reference or invoice number plus an e-mail of the purchase, its profile or
  its paygate customer. The declaration and the conditional `withdrawnAt` are written BEFORE
  the paygate; the receipt is mailed at once; then the paygate steps under
  `withdrawal:<id>:<step>` keys; then `onWithdrawal`. The refund comes from the application's
  `UsageMeter` through the `@owlmeans/payment` calculators (deduction `usedAfter + settled +
  clawed`); no meter, `automaticRefunds` off, or a paygate that cannot execute it (no `payments`; no
  `subscriptions` for a subscription purchase) is `review` (no paygate call). A late
  declaration is `expired` — recorded and acknowledged, nothing executed. A repeated one answers
  the original receipt. The public answer is always the bare `DeclarationReceipt`.
- **Cancellation** (`cancel(subject | null, body, origin)`): in-app the organization's entitling
  paygate subscription; public a contract reference plus e-mail, else the one organization whose
  paygate customer has that e-mail. Ordinary → `subscriptions.scheduleCancel` at the period end, or at
  a later boundary (`cancellationEffectiveAt`, no proration); already scheduled → `already-scheduled`;
  **extraordinary → `review`, the paygate untouched** (an operator decides, the receipt says so).
- **Observers `onConsent` / `onWithdrawal` / `onCancellation` run AFTER the records and the paygate
  steps; a throw is recorded (`observers` event) and retried by `reconcile()` — unlike the paygate
  callbacks, whose throw makes the paygate redeliver.** A `WithdrawalEvent` with `status: 'refunded'`
  carries `units.returned` — take exactly those back; `review` means an operator refunds later,
  and that refund arrives as an ordinary `RefundEvent`.
- **`RefundEvent.withdrawalId`**: a refund this package made for a withdrawal carries
  `metadata.withdrawalId`; an `onRefund` observer MUST skip its own claw-back for it, or the units
  are taken back twice.

## Durable-medium mails

Sent through the optional mailer (`mail.alias`, default `MAILER_SERVICE`), text + HTML, in the
language the consumer was shown, from the `payment-consumer-rights` copy (`email.*`): purchase
confirmation (in-scope purchases with an e-mail; withdrawal information with the function's
address and the model form), consent confirmation, start confirmation, withdrawal receipt,
cancellation receipt. User values are HTML-escaped; a deadline is shown as its last included day.
The mails and the withdrawal information name the trader's `legalName, address, email`; the
statements its `name`. Every send, skip or failure is a `mail` event (step = kind); addresses on
`.test`/`.example`/`.invalid`/`.localhost` and every subdomain of them (`consumerFormatHelper.isReservedAddress`; case, a
display-name form and a trailing dot read through) are never sent (recorded as skipped); each `bcc`
address gets its own copy. **The purchase confirmation goes out once per purchase**: a delivery
sends it only after winning the conditional `confirmationMailAt` claim on the purchase row (a mail
event of it from before the claim counts too) — concurrent deliveries in several processes, a
redelivery and a subscription checkout refining its purchase mail nothing twice; a failed send is
retried by `reconcile` only. `useMailRenderer((kind, data, rendered) => message | null |
undefined)` replaces (`message`), suppresses (`null`, recorded as skipped) or keeps a mail. The
boot warns once when a mailing mechanism is on and the trader has no address or e-mail, or no
mailer is registered.

## Reconcile

`paymentAccessOf(ctx).consumerRights().reconcile({ since?, limit? })` — the application's nightly job: retries the
paygate steps of withdrawals (refund, credit note, subscription cancel) and scheduled
cancellations, failed mails and failed observers; backfills purchases (records only, no mail) from
completed sessions of the last 16 days without a row; locks organizations that paid before the
lock from their paygate customer (never one an operator unlocked). A retry uses a fresh idempotency key (`…:<attempt>`; a paygate
may replay a stored failure) and first adopts a refund or credit note an earlier attempt
made (`payments.findRefund` / `creditNotes.find` by `metadata.withdrawalId`). The backfill reads each
paygate's `checkout.listCompleted`. Five failures of a step leave it to an operator. At most
`limit` (50) items per step.

## Protocols, handlers and security

- `paymentGate` (bound by `paymentGateEntrypoints`): `webhook` (`/payment-gate/webhook/:paygate`) is
  public because the paygate signs the untouched raw body — never put an application guard on it. It
  resolves the paygate FIRST (`UnknownPaygate` for an unregistered id), then refuses an unmanaged
  gateway (`PaygateError('unmanaged')`) and a paygate without `webhook`
  (`PaygateError('capability:webhook')`), lets the paygate verify the delivery
  (`PaygateSignatureError`, 400) and applies its events in order (`paymentEventsOf(ctx).apply`).
  `resync` and `resyncSubscriptions` carry `GUARD_ED25519`.
- **An application that declares the gate itself** — its own aliases, every route pinned to the
  service that receives the webhook — binds its declarations to `paymentGateHandlers` (`webhook`,
  `resync`, `resyncSubscriptions`) with `bind(own.webhook, paymentGateHandlers.webhook)` from
  `@owlmeans/server-entrypoint` / `@owlmeans/server-app`, and never registers `paymentGate` or
  `paymentGateEntrypoints`. A handler reads its context from the entrypoint it is bound to, so the
  application's declaration is the one mounted and run. Its declarations keep the library's paths
  (`webhookOf(ctx).webhookUrlOf(paygate)` forms the paygate's URL from `paymentGate`'s), contracts (`PaygateParams`,
  `ResyncResult`, `ResyncSubscriptionsResult` — `bind` refuses another shape at compile time) and
  guards. Two ways to get it wrong: `bindAll(declarations, [paymentGateHandlers.webhook])` pairs by
  object identity and leaves the application's declaration without a handler, and
  `handlers().params(own.webhook, paymentGateHandlers.webhook)` answers every request with
  `HandlerMisconfiguredError` (a handler bound to another protocol).
- `consumerRightsEntrypoints(protocols, { resolveEntity?, subjectOf?, guardMoney?, throttle?,
  metaOf?, publicMinMs?, planNameOf?, serviceAlias? })` binds `makeConsumerRightsProtocols`' tree.
  **Every hook gets the request's context as its LAST argument** — `resolveEntity(req, ctx)`,
  `subjectOf(req, ctx)`, `guardMoney(req, action, ctx)`, `throttle(req, key, ctx)`,
  `metaOf(req, ctx)`, `planNameOf(planSku, language, req, ctx)` — so an application reaches its
  services (a throttle store) through it and keeps no module state. Account routes act for
  `resolveEntity` (default `req.entity.id`, else `AuthForbidden`); consent, start, withdraw and
  cancel pass `guardMoney` first (refuse API keys there). **A tree with a `public` subtree needs
  `throttle` — a wiring error otherwise.** Public declarations are throttled with `{action, email,
  ip}`, a filled `honeypot` gets a decoy receipt and nothing is recorded, and every answer takes at
  least `publicMinMs` (1000 ms) so a match is not visible in the timing either.
- `checkoutReadEntrypoints(protocols, { resolveEntity?, gatewayAlias? })` binds
  `makeCheckoutReadProtocols`: `amountPolicy` and `planPrices`; its `resolveEntity(req, ctx)` too.
- **`originHelper.requestOriginOf(req)`** is the evidence of every consumer act (the default `metaOf`): `ip` =
  `cf-connecting-ip` → the LAST `x-forwarded-for` entry → `x-real-ip` → the socket; the raw
  `x-forwarded-for`, `user-agent` (≤ 512), `cf-ipcountry`, `accept-language`.

## The paygate bootstrap

`paygateBootstrapOf(ctx).bootstrap({ force? })` runs in `initialize()` of a managed gateway with
`bootstrap` (default), after the context is ready, and on a forced run from any managed process. For
every registered paygate, each step on its own (one failing is logged and does not block the others),
each capability the paygate lacks skipped: the products and prices (`productSyncOf(ctx).syncProducts`),
the portal configuration (`portal.ensureConfiguration(deploymentOf(paygate))`), the webhook endpoint
(`webhook.ensureEndpoint(deploymentOf(paygate))` — only for an https public host; a local one is
logged `payment.webhook.unmanaged` and skipped). A deployment's identity is its webhook URL; its rows
carry the `owner`. `resync` forgets every fingerprint first. What a paygate does in each step
(endpoints, signing secrets, configurations shared by deployments of one account) is its provider's.

## Event dispatch

| Paygate event | Persisted | Observer · event key |
|---|---|---|
| `customer` `upserted` / `deleted` | customer upsert (`country` upper, `currency` lower) / `deletedAt` | — |
| `checkout` `completed`, a one-time payment the session fulfils | lock + purchase + confirmation mail, fulfillment (+ evidence; quantity units from `checkout.units`), `fulfilledAt` after observers | `onTopUp` · session id; plugins `settled('paid')` |
| same, `subscription` mode, paid or not required | subscription applied if no event did (purchase in its first commit), purchase refined, lock, subscription evidence, confirmation mail | plugins `settled('paid')` |
| `checkout` `failed` | fulfillment `failedAt` | `onPaymentFailed {kind:'checkout'}` · `payment-failed:<session>:0`; `settled('failed')` |
| `checkout` `expired` | unfulfilled fulfillment purged | plugins `settled('expired')` |
| `subscription` | applied (+ `currency`); `deleted` as Canceled + `endedAt`; `trialEnding` | `onSubscription` · classified (`canceled`, `trial-ending`) |
| `invoice` `paid`, a renewal | re-read and applied as a renewal | `renewed` |
| `invoice` `paid`, otherwise / `voided` | `latestInvoiceId` (a voided one re-reads the subscription's) | — |
| `invoice` `payment-failed` / `action-required` | re-read and applied | classified, then `onPaymentFailed {kind:'invoice'}` · `payment-failed:<invoice>:<attempt>` |
| `invoice` `uncollectible` | re-read and applied | classified |
| `refund`, succeeded | fulfillment `refundedMinor`/`refundedAt`; purchase `refundedMinor`, `refundedAt` on a whole refund | `onRefund` · `refund:<refund>` (`metadata`, `withdrawalId`) |
| `dispute` | target `disputedAt`, `disputeStatus` | `onDispute {phase}` · `dispute:<dispute>:<phase>` |

A refund or dispute resolves to its target by payment (fulfillment), by charge, by invoice (the
subscription whose latest invoice it is, else the invoice's subscription — `payments.charge`,
`payments.invoice`); a subscription refund touches the purchase only when it is of the purchase's own
(first) invoice. Work on one paygate customer is serialized in-process (`customerLockHelper`, key
`<paygate>:<customer>`).

## Observer API and idempotency keys

| Callback | Payload | Key | A throw |
|---|---|---|---|
| `onTopUp` | `TopUpCompletion` | session id | the paygate redelivers |
| `onSubscription` | `SubscriptionEvent` | `subscription:<id>:<change>:…` | the paygate redelivers |
| `onRefund` | `RefundEvent` (+ `metadata`, `withdrawalId`) | `refund:<refund>` | the paygate redelivers |
| `onDispute` | `DisputeEvent` | `dispute:<dispute>:<phase>` | the paygate redelivers |
| `onPaymentFailed` | `PaymentFailedEvent` | `payment-failed:<session\|invoice>:<attempt>` | the paygate redelivers |
| `onConsent` | `ConsentEvent` (`kind`, `consentId`, `purchaseIds`, `planSku`) | `consent:<id>` | recorded; `reconcile` retries |
| `onWithdrawal` | `WithdrawalEvent` (`status`, `purchase: PurchaseRef`, `refund`, `units`, `subscriptionCanceled`) | `withdrawal:<id>` | recorded; `reconcile` retries |
| `onCancellation` | `CancellationEvent` (`matched`, `kind`, `status`, `effectiveAt`) | `cancellation:<id>` | recorded; `reconcile` retries |
| `onEntitlementGrant` | `EntitlementGrantEvent` (`grant`, `change`) | `grant:<id>:<granted\|revoked>` | logged; the grant stands |

Every callback must be idempotent by its key. A proportional claw-back of an ordinary top-up
refund uses `netAmountMinor * refundedTotalMinor / paidMinor`.

## Testing

Unit specs run a real server context — real catalogue, services and gates — over in-memory
resources with a fake paygate (`@owlmeans/test-payment`: `makeFakeContext`, `makeFakePaygate`; the
`test-payment` skill), so "no paygate call" and "the host asked the paygate for exactly this session"
are assertions. `paygates.spec.ts` covers the registry, `forSale` and the boot checks;
`webhook.spec.ts` the route and the dispatch; `capabilities.spec.ts` the checkout input and every
absent capability; `gate-handlers.spec.ts` binds `paymentGateHandlers` onto a re-declared, pinned
gate. A provider's SDK behaviour, its golden records and the Mongo-gated integration specs (admission
under concurrency, the collection validators, the concurrent first lock) live in the provider's
package.

## Related

- [[entitlements]] — the model across packages
- [[payment]] — the contracts: grammars, views, consumer-rights calculators, copy, refusals, factories
- [[web-payment]] — hooks and pieces, the consumer-rights dialogs and functions
- [[test-payment]] — the harness: in-memory context, fake paygate
- [[mailer]] — the mail transport the consumer-rights mails go through
- [[mongo-resource]] — raw collection access, duplicate-key detection, field locking

## Parts

| Part | Load it when |
|---|---|
| [reference](parts/reference.md) | implementing or changing consumer rights — the policy, records, service methods, withdrawal, cancellation, mails or handler options |
