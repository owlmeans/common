---
name: server-payment
description: Public in-process Stripe gateway for OwlMeans backends — amount and quantity checkout, subscriptions, the checkout plugin seam (per-entity narrowing, admission, holds), protocol-bound webhook routes, product sync with per-currency prices, fulfillment observers, entitlement gates, and the EU consumer-rights service (country lock, purchases and withdrawal windows, spend consent, subscription start requests, the withdrawal and cancellation functions with automatic refunds and credit notes, durable-medium mails, reconcile). Use when wiring @owlmeans/server-payment or changing Stripe payment behavior.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-payment

**Install:** `bun add @owlmeans/server-payment@^0.1.18-rc.21`

Public MIT package. It embeds Stripe into an application backend and owns everything between
Stripe and an entity's entitlements: the subscription store, one-time fulfillments, the usage
ledger of counted limits, plan resolution, the two gate services, Stripe's own configuration
(products, prices, the portal, the webhook endpoint) and the EU consumer-rights records and
functions. The application owns its catalogue, what a purchase is worth to it (credits,
provisioning), its usage meter and its side effects. Contracts — plans, limits, promos, the
entitlement view, the consumer-rights views, calculators, copy and refusals — are
`@owlmeans/payment`; the model across packages is the `entitlements` skill. Field lists, the
service contract and the step-by-step algorithms are in `reference.md` in this skill folder.

## Wiring

```typescript
stripeSecrets(cfg, { api: '/secrets/stripe-key' })     // webhook secret: optional override
portalBranding(cfg, { returnUrl: 'https://app.example.com/billing', headline: 'Example' })
declarePaymentPricing(cfg, {                           // absent entirely: today's fixed behaviour, unchanged
  tax: { automatic: true, behavior: TaxBehavior.Exclusive, collectTaxId: true, estimate: true },
  currency: { adaptive: true, estimate: true },
  stripe: { settlementCurrency: 'eur', subscriptionPaymentMethodTypes: ['card', 'link'] },
})
declareConsumerRights(cfg, {                           // absent: no consumer-rights behaviour at all
  textVersion: 'terms-2026-09', links: { en: { billingTerms, withdrawalInformation, withdrawalFunction, cancellation } },
  currencies: { eu: 'eur', other: 'usd' },
  mechanisms: { countryLock: true, checkoutTerms: true, performanceConsent: true, subscriptionStart: true,
    withdrawal: true, automaticRefunds: true, cancellation: true, purchaseConfirmation: true },
  trader: { name: 'Example', legalName: 'Example Ltd', address: '…', email: 'support@example.com' },
  mail: { from: 'billing@example.com', bcc: ['archive@example.com'] },   // alias: default MAILER_SERVICE
})
declarePaymentProduct(cfg, { sku: 'app-plans', type: ProductType.Service, services: ['app'], name: 'Plans' })
declarePaymentPlan(cfg, { productSku: 'app-plans', sku: 'free', rank: 0, free: true, price: 0, … })
declarePaymentPlan(cfg, { productSku: 'app-plans', sku: 'pro-monthly', rank: 10, price: 20,
  recurring: { interval: 'month' }, currencyPrices: { usd: 20 },
  withdrawal: { components: [{ key: 'services', basis: 'time', shareMinor: 1000 },
    { key: 'credits', basis: 'units', shareMinor: 1000 }] }, capabilities: […] })

appendPaymentGatewayService(context)                     // the process that talks to Stripe
appendPaymentGatewayService(context, { manage: false })  // a worker that only reads entitlements and asserts consent
appendConsumerRights(context, { manage, usage: myUsageMeter })   // before or after the gateway; idempotent
consumerRights(context).useMailRenderer(myRenderer)      // lazy service: works while wiring
gateway(context).use(myCheckoutPlugin)                   // a tier / cap / hold plugin — once the context is initialized
export const serverBindings = [
  ...paymentGateEntrypoints,
  ...consumerRightsEntrypoints(consumerProtocols, { guardMoney, throttle, subjectOf, planNameOf }),
  ...checkoutReadEntrypoints(checkoutProtocols),
]
observer(context).onSubscription(async event => { /* keyed by event.eventKey */ })
```

- `appendPaymentGatewayService` registers twelve resources, the catalogue service
  (`PAYMENT_SERVICE`), the completion observer, the gateway (`GATEWAY_SERVICE`), the capability
  gate (`ENTITLEMENT_GATE`), the limit gate (`LIMIT_GATE`), the entitlement service
  (`ENTITLEMENT_SERVICE`) and the consumer-rights service (`CONSUMER_RIGHTS_SERVICE`), each only
  when not registered already. `appendConsumerRights` does the consumer-rights part alone.
- **Registration order is free.** Whichever of `appendConsumerRights` and the gateway comes first,
  `usage` and `stripe` are installed on the one service, and `manage` resolves as the application's
  explicit value, else the gateway's, else managed. The consumer-rights resources keep the aliases
  of the first registration.
- **The consumer-rights service is lazy** (like the completion observer): `consumerRights(ctx)`,
  `useMeter` and `useMailRenderer` work while the application is wired; the gateway's initialization
  initializes it, so its boot checks still run at boot. The gateway is NOT lazy: `gateway(ctx)` (and
  `.use(plugin)`) needs the initialized context.
- **`manage: false`** registers the same surface with no Stripe client: no bootstrap at init, and
  `createLink`, `portalLink`, `resyncSubscription`, `resyncAll`, the webhook route, `withdraw` and
  `cancel` throw `PaygateError('unmanaged')`. `grantInternalPlan`, the entitlement service,
  `amountPolicy`, `planPrices` and the consumer-rights reads, `recordConsent`,
  `recordStartRequest` and `assertConsent` work, because they are Mongo only.
- Every process that registers the gateway runs the collection validators (`collMod`) of all
  twelve records at init: a process of an older version narrows the validators again, so roll
  the processes of one deployment out together.
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
- **`currencyPrices`** (`{ usd: 20 }`, major units, lowercase codes) are exact prices in further
  currencies, synced as the reusable Price's `currency_options`; a declared price in the Price's
  default currency replaces its converted amount. Only for recurring and quantity plans.
- **`withdrawal.components`** state the separately priced parts of a subscription for a withdrawal
  (CJEU C-641/19): `{ key, basis: 'time' | 'units', shareMinor }`, the shares summing to
  `round(price × 100)`. Absent: the whole price is one `time` component.
- `declarePaymentPlan` refuses before recording: a bad rank or a priced/gatewayed free plan
  (`PlanRankConflict`), a capability set under the reserved `limit` scope, a malformed limit
  (`LimitMisdeclared('<key>:<reason>')`), a malformed or amount-mode `currencyPrices` or components
  that do not add up (`ProductError('currency-prices:…' | 'withdrawal:<sku>:…')`).
- `assertPlanDeclarations` runs when the gateway initializes and fails the boot on two free plans
  at one rank, or two paid non-consumable plans of one product at one rank.
- A limit key may use a different kind on different plans; each kind counts separately and a
  lifetime count stays with the entity through upgrades, downgrades and cancellations.

## Records

None declares an ObjectId reference: `entityId` is an organization key and every other id is Stripe's.

| Collection | One row per | Indexes |
|---|---|---|
| `payment-paygate-customer` | Stripe customer (`country`, `currency` from its webhooks; `deletedAt`) | `{paygate, externalId}` unique · `{paygate, entityId}` · `{paygate, profileId}` |
| `payment-subscription` | subscription: `sub_…`, `free:<entityId>`, `internal:<planSku>:<entityId>` (+ `currency` and the checkout evidence) | `{paygate, externalId}` unique · `{entityId, status, rank:-1}` · `{entityId, planSku}` · `{paygate, customerId}` · `{paygate, itemId}` sparse · `{paygate, status, updatedAt}` |
| `payment-fulfillment` | one-time checkout session (+ evidence: country, e-mail, totals, terms, `purchaseId`) | `{paygate, externalId}` unique · `{paygate, paymentIntentId}` sparse · `{paygate, chargeId}` sparse · `{entityId, createdAt:-1}` |
| `payment-webhook` | managed webhook endpoint (`secret` is `secure: true`) | `{paygate, service, url}` unique |
| `payment-usage` | usage event — the ledger | `{entityId, limitKey, eventKey}` unique · `{entityId, limitKey, window}` · `{entityId, limitKey, ref}` sparse · `{entityId, createdAt:-1}` |
| `payment-usage-counter` | (entity, limit, window) projection | `{entityId, limitKey, window}` unique |
| `payment-fingerprint` | synchronized product (`<productSku>`, with `prices[]`) or portal (`portal:<service>`) | `{sku}` unique |
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
  (`conditionalSet`), so a concurrent declaration of the same purchase loses; declarations,
  consents and events are only ever created.

## Checkout

- `Amount`: one inline `price_data` item for the synchronized product, quantity 1, its
  `tax_behavior` the declared `PricingPolicy.tax.behavior`, no promotion codes. `Quantity`: the
  reusable price under the plan lookup key, adjustable quantity. Subscription: `planSku` (else the
  product's first recurring plan), quantity 1. One-time Sessions enable `invoice_creation`.
- `CreateLinkParams.locale` is a caller-validated Stripe locale (Session `locale`, the Customer's
  `preferred_locales`). `submitText` is trusted application copy — a string, or a function of
  `CheckoutTextContext {language, currency, unitAmountMinor, interval, region, country}` — on
  every mode; never caller-provided text.
- A plan the paygate does not sell is refused (`ProductError`). `checkoutOptions` puts automatic
  tax, billing address collection, tax-id collection and Adaptive Pricing on the session exactly
  as `PricingPolicy` declares them.
- **Without a consumer-rights policy every session is what it always was**: the charge currency
  is the settlement currency (FX from the catalogue), Adaptive Pricing as declared.

### Under a consumer-rights policy

- **The country.** A locked billing profile overrides `params.country`; another declared country is
  `BillingCountryLocked` (409), and so is a saved customer address that left the locked country
  (an operator relocks). An organization that already paid before its country was locked is
  locked lazily from its Stripe customer's address (`source: 'customer'`). Before any lock, the
  declared country is prefilled on a customer without an address.
- **The currency.** Charge currency = the profile's currency, else `chargeCurrencyOf(region)`
  (`policy.currencies`). An amount checkout whose policy currency IS the charge currency is
  charged exactly — no FX call; any other goes through the FX reference rate (rounded up). A
  subscription or quantity session is forced to the charge currency (`currency`) only when its
  synced Price carries it (default or option) — otherwise it is left to Stripe and warned.
  `adaptive_pricing` only when the charge currency is the settlement currency.
- **The lock at Stripe.** A locked profile whose customer carries the address:
  `customer_update.address: 'never'` and `billing_address_collection: 'auto'` (tax follows the
  saved address, Checkout cannot move it); `name: 'auto'` stays. A locked customer without an
  address keeps `'auto'`/`'required'`, or automatic tax would have no location.
- **Terms.** `mechanisms.checkoutTerms` puts `consent_collection.terms_of_service: 'required'` and
  `custom_text.terms_of_service_acceptance` (the `checkout.terms-acceptance.in-scope | other` copy
  with the billing language's links, ≤ 1200 characters) on every session.
- **A missing Dashboard terms URL never breaks a payment.** Stripe refuses the checkbox then
  (`invalid_request_error`, param `consent_collection[terms_of_service]`, "You cannot collect consent
  to your terms of service unless a URL is set in the Stripe Dashboard", matched by
  `isMissingTermsUrl`): the session is created ONCE more without `consent_collection` and without the
  terms text, under the same plugin admissions, metadata `termsCollected: 'false'`; a
  `checkout-terms-fallback` event (`recordKind: 'checkout'`, `recordId` = the entity, `externalId`
  = the session, `ok: false`, the Stripe message in `detail`) is appended per fallback and one
  `console.warn` per context tells the operator what to set. Any other refusal is not retried; a
  failing retry releases the admissions and propagates its own error.
- **Texts.** An in-scope top-up without `submitText` says what it buys (`checkout.top-up`, with the
  country's name); a subscription without `submitText` shows the renewal price in the charge
  currency (`checkout.renewal.<interval>`), and `after_submit` links the cancellation page while
  that mechanism is on. Every text is asserted ≤ 1200 characters.
- **Start requests.** A subscription needs a fresh start request bound to the organization, the
  plan and the current text version (`assertStartRequest` → `SubscriptionStartRequired`, 428),
  unless the organization is already locked outside the territories — a country picked before
  checkout may differ from the address typed at Stripe.
- **Metadata** (session and `subscription_data`): `region`, `country`, `language`, `termsVersion`,
  `copyVersion`, `termsCollected` (`'true'` when the checkbox is on the session, `'false'` when the
  policy has it off or after the fallback), `ipCountry` (the `cf-ipcountry` the app passes),
  `startRequestId`, `profileId`. The purchase's `termsAccepted` comes only from the completed
  session's `consent.terms_of_service` — absent when nothing was collected.

## Checkout plugins

`gateway(ctx).use(plugin)` seats a `CheckoutPlugin` per gateway instance (the `ExecutionService.use`
registry: a plugin whose `alias` is registered already replaces it). All hooks are optional:

| Hook | Called | Contract |
|---|---|---|
| `narrow(ctx, {entityId, productSku, planSku?, base, at})` | every amount checkout and every `gateway.amountPolicy` | answers an `AmountNarrowing` or `null`; a throw fails the checkout closed |
| `admit(ctx, CheckoutAttempt)` | before the session, every mode | throw (`CheckoutLimitExceeded`) to veto; may return `{ reservationId }` |
| `created(ctx, CheckoutCreated)` | after the session | gets `sessionId`, `url`, `expiresAt`, amounts, its own `reservationId`; a throw expires the session, releases every hold and propagates |
| `settled(ctx, CheckoutSettled)` | webhook: `paid`, `expired`, `failed`; and `failed` for a checkout that never became usable | errors are logged, never raised |
| `sessionTtlSeconds` | — | the smallest declared, clamped to 30 min – 24 h, becomes `expires_at`; none declared: Stripe's default |

- **One narrowing path.** `createLink` and `gateway.amountPolicy(ctx, entityId, productSku,
  planSku?)` both call `narrowAmountFor` → `narrowAmountPolicy` (`@owlmeans/payment`); an amount
  above the narrowed maximum, or any amount while `blocked`, is `CheckoutLimitExceeded` (409). A
  control and a refusal cannot disagree. An amount above the plan's own maximum stays the base
  policy's error.
- A veto, a Stripe refusal or a throwing `created` releases what the earlier plugins admitted
  (`settled` with `outcome: 'failed'` and their `reservationId`).
- `gateway.planPrices(ctx, productSku)` answers `PlanPriceView[]` (a default entry per Price plus
  one per currency option) from the synced fingerprint rows — no Stripe call.

## Price sync and the tax estimate

- `syncStripeProducts` gives a matching, still-`unspecified` price the declared `tax.behavior` IN
  PLACE and a fresh one on creation; a price carrying the OPPOSITE behavior is replaced. Before an
  in-place update it checks the account's tax-settings default and skips — logging why — when that
  would change existing renewals, unless `stripe.migrateUnspecifiedPrices` opts in.
- A recurring or quantity plan whose catalogue currency differs from `stripe.settlementCurrency` is
  converted with an unlocked FX Quote (`reference_rate`, rounded up). Its **currency options**:
  the declared `currencyPrices`, plus the catalogue currency (exact `round(price × 100)`) when it is
  one of the policy's region currencies; each option carries the declared `tax_behavior`. Active
  prices are listed with `expand: ['data.currency_options']`; a changed option replaces the Price
  (deactivate + create with `transfer_lookup_key`) — options are never edited in place, so a
  subscriber keeps the Price they accepted.
- The resolved amounts, currencies and options are fingerprinted; an unchanged fingerprint makes no
  product/price call. Each sync stores the product's `prices[]` (`SyncedPrice`: price id, lookup
  key, default currency and amount, options, tax behavior, interval, source amount) on the
  fingerprint row — what `planPrices`, checkout currency forcing and the estimate read. A row from
  before `prices[]` existed syncs once more.
- `estimatePrice` (`plugins/estimate.ts`) is a Stripe Tax calculation for one product/plan's
  reference amount at a country — **$0.05 per distinct** (currency, country, amount, tax code,
  behavior, matching tax ids) combination, cached per gateway-service instance for 24h; failures
  are never cached. **A locked profile overrides the requested country** (`source: 'profile'`,
  `locked: true`); the estimate carries `region`. Under a policy with region currencies a
  recurring plan is estimated in the charge currency at its synced unit amount (default or
  option); the `local` line (FX Quotes, a PREVIEW endpoint) only when that currency is the
  settlement currency.

## The subscription store

- **The effective plan** is the highest-ranked row in `ENTITLING_STATUSES` (catalogue rank; the
  newest on a tie), else the declared free plan, else `PlanRequired`.
- `mapStatus`: `active`→Active, `trialing`→Trial, `past_due`→PastDue, `unpaid`/`paused`→Suspended,
  `incomplete`→Created, `incomplete_expired`→Ended, `canceled`→Canceled; paused collection is
  Suspended with `pausedAt`.
- **State is written before observers, and classified against what observers were last told**
  (`propagated`, stamped with `lastEventId` only after every observer succeeded).
  `CommitOptions.beforePropagate(record, change)` runs between the write and the observers — the
  Stripe path writes a subscription's purchase there on `created`, so the window exists before an
  observer grants the bundle.
- Classification, first match: `created` · `canceled` · `paused` · `resumed` · `upgraded` /
  `downgraded` · `cancel-scheduled` · `cancel-undone` · `renewed` (once per invoice) · `past-due` ·
  `suspended` · `trial-ending`.
- A repeated delivery (`lastEventId`) is ignored; an older payload than the stored state is not
  applied. `grantInternalPlan(ctx, entityId, planSku, { force?, periodEnd? })` upserts an internal
  row; `resyncSubscription` / `resyncAll` re-read and apply as a webhook would.

## The usage ledger

`payment-usage` events are the source of truth; `payment-usage-counter` is the projection that
admission reads. `consume` increments the counter FIRST by one conditional upsert (`used <= limit
- amount`), then appends the event — **the counter may over-count, never over-admit**. An event
key is idempotent; `release` appends `release:<eventKey>` first. `reconcileCounters`,
`reconcileOccupancy`, `reconcileEntity` and `reconcileAll` repair it (details: the `entitlements`
skill).

## Entitlements and gates

- `entitlements(ctx)` → `effectivePlan`, `entitlements` (the `EntitlementView`), `hasCapability`,
  `limitState`, the ledger operations. Never calls Stripe.
- **Capability gate** (`ENTITLEMENT_GATE`) passes when the view grants ANY parameter; **limit gate**
  (`LIMIT_GATE`) when any `limit:<key>[>=n]` has room — it never consumes. Both refuse with
  `AuthForbidden` refusals (403) and fail closed on an unreadable store.
- The consumer-rights refusals (428/409) and `CheckoutLimitExceeded` are not entitlement refusals.

## Consumer rights

The EU right of withdrawal (with the Art. 11a withdrawal function), spend consent for prepaid
credits, subscription start requests, the cancellation function and a billing country fixed at the
first purchase. The service is `consumerRights(ctx)` (`consumerRightsOf(ctx)` is null-safe); its
full contract is in `reference.md`.

- **A purchase** is a paid one-time checkout, or a subscription's FIRST invoice — renewals,
  internal grants and manual credits never are. Its row (`purchaseId` `stripe:<cs_…>` /
  `stripe:<sub_…>`, `contractRef` `CR-YYMMDD-XXXXXX` over an unambiguous alphabet, retried on a
  collision) is written **before anything is granted**: in `checkout.session.completed` before
  `onTopUp`, in the first subscription commit before the `created` observers. A completed
  subscription checkout then refines it with the buyer's own country, e-mail, totals and terms
  acceptance. Window = in scope, before `deadline` (`withdrawalDeadlineOf`, policy margin),
  neither withdrawn nor refunded; a full refund closes it (`refundedAt`).
- **In scope** when the buyer's own country or the organization's locked country is in the policy's
  territories; an unknown country is protected by default. A business tax id does not exempt.
- **The lock**: the first completed purchase's `customer_details.address.country` (else the
  declared one) locks the profile — first write wins through the unique index; a later different
  country is a `lock-mismatch` event, never a relock. The request's `cf-ipcountry` is stored as
  `ipCountry` beside it, and the `lock` event flags `ipMismatch`. The profile's currency is an
  entitling Stripe subscription's currency when one exists (two subscriptions of one customer can
  not differ), else the region's. Only `lock(entityId, country, 'manual', { force: true, by,
  reason })` replaces a lock, audited as `relock`.
- **Unlock** (an operator, Mongo only — unmanaged works): `unlock(entityId, { by, reason })` deletes
  the profile (only while it still holds the country read) and appends an `unlock` event carrying the
  whole row; it answers the profile as it was, or `null`. After an unlock no lock is taken from the
  paygate customer's saved address — neither at checkout nor by `reconcile` — so the next COMPLETED
  purchase locks the country again from its own address.
- **Performance consent** (top-ups only — a start request covers a subscription's own invoice):
  required while an open in-scope top-up window has none. `assertConsent` is one indexed query and
  throws `PerformanceConsentRequired` (428, `pending`, latest `deadline`); an application calls it
  only where credits will actually be spent. `recordConsent` renders the statement itself
  (`consentStatementOf` with the trader's `name`), refuses a stale `textVersion` with a fresh 428,
  covers only the open windows the body lists, stamps `consentedAt` conditionally, mails the
  confirmation, then tells `onConsent`.
- **Start requests**: `recordStartRequest(subject, body, origin, { plan })` records the statement
  with the plan's short name the application passes (default: its localized title), usable
  `startRequestTtlSeconds` (3600); the purchase takes it as `servicesStartedAt`/`consentedAt`.
- **Withdrawal** (`withdraw(subject | null, body, origin)`, managed only): in-app by `purchaseId`,
  public by contract reference or invoice number plus an e-mail of the purchase, its profile or
  its paygate customer. The declaration and the conditional `withdrawnAt` are written BEFORE
  Stripe; the receipt is mailed at once; then the paygate steps under
  `withdrawal:<id>:<step>` keys; then `onWithdrawal`. The refund comes from the application's
  `UsageMeter` through the `@owlmeans/payment` calculators (deduction `usedAfter + settled +
  clawed`); no meter, or `automaticRefunds` off, is `review` (no paygate call). A late
  declaration is `expired` — recorded and acknowledged, nothing executed. A repeated one answers
  the original receipt. The public answer is always the bare `DeclarationReceipt`.
- **Cancellation** (`cancel(subject | null, body, origin)`): in-app the organization's entitling
  Stripe subscription; public a contract reference plus e-mail, else the one organization whose
  paygate customer has that e-mail. Ordinary → `cancel_at_period_end`, or `cancel_at` a later
  boundary (`cancellationEffectiveAt`, no proration); already scheduled → `already-scheduled`;
  **extraordinary → `review`, the paygate untouched** (an operator decides, the receipt says so).
- **Observers `onConsent` / `onWithdrawal` / `onCancellation` run AFTER the records and the paygate
  steps; a throw is recorded (`observers` event) and retried by `reconcile()` — unlike the paygate
  callbacks, whose throw makes Stripe redeliver.** A `WithdrawalEvent` with `status: 'refunded'`
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
`.test`/`.example`/`.invalid`/`.localhost` and every subdomain of them (`isReservedAddress`; case, a
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

`consumerRights(ctx).reconcile({ since?, limit? })` — the application's nightly job: retries the
paygate steps of withdrawals (refund, credit note, subscription cancel) and scheduled
cancellations, failed mails and failed observers; backfills purchases (records only, no mail) from
completed sessions of the last 16 days without a row; locks organizations that paid before the
lock from their paygate customer (never one an operator unlocked). A retry uses a fresh idempotency key (`…:<attempt>`; Stripe
replays a stored failure for a day) and first adopts a refund or credit note an earlier attempt
made (found by `metadata.withdrawalId`). Five failures of a step leave it to an operator. At most
`limit` (50) items per step.

## Protocols, handlers and security

- `paymentGate` (bound by `paymentGateEntrypoints`): `webhook` is public because Stripe signs the
  untouched raw body — never put an application guard on it; `resync` and `resyncSubscriptions`
  carry `GUARD_ED25519`.
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
- **`requestOriginOf(req)`** is the evidence of every consumer act (the default `metaOf`): `ip` =
  `cf-connecting-ip` → the LAST `x-forwarded-for` entry → `x-real-ip` → the socket; the raw
  `x-forwarded-for`, `user-agent` (≤ 512), `cf-ipcountry`, `accept-language`.

## Stripe self-management

Runs in `initialize()` of a managed gateway, after the context is ready; each step independent:
products and prices (above), the portal configuration, the webhook endpoint.

- **The portal configuration**: customer update (email, address, tax id — **without address under
  `mechanisms.countryLock`**), invoice history, payment method update, cancellation at period end
  without proration, price switching between the active recurring prices. Its fingerprint covers
  the catalogue (incl. `currencyPrices`), the lock flag, the region currencies, the branding and
  the deployment key. Each deployment owns its own configuration, tagged `{ owlmeans: 'payment',
  service, deployment: webhookUrlOf(ctx) }`; one tagged for another deployment is never touched.
- `portalLink(ctx, entityId, { flow, planSku?, returnUrl })`: a customer is required
  (`PortalUnavailable`, 409); `Cancel`/`Update`/`Change` need an entitling Stripe subscription.
- **The webhook endpoint** at `webhookUrlOf(ctx)`, subscribed to `WEBHOOK_EVENTS`, on the API version
  read back from the client; only an https public host. A deployment deletes only the endpoints its
  own rows name. The secret (create-only) is stored field-encrypted where the database has a key.
- **Do not bump the Stripe SDK** (17.x, API `2025-02-24.acacia`): `current_period_*`,
  `invoice.subscription`, `invoice.payment_intent`, `charge.invoice` are top-level there and move
  later; credit notes link a refund by `refund`; `presentment_details` is untyped. Read them through
  narrow accessors.
- **Dashboard prerequisites** (test and live): a terms-of-service URL in Settings → Public details
  before `checkoutTerms` is on (without it every checkout falls back to no checkbox — payments go on,
  but the acceptance is not collected: watch for `checkout-terms-fallback` events); Checkout's return/refund
  policy off or pointing at the Billing Terms, never "no refunds"; business name, address and
  support e-mail in Public details; the "successful payments" and "refunds" customer e-mails.

## Event dispatch

| Event | Persisted | Observer · event key |
|---|---|---|
| `customer.created` / `.updated` | customer upsert (`country`, `currency`) | — |
| `customer.deleted` | customer `deletedAt` | — |
| `checkout.session.completed` / `.async_payment_succeeded`, `payment` mode, paid | lock + purchase + confirmation mail, fulfillment (+ evidence), `fulfilledAt` after observers | `onTopUp` · session id; plugins `settled('paid')` |
| same, `subscription` mode | subscription applied if no webhook did (purchase in its first commit), purchase refined, lock, subscription evidence, confirmation mail | plugins `settled('paid')` |
| `checkout.session.async_payment_failed` | fulfillment `failedAt` | `onPaymentFailed {kind:'checkout'}` · `payment-failed:<session>:0`; `settled('failed')` |
| `checkout.session.expired` | unfulfilled fulfillment purged | plugins `settled('expired')` |
| `customer.subscription.created` / `.updated` / `.pending_update_*` / `.paused` / `.resumed` | subscription applied (+ `currency`) | `onSubscription` · classified |
| `customer.subscription.deleted` | applied as Canceled + `endedAt` | `canceled` |
| `customer.subscription.trial_will_end` | applied | `trial-ending` |
| `invoice.paid` | cycle invoice ⇒ re-read, applied as a renewal; otherwise `latestInvoiceId` | `renewed` |
| `invoice.payment_failed` / `.payment_action_required` | re-read and applied | classified, then `onPaymentFailed {kind:'invoice'}` · `payment-failed:<invoice>:<attempt>` |
| `invoice.upcoming` | nothing | — |
| `invoice.marked_uncollectible` / `invoice.voided` | re-read and applied / `latestInvoiceId` | classified / — |
| `charge.refunded`, `refund.created` / `.updated` (succeeded) | fulfillment `refundedMinor`/`refundedAt`; purchase `refundedMinor`, `refundedAt` on a whole refund | `onRefund` · `refund:<refund>` (`metadata`, `withdrawalId`) |
| `refund.failed` | — | — |
| `charge.dispute.*` | target `disputedAt`, `disputeStatus` | `onDispute {phase}` · `dispute:<dispute>:<phase>` |

A refund or dispute resolves to its target by payment intent (fulfillment), by charge, by invoice
(the subscription whose latest invoice it is, else the invoice's subscription); a subscription
refund touches the purchase only when it is of the purchase's own (first) invoice.

## Observer API and idempotency keys

| Callback | Payload | Key | A throw |
|---|---|---|---|
| `onTopUp` | `TopUpCompletion` | session id | Stripe redelivers |
| `onSubscription` | `SubscriptionEvent` | `subscription:<id>:<change>:…` | Stripe redelivers |
| `onRefund` | `RefundEvent` (+ `metadata`, `withdrawalId`) | `refund:<refund>` | Stripe redelivers |
| `onDispute` | `DisputeEvent` | `dispute:<dispute>:<phase>` | Stripe redelivers |
| `onPaymentFailed` | `PaymentFailedEvent` | `payment-failed:<session\|invoice>:<attempt>` | Stripe redelivers |
| `onConsent` | `ConsentEvent` (`kind`, `consentId`, `purchaseIds`, `planSku`) | `consent:<id>` | recorded; `reconcile` retries |
| `onWithdrawal` | `WithdrawalEvent` (`status`, `purchase: PurchaseRef`, `refund`, `units`, `subscriptionCanceled`) | `withdrawal:<id>` | recorded; `reconcile` retries |
| `onCancellation` | `CancellationEvent` (`matched`, `kind`, `status`, `effectiveAt`) | `cancellation:<id>` | recorded; `reconcile` retries |

Every callback must be idempotent by its key. A proportional claw-back of an ordinary top-up
refund uses `netAmountMinor * refundedTotalMinor / paidMinor`.

## Testing

Unit specs run a real server context — real catalogue, services and gates — over in-memory
resources (unique and sparse-unique indexes, raw conditional updates) and a fake Stripe that records
every SDK call and its request options (idempotency keys) and can fail a method's next calls
(`state.failures`: a message, a real SDK error such as `new Stripe.errors.StripeInvalidRequestError(…)`,
or a list of them, one per call), so "no Stripe call" is an assertion. `makeFakeContext` wires the
consumer-rights call before the gateway by default (`gatewayFirst`, `rights`, `gatewayManage` and a
pre-init `wire` hook test the other orders). The consumer-rights service there is
managed through the fake (`appendConsumerRights({ manage: true, stripe })`) with a console mailer
(`fake.mails`). The Mongo-gated specs prove admission under concurrency, the collection validators
of every record, the unique indexes, the concurrent first lock and the single winner of
concurrent withdrawals.

## External docs

- https://docs.stripe.com/api/checkout/sessions/create — inline `price_data`; `consent_collection.terms_of_service` needs a terms URL in the Dashboard (else `invalid_request_error` on param `consent_collection[terms_of_service]`); `custom_text.{submit, after_submit, terms_of_service_acceptance}` ≤ 1200 characters each; `currency` forces a Price's currency option; `expires_at` 30 min – 24 h.
- https://docs.stripe.com/payments/checkout/localize-prices/manual-currency-prices — `currency_options` on a Price, one reusable Price for several currencies; manual options override Adaptive Pricing for that currency.
- https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing — Adaptive Pricing requires the price currency to be a settlement currency; webhook amounts stay in the integration currency.
- https://docs.stripe.com/invoicing/multi-currency-customers — a customer's subscriptions share one currency; one-time payments may differ.
- https://docs.stripe.com/invoicing/integration/programmatic-credit-notes — preview a credit note on an invoice line; link an existing refund with `refund`; custom lines are not allowed with automatic tax.
- https://docs.stripe.com/tax/reports — a refund or a credit note lowers reported tax; only the credit note is the corrective document of an issued invoice.
- https://docs.stripe.com/api/refunds/create — `payment_intent`, `amount`, `reason: requested_by_customer`, `metadata`; an idempotency key replays the stored answer (failures too) for 24 h.
- https://docs.stripe.com/api/subscriptions/cancel and /update — `cancel(prorate, invoice_now, cancellation_details)`; `update(cancel_at_period_end | cancel_at, proration_behavior)`.
- https://docs.stripe.com/payments/checkout/receipts — one-time Checkout needs `invoice_creation.enabled` for a post-payment invoice; a Customer's `preferred_locales` localizes Stripe mails.
- https://docs.stripe.com/checkout/fulfillment — fulfillment must be idempotent and support delayed-payment success events.
- https://docs.stripe.com/api/webhook_endpoints/create — the signing `secret` is returned only by create; `api_version` is create-only.
- https://docs.stripe.com/api/customer_portal/configurations/create — `features.customer_update.allowed_updates`, subscription cancel/update features; configurations are never deletable.
- https://docs.stripe.com/api/tax/calculations/create — `percentage_decimal` is a STRING; parse it exactly.
- https://docs.stripe.com/api/fx_quotes/create — a PREVIEW endpoint (`stripe.rawRequest`); `reference_rate` for settlement conversion.

## Related

- [[entitlements]] — the model across packages
- [[payment]] — the contracts: grammars, views, consumer-rights calculators, copy, refusals, factories
- [[web-payment]] — hooks and pieces, the consumer-rights dialogs and functions
- [[mailer]] — the mail transport the consumer-rights mails go through
- [[mongo-resource]] — raw collection access, duplicate-key detection, field locking
