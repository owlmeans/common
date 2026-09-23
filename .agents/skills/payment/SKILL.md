---
name: payment
description: "How to use @owlmeans/payment — provider-agnostic payment contracts, immutable payment protocols, amount/quantity checkout policies, per-entity checkout narrowing and pricing, catalogue records, entitlement gates, and the EU consumer-rights contracts (billing regions, the policy record, withdrawal/cancellation views, refund calculators, 428/409 refusals, the legal copy, protocol factories). Auto-invoked when importing payment types or errors, declaring paid routes, creating checkout, or touching consent, withdrawal or cancellation."
user-invocable: false
---

# @owlmeans/payment

**Layer:** Core
**Install:** `"@owlmeans/payment": "^0.1.18-rc.38"` in `dependencies`

The contracts half of payments: the catalogue (products, plans, localizations), amount- and
quantity-priced checkout, the entitlement model — plan capabilities, counted limits, promos,
and the entitlement view the server gate and the browser both read — and the EU consumer-rights
contracts (billing regions, the policy record, withdrawal and cancellation views, the refund
calculators, the refusals, the legal copy, the protocol factories). It talks to no paygate: a
server-side integration (`@owlmeans/server-payment`) implements against these, and
`@owlmeans/client-payment` adapts the catalogue service for a browser. The model as a whole —
admission, the usage ledger, the two gate services — is the `entitlements` skill.

## Key exports

| Export | Description |
|---|---|
| `makePaymentService(alias?)` · `appendPaymentService(ctx, alias?)` | The catalogue reader, registered under `DEFAULT_ALIAS` / `PAYMENT_SERVICE` (`'payment'`). |
| `PaymentService` | `product(sku)` · `products()` · `plans(productSku, duration)` · `plan(planSku)` · `allPlans(productSku)` · `localize(lng, entity)` · `shallowAuthentication(token)` · `pricingPolicy()` · `consumerRightsPolicy()` (`null` when undeclared). |
| `Product` · `ProductPlan` · `Localization` (+ schemas) | Catalogue records. `ProductPlan` carries `rank`, `free`, `gateways`, `suspendedAt`, `capabilities: PlanCapability[]`, `limits: { [key]: LimitDeclaration }`, `withdrawal.components` (§ Consumer rights). |
| `PlanCapability` · `LimitDeclaration` · `PromoDeclaration` (+ schemas) | What a plan grants: a permission set, a counted allowance, a time box on either. |
| `SubscriptionStatus` · `ENTITLING_STATUSES` · `TERMINAL_STATUSES` · `INTERNAL_PAYGATE` | Lifecycle vocabulary. `Active`/`Trial`/`PastDue` entitle; `Canceled`/`Expired`/`Ended`/`Blocked` are terminal; `Suspended` is revoked until resumed. |
| `LimitKind` · `LimitWindow` · `PortalFlow` (+ schemas) | `window`/`lifetime`/`occupancy`; `day`/`month`; `manage`/`cancel`/`update`/`change`/`payment-method`. |
| `ENTITLEMENT_GATE` · `LIMIT_GATE` · `CAPABILITY_FEATURE_SCOPE` · `CAPABILITY_LIMIT_SCOPE` | The two gate aliases and the two reserved scopes (`feature` for flags, `limit` for limit parameters). |
| `entitled` · `parseEntitlementParam` · `formatEntitlementParam` · `hasEntitlement` · `entitlementList` | The capability grammar and predicate. |
| `parseLimitParam` · `formatLimitParam` · `windowKeyOf` · `windowBoundsOf` · `LIFETIME_WINDOW` · `OCCUPANCY_WINDOW` | The limit grammar and window algebra. |
| `promoActive` · `promoViewOf` | Whether a promo is in force for one subscription at one instant. |
| `EntitlementView` · `EntitlementPlanView` · `CapabilityView` · `LimitView` · `PromoView` · `LimitUsage` (+ wire schemas) | The entitlement view and its rows. |
| `capabilityViewsOf` · `limitViewsOf` · `entitlementViewOf` · `reviveEntitlementView` · `capabilityOf` · `limitOf` · `hasLimitRoom` | Pure view builders and readers. |
| `CreateCheckoutBody` (`planSku`, `country`, `startRequestId`) · `CreateCheckoutResponse` · `PortalLinkBody` · `PortalLinkResponse` (+ schemas) | Wire shapes an application's own checkout and portal protocols use. |
| `CheckoutPricingMode` · `AmountCheckoutPolicy` / `QuantityCheckoutPolicy` (+ schemas) · `assertAmountCheckoutPolicy` · `assertQuantityCheckoutPolicy` · `assertCheckoutAmount` · `chargeAmountMinor` | Checkout pricing policies and their validation. |
| `PricingPolicy` (+ schema) · `DEFAULT_PRICING_POLICY` · `assertPricingPolicy` · `TaxBehavior` · `TaxEstimateStatus` · `TaxType` (+ schemas) | Declared tax/currency behaviour (see § Pricing policy and tax estimate). |
| `PriceEstimate` · `PriceEstimateBody` · `TaxEstimate` · `TaxRateEstimate` (+ schemas) · `estimateOf` · `ratePpmOf` | The tax/local-currency estimate read model and its pure math. |
| `COUNTRY_CURRENCIES` · `currencyOfCountry` · `COUNTRY_CODES` · `CountrySchema` | ISO 3166-1 → ISO 4217 reference map for a country picker. |
| `EntitlementRefusal` · `CapabilityRequired` · `LimitExhausted` | Entitlement refusals — all `AuthForbidden` (403). |
| `PaymentError` · `PaygateError` · `UnknownPaygate` · `PaygateMappingError` · `WebhookSetupError` · `PortalUnavailable` · `ProductError` · `UnknownProduct` · `UnknownPlan` · `PlanRequired` · `PlanRankConflict` · `LimitUnknown` · `LimitMisdeclared` · `PaymentIdentificationError` · `SubscriptionError` · `UnknownSubscription` · `ConsumerRightsError` | Faults (500), except `PortalUnavailable` (409). Importing the package registers every type's message under `errors.<type>` in eight languages (the seven of `SUPPORTED_LNGS` plus `fr`). |
| `ConsumerRightsRefusal` · `PerformanceConsentRequired` · `SubscriptionStartRequired` (428) · `BillingCountryLocked` · `WithdrawalUnavailable` · `CancellationUnavailable` · `CheckoutLimitExceeded` (409) · `consentRefusalOf` | Consumer-rights and checkout-limit refusals — declared statuses, never `AuthForbidden` (§ Consumer rights). |
| `ConsumerRegion` · `PurchaseKind` · `ConsentKind` · `DeclarationKind` · `DeclarationChannel` · `CancellationKind` · `WithdrawalStatus` · `CancellationStatus` · `WithdrawalUnavailableReason` · `CancellationUnavailableReason` (+ schemas) | Consumer-rights vocabulary. |
| `EU_COUNTRIES` · `EU_CONSUMER_TERRITORIES` · `EEA_EXTRA` · `CONSUMER_RIGHTS_TERRITORIES` · `COUNTRY_LANGUAGES` · `isEuCountry` · `isEeaCountry` · `regionOf` · `inScope` · `chargeCurrencyOf` · `billingLanguageOf` | Territories, region, scope, charge currency, legal language. |
| `ConsumerRightsPolicy` (+ `Links`, `Mechanisms`, schemas) · `DEFAULT_CONSUMER_RIGHTS` · `makeConsumerRightsPolicy` · `assertConsumerRightsPolicy` · `linksOf` · `CONSUMER_RIGHTS_RECORD_TYPE`/`_ID` | The consumer-rights policy record. |
| `BillingProfileView` · `PurchaseView`/`List` · `PerformanceConsentView`/`Body`/`Response` · `SubscriptionStartView`/`Query`/`Body`/`Response` · `WithdrawalEstimate` · `WithdrawalCandidate`/`List` · `WithdrawalBody` · `DeclarationReceipt` · `WithdrawalReceipt` · `CancellationBody` · `CancellationReceipt` · `ConsumerRightsPublicView` (+ schemas) · `revive*` | Consumer-rights wire shapes (ISO dates) and their revivers. |
| `withdrawalDeadlineOf` · `lastWithdrawalDayOf` · `withdrawalOpen` · `oneTimeWithdrawalRefund` · `subscriptionWithdrawalRefund` · `splitByShares` · `allocateFifo` · `unitsUsedAfter` · `cancellationEffectiveAt` | Pure calculators. |
| `CONSUMER_RIGHTS_RESOURCE` · `CONSUMER_RIGHTS_COPY_VERSION` · `consumerRightsCopy` · `consumerText` · `consentStatementOf` · `legalLabelsOf` · `placeholdersOf` | The legal copy. |
| `makeConsumerRightsProtocols` · `makeCheckoutReadProtocols` | Protocol factories. |
| `AmountNarrowing` · `narrowAmountPolicy` · `amountAllowed` · `CheckoutLimitView` · `AmountPolicyView`/`Query` · `PlanPriceView`/`List`/`PlanPricesQuery` (+ schemas) | Per-entity narrowing of an amount checkout, and synced plan prices. |

Subpath: `./utils` — the `Config` / `Context` aliases to type your own context against.

## The catalogue is config, not a table

`PaymentService` reads everything through the context's config resource, so a deployment ships its
catalogue the same way it ships any other configuration:

| Record | Id | Type |
|---|---|---|
| product | `product:<sku>` | `PRODUCT_RECORD_TYPE` |
| plan | `plan:<planSku>` | `PLAN_RECORD_TYPE` |
| localization | `l10nToId(l10n, true)` → `l10n:<entityType>:<sku>:<lng>` | `L10N_RECORD_TYPE` |

`product` and `plan` read the record with the config resource's `get`, which **throws
`UnknownRecordError`** (`@owlmeans/resource`) when the id is absent rather than returning null — so
that, not `UnknownProduct` / `UnknownPlan`, is what a checkout for a sku outside the catalogue
raises. `localize` is the opposite: it reads with `load`, tries the asked-for language, falls back
to the default one, and returns `null` when neither exists, because a missing translation is a
display problem and never a reason to fail a call.

## Declaring plans

- **Every plan of a product has a `rank`; a higher rank is an upgrade.** An absent rank reads as
  `0`. Plan changes are classified by rank, and the effective plan of an entity is its
  highest-ranked entitling subscription — two plans of one product at one rank make both
  questions unanswerable.
- **The free tier is a real plan**: `free: true`, `price: 0`, `gateways: []`, usually `rank: 0`.
  Every entity holds some plan, so a gate never has to special-case "no subscription".
- **`gateways`** names the paygates a plan is sold through; a free plan has none.
- **`status` is a `PlanStatus`** (active, hidden, archived …) — the catalogue state of the plan,
  never a subscription's lifecycle.
- Plan records use the record date convention (`DateSchema` from `@owlmeans/auth`, a `Date`
  object); wire shapes do not (below).

## Capabilities and limits are different things

A **capability** is granted: a permission in a `PlanCapability` set, asked for as

    [<scope>:]<permission>[>=<n>]

`feature:branding--whitelabel` · `renewable:credits>=100` · `production--standalone`

A **limit** is counted: a `LimitDeclaration` under a key in `plan.limits`, asked for as

    limit:<key>[>=<n>]

- **`limit` is a reserved scope.** A plan never declares a capability set under it,
  `hasEntitlement` answers `false` for any `limit:` parameter, and the view builders skip such a
  set. A limit requirement can therefore never be satisfied by a capability grant.
- **One grammar, two gate services.** Capability parameters go to `ENTITLEMENT_GATE`
  (`entitled(params)` is sugar for it), limit parameters to `LIMIT_GATE`
  (`{ gate: { alias: LIMIT_GATE, params: [formatLimitParam(key)] } }`). The aliases differ because
  the framework collects an entrypoint's gates per gate service — one alias would let one
  requirement hide the other.
- **`@` is deliberately not part of the grammar.** That is `@owlmeans/iam`'s resource-selector
  syntax; reusing it would make two different things look identical in a route declaration.
- **Keep flags, magnitudes and counts apart.** `CAPABILITY_FEATURE_SCOPE` carries booleans; a
  granted magnitude nothing spends (`renewable:credits>=100`) lives under its own scope; anything
  spent against a ceiling is a limit. Merged, the purchase that spends a quota takes the feature
  with it.
- **A floor is a numeric question.** `>=n` passes only for a number at least that big — a boolean
  flag, however true, does not answer it. For a limit, `>=n` asks for `n` units of room.
- **A malformed parameter answers `false` / `null`, it never throws.** `hasEntitlement` refuses,
  `parseLimitParam` returns `null` for a capability parameter, a bare key, an empty key or a floor
  that is not positive. A gate that crashed on a typo would take down the endpoint it guards.
- **Declare the requirement on the protocol, not in the handler.** The framework asserts gates
  before the handler is entered, so the route table states what a feature costs. Several
  parameters of one gate are OR'd. The gate services themselves live in the server integration.

## The three limit kinds

| Kind | Window key (`windowKeyOf`) | Renews | Typical use |
|---|---|---|---|
| `window` + `day` | `YYYY-MM-DD` | at UTC midnight | per-day actions |
| `window` + `month` | `YYYY-MM` | on the 1st, UTC | per-month actions |
| `lifetime` | `lifetime` | never — the count belongs to the entity and survives plan changes | "N ever" |
| `occupancy` | `occupancy` | never — held `+1` / released `-1`, reconciled against reality | "N at once" |

- Windows are **calendar UTC**, never rolling and never local: two servers in two zones must agree
  on which counter a unit lands in.
- `windowBoundsOf(window, at)` returns `start` inclusive and `resetsAt` **exclusive** — `resetsAt`
  is the first instant of the next window and already belongs to it.
- A `window` limit without a known `window` (or an unknown kind) throws `LimitMisdeclared`: a
  misdeclared plan is loud, not a silently unlimited one.
- `limit: 0` means "not included" — a declared key with no room, which a UI renders as such.

## Promos

`promo: { until: Date, grandfather?: boolean }` on a capability set or a limit.

- In force while `at < until`. **`at === until` is over.**
- With `grandfather: true`, also in force for a subscription created before `until`, forever.
- A lapsed promo makes a capability `granted: false` and a limit's `limit: 0` — the row stays in
  the view with `promo.active: false`, so a UI can say the promotion ended rather than pretend the
  feature never existed.
- `promoViewOf` → `{ until, grandfathered, active }` is what a UI inscribes: active and not
  grandfathered ⇒ "free until"; grandfathered ⇒ "kept for your plan"; inactive ⇒ "ended".
- An unparseable `until` is never in force.

## The entitlement view

`entitlementViewOf(plan, planView, usage, at?)` is the one read of what an entity may do:

- `plan` — the `EntitlementPlanView` the caller resolved (sku, rank, free, status, paygate,
  period, trial, cancel-at-period-end, past-due, fallback). **Promos are measured against
  `planView.subscribedAt`** — set it to the subscription's creation date, or nothing is
  grandfathered.
- `capabilities` — `capabilityViewsOf`: one row per non-null, non-false permission, `param`
  exactly as the capability gate takes it.
- `limits` — `limitViewsOf`: one row per declared key; `used` from the `LimitUsage` row of the
  CURRENT window (none ⇒ `0`); `remaining = max(0, limit - used)`; `windowStart`/`resetsAt` only
  for a window limit.
- Read it with `capabilityOf(view, param)` (the same predicate as the gate, over granted rows),
  `limitOf(view, key)` and `hasLimitRoom(limitView, atLeast)`. The server gate and the browser
  call the same functions, so the UI's "disabled" and the server's refusal cannot disagree.
- **The wire carries dates as ISO strings.** The view schemas describe that
  (`{ type: 'string', format: 'date-time' }`): a response serializer writes a `Date` through it as
  ISO, while the record convention (`DateSchema`, an object) would serialize it as `{}`. A browser
  calls `reviveEntitlementView` before touching a date.

## Refusals and faults

- **A refusal extends `AuthForbidden`** (through `EntitlementRefusal`), so an HTTP boundary answers
  403.
  - `CapabilityRequired(params)` — message marker `capability-required:<a|b>`, field `params`.
  - `LimitExhausted({ key, used, limit, resetsAt? })` — marker
    `limit-exhausted:<key>:<used>/<limit>[:<ISO>]`, fields `limitKey`, `used`, `limit`,
    `resetsAt`.
- **Only `type` and `message` survive a marshal.** Both refusals pack their fields into the
  message and rebuild them in `finalizeUnmarshal()`; catch the class after
  `ResilientError.ensure`, never parse the text yourself.
- **Consumer-rights and checkout-limit refusals are not entitlement refusals**: they declare
  428/409 and never extend `AuthForbidden` (§ Consumer rights).
- **Faults are not refusals**: `LimitUnknown` (a key no plan declares), `LimitMisdeclared`,
  `PlanRequired` (no plan resolvable, not even a free one), `PlanRankConflict`,
  `WebhookSetupError` are `PaymentError`s — a configuration or setup problem, not the user's plan
  saying no — and declare no status, so an HTTP boundary answers 500.
- **`PortalUnavailable` is the entity's state, not a fault**: no paygate customer, no entitling
  subscription, no plan or item for the flow. It is a `PaymentError` declaring
  `static httpStatus = 409`, which `@owlmeans/server-api` answers as 409 Conflict. A new payment
  error that is the caller's condition declares its 4xx the same way; one that is a fault declares
  nothing.
- A UI phrases any of them from `errors.<type>`; the package registers those messages.

## Checkout

`CreateCheckoutBody` is the wire body of a checkout: `productSku`, `planSku` for a subscription,
`entitySlug` (the only organization value on a public body — a server resolves the stable
`entityId` before persisting anything), `service`, `amountMinor` for an amount checkout, return
URLs, `country` (the declared billing country; a locked profile overrides it) and
`startRequestId` (the subscription start request recorded just before). The package declares no
fixed checkout protocols: an application declares its own checkout and portal protocols over
`CreateCheckoutBodySchema` / `PortalLinkBodySchema`; `PortalLinkBody.flow` picks the portal flow
and `planSku` names the target of a `change`. The read side and the consumer-rights surface come
as factories (§ Protocol factories).

### Amount checkout

`amountMinor` is the net value credited to the customer, in integer currency minor units. The
policy bounds that value; fees and tax do not enlarge the credit. Gross up the pre-tax charge with:

```
ceil((amountMinor + fixedMinor) * 10_000 / (10_000 - rateBps))
```

Validate the whole policy when configuration is declared, then validate every selected amount at
the backend boundary. Minimum, default, maximum, preset entries, fixed adjustment and basis-point
rate are safe integers; presets are unique/in-range and the rate is below 100%. The maximum applies
to `amountMinor`, not the adjusted checkout subtotal or tax-inclusive total.

Quantity checkout remains supported. It uses its reusable unit price and quantity policy; do not
infer a pricing mode from the presence of `amountMinor`.

### Narrowing an amount checkout per entity

The plan's `amountPolicy` is the same for everyone; what one entity may buy NOW is narrower when a
checkout plugin (a spending tier, a rolling cap, a fraud hold) answers an `AmountNarrowing`
`{ maximumMinor, reason, resetsAt?, remainingMinor? }`. `narrowAmountPolicy(base, narrowings,
{ productSku?, planSku? })` is the one computation the server's refusal and the dialog's control
share, so they cannot disagree:

- the maximum is the smallest of the base maximum and every narrowing's (negative or fractional
  values floor at 0); `reason`/`resetsAt`/`remainingMinor` come from the narrowing that set it,
  the first on a tie;
- presets above the maximum are dropped, the default is clamped into `[minimum, maximum]`;
- `limit` is `null` when nothing lowered the base maximum — no note to show;
- **`limit.blocked`** (`limit.maximumMinor < base.minimumMinor`) means no amount may be bought now.
  The returned `policy` is then still a VALID policy (`assertAmountCheckoutPolicy` accepts it),
  pinned to the minimum with no presets, so a validator never throws — but it is NOT an offer of
  the minimum: a UI disables the input and the confirm button on `blocked`, and a server refuses
  every amount with `CheckoutLimitExceeded`. `amountAllowed(view, amount)` answers exactly that.

`CheckoutLimitExceeded` (409) packs `checkout-limit-exceeded:<encodeURIComponent(reason)>:
<maximumMinor>:<currency>[:<resetsAt ISO>]` and rebuilds `reason`, `maximumMinor`, `currency`,
`resetsAt`. It is a payment refusal, not an entitlement one.

## Pricing policy and tax estimate

`PricingPolicy` (a `PRICING_POLICY_RECORD_ID` singleton config record, `declarePaymentPricing` in
`@owlmeans/server-payment`) is what a checkout-owning application declares once for tax and
currency behaviour: `tax.automatic` (Stripe Tax on the session), `tax.behavior` (a synced price's
`TaxBehavior.Exclusive`/`Inclusive`, absent = leave it `unspecified`), `tax.collectTaxId`,
`tax.estimate` / `currency.estimate` (serve a tax/local-currency estimate endpoint — the estimate
requires `tax.automatic`, the currency one requires `currency.adaptive`), `currency.adaptive`
(Stripe Adaptive Pricing on the session). `PaymentService.pricingPolicy()` reads the declared record
or `DEFAULT_PRICING_POLICY` — the fixed behaviour every checkout had before this policy existed
(automatic tax and tax-id collection on, no forced behavior, no Adaptive Pricing, no estimate), so
an application that declares nothing sees no change.

`PriceEstimate` (built by `@owlmeans/server-payment`'s gateway, `estimatePrice`) is the read model:
`country`/`source` (`'request'`/`'customer'`, or `'profile'` with `locked: true` when the entity's
billing country is locked and overrides the request — a picker then shows it and does not change
it), `region`, `currency`, `behavior`, `tax: TaxEstimate` (`status`
one of `TaxEstimateStatus` — `taxed`/`reverse-charge`/`none`/`at-checkout`/`location-required` —
plus `subtotalMinor`/`taxMinor`/`totalMinor`, `scalable`, and `rates: TaxRateEstimate[]` with
`ratePpm` parsed by `ratePpmOf` from Stripe's `percentage_decimal`, never `Number(x) * 10_000`),
and an optional `local` (currency + `exchangeRate`, from Stripe's FX Quotes). The pure helper
`estimateOf(amountMinor, estimate)` re-derives tax and a total for a DIFFERENT amount than the
estimate's own reference one — exact only when `scalable` and the behavior is `Exclusive`; both
`taxMinor`/`totalMinor` come back `null` otherwise, meaning "computed at checkout", never a wrong
number. When the source estimate carries `local`, the result's own `local` gives the subtotal, tax
and total in THAT currency (`subtotalAmount`/`taxAmount`/`totalAmount`, major units) alongside the
integration-currency ones — a UI shows one or the other, marking the local figures `≈`, never both
side by side. `COUNTRY_CURRENCIES` / `currencyOfCountry` / `COUNTRY_CODES` is a reference ISO 3166-1 →
ISO 4217 map for a country picker and the local-currency lookup — not a Stripe list, and a country
absent from it still gets a tax estimate, just no local-currency line.

## Consumer rights (EU withdrawal, cancellation, country lock)

The contracts behind the right of withdrawal (CRD Art. 9–16, the Art. 11a withdrawal function),
the cancellation function (§ 312k BGB / L215-1-1) and a billing country fixed at the first
purchase. `@owlmeans/server-payment` records, enforces and mails; `@owlmeans/web-payment` renders.
Nothing here is product copy — the trader, plan and product names are placeholders.

### Territories, region, scope

- `EU_COUNTRIES` (27, Greece is `GR`), `EU_CONSUMER_TERRITORIES` (plus AX, GF, GP, MQ, RE, YT, MF —
  consumer law applies there even where EU VAT does not), `EEA_EXTRA` (IS, LI, NO) and their union
  `CONSUMER_RIGHTS_TERRITORIES`, the default `policy.countries`.
- `regionOf(country, policy?)`: `Eu` inside the policy's territories, `Other` outside, `null` for no
  country. `inScope(region, country, policy)`: a known country decides by the territories, else a
  known region, else `unknownCountry` — `'protect'` by default, so an unknown buyer is protected.
- `chargeCurrencyOf(region, policy, fallback)`: the policy's currency for the region; an unknown
  region reads as `Eu`. The display currency is the charge currency, everywhere.
- `billingLanguageOf(country, policy?, fallback?)`: `policy.languages`, then `COUNTRY_LANGUAGES`
  (unambiguous countries only — BE, LU, CH are absent), then `fallback`, then
  `policy.defaultLanguage`. Legal copy is shown in this language, with a toggle to the UI language.

### The policy record

`ConsumerRightsPolicy` is a singleton config record (`CONSUMER_RIGHTS_RECORD_ID`), declared by the
server integration through `makeConsumerRightsPolicy(def)` — `DEFAULT_CONSUMER_RIGHTS` filled in
(14 days, weekend rollover, margin 5 — a period ending on a public holiday runs to the next working
day and holiday clusters need up to five, no per-country calendar is kept —, every mechanism OFF,
`defaultLanguage: 'en'`, start requests
usable 3600 s) — and `assertConsumerRightsPolicy` (non-empty `textVersion`, `^[A-Z]{2}$`
countries, `withdrawalDays >= 14`, margin 0..7, lowercase currencies, https links, the default
language present, `withdrawalInformation` required while `withdrawal` or `performanceConsent` is
on; throws `ConsumerRightsError('policy:<field>')`). It carries only public links, territories
and switches — mail options live in a backend-only plugin config — so it is ADVERTISED to the
browser like the pricing policy. `PaymentService.consumerRightsPolicy()` answers `null` when none
is declared: no consumer-rights behaviour at all. `linksOf(policy, lng)` merges a language's links
field by field over the default language's (`de-AT` reads `de`).

`ProductPlan.withdrawal.components: PlanWithdrawalComponent[]` (`{ key, basis: 'time' | 'units',
shareMinor }`) states the separately priced parts of a subscription (CJEU C-641/19 PE Digital:
without them the whole price is pro rata by time).

### Wire views

Every view schema carries dates as ISO strings (as `model/view.ts` does) and is revived with its
`revive*` helper (`reviveConsentView`, `revivePurchase`/`List`, `reviveBillingProfile`,
`reviveConsentResponse`, `reviveStartResponse`, `reviveWithdrawalList`, `reviveReceipt`,
`reviveCheckoutLimit`, `reviveAmountPolicyView`) — idempotent. A nullable enum on the wire lists
`null` in its enum (ajv rejects `null` otherwise). The consent and start views carry `trader`, the
name the statement is rendered with, so the server's record and the dialog's text are identical.
`WithdrawalBody` and `CancellationBody` ask only for name, contract and e-mail (plus the
cancellation kind, reason and date) and accept an optional `honeypot` a person never fills. A
public declaration answers `DeclarationReceipt` — what was declared and when, never whether a
contract matched.

### Calculators — always in the consumer's favour

All amounts in BigInt; a deduction rounds DOWN, a refund rounds UP, a refund never exceeds what is
still unrefunded.

- `withdrawalDeadlineOf(purchasedAt, rule | policy)` → the EXCLUSIVE end: the purchase's UTC day +
  `days`, a Saturday/Sunday last day moved to Monday, + `marginDays`, start of the next UTC day.
  Wed 2026-09-23 → 2026-10-13T00:00Z; Sat 2026-09-26 → 2026-10-18T00:00Z; Sun 2026-12-20 →
  2027-01-10T00:00Z (margin 5). `withdrawalOpen(window, at)` — before the deadline, not withdrawn,
  not refunded. **A person is shown the last included day**, `lastWithdrawalDayOf(deadline)` (the
  UTC day of `deadline − 1 ms`), phrased "until the end of <date>" — never the exclusive instant.
- `oneTimeWithdrawalRefund({ paidMinor, refundedMinor?, unitsGranted, unitsUsed })` →
  `min(paid − refunded, ceil(paid × (granted − used) / granted))`; `unitsUsed` is the deduction —
  units used AFTER consent (none before it) plus debt settled from the lot plus units already
  clawed back (`@owlmeans/server-payment` passes the meter's `usedAfter + settled + clawed`);
  returns `unitsReturned`. 1256 paid, 125k of 500k used → 942.
- `subscriptionWithdrawalRefund(...)` splits `netMinor` by the components (`splitByShares`, largest
  remainder); a `time` part loses `floor(c × elapsedDays / periodDays)` counted from
  `max(periodStart, servicesRequestedAt)` — NOTHING without a start request; a `units` part loses
  `floor(c × used / granted)`; gross = `ceil(paid × refundNet / net)`. Net 2000 / paid 2460, 3 of 30
  days and 100k of 500k used → 2091.
- `allocateFifo(lots, spends)` — a spend takes the oldest lot granted at or before it; overflow is
  `unallocated`. `unitsUsedAfter(lot, consentedAt)` counts slices strictly after the consent, `0`
  without one.
- `cancellationEffectiveAt(periodEnd, 'month' | 'year', requested?)` — the period end, or the first
  boundary on or after a later requested date (end-of-month clamped from the anchor).

### Refusals

`ConsumerRightsRefusal` extends `ConsumerRightsError` (a `PaymentError`), NEVER `AuthForbidden`:
an HTTP boundary tests that family first, and a 403 would hide the status a client acts on. Each
refusal declares `static httpStatus`, packs its fields into the message and rebuilds them in
`finalizeUnmarshal()` (the marker is read after its LAST occurrence, so a registry rebuild of a
doubled prefix still parses):

| Class | Status | Marker (after `payment:consumer-rights:`) | Fields |
|---|---|---|---|
| `PerformanceConsentRequired` | 428 | `performance-consent-required:<pending>[:<deadline ISO>]` | `pending`, `deadline` |
| `SubscriptionStartRequired` | 428 | `subscription-start-required:<encodeURIComponent(planSku)>` | `planSku` (pass it raw) |
| `BillingCountryLocked` | 409 | `billing-country-locked:<country>[:<requested>]` | `country`, `requested` |
| `WithdrawalUnavailable` | 409 | `withdrawal-unavailable:<WithdrawalUnavailableReason>` | `reason` |
| `CancellationUnavailable` | 409 | `cancellation-unavailable:<CancellationUnavailableReason>` | `reason` |

`consentRefusalOf(e)` → `'performance' | 'subscription-start' | null`: the class after
`ResilientError.ensure`, else the marker or type name in `message`/`type`. A production body
carries only an incident id — a bare 428 is the caller's to read with `@owlmeans/api/status`.

### The legal copy

The i18n resource `payment-consumer-rights` (`CONSUMER_RIGHTS_RESOURCE`, library tier, `lib`
namespace), in en pl ru be uk es de fr, versioned by `CONSUMER_RIGHTS_COPY_VERSION` (bump it on ANY
change to a bundle). Branches: `performance-consent`, `subscription-start` (`title`, `intro`,
`request`, `acknowledgement`, `checkbox` = request + space + acknowledgement, `confirm`,
`decline`; the consent branch also `purchase`), `withdrawal`, `cancellation` (form labels and the
statutory buttons `function` / `confirm`), `links`, `checkout` (`terms-acceptance.{in-scope,
other}` markdown, `renewal.{month, year, after-submit}`, `price.{exclusive, inclusive, exclusive-tax}` (VAT wording for the territories, "applicable tax" for a buyer outside them), `top-up`,
`top-up-note`), `email.{common, consent, start, purchase, withdrawal, cancellation}` (the purchase
mail carries the CRD Annex I(A) withdrawal information with the function's address and the Annex
I(B) model form, per language from the national models; there `{{trader}}` is the trader's whole
identity — legal name, address, e-mail; a `review` withdrawal receipt promises the reimbursement
within the statutory 14 days; `email.cancellation.review` answers an extraordinary cancellation,
whose status is `CancellationStatus.Review`), `credit-note.memo`. In the consent and start
STATEMENTS `{{trader}}` is the trader's short name.

- Read it with `consumerRightsCopy(lng)` (any language, merged key by key over English, no i18next
  instance, never drains a bundle — `resolveI18nResource`), `consumerText(lng, path, vars)` (fills
  `{{name}}`; throws `ConsumerRightsError('copy:<path>[:<name>]')` on a missing text or value — a
  legal text never goes out with a hole), `consentStatementOf(lng, kind, { trader, plan? })` (the
  exact statement the dialog shows, the server records and the mail repeats) and
  `legalLabelsOf(lng)`.
- Statutory labels are pinned by a test: en "Withdraw from contract here" / "Confirm withdrawal",
  "Cancel contracts here" / "Cancel now"; de "Vertrag widerrufen" / "Widerruf bestätigen",
  "Verträge hier kündigen" / "Jetzt kündigen"; fr "Renoncer au contrat ici" / "Confirmer la
  rétractation", "Résilier votre contrat" / "Notification de la résiliation"; pl "Odstąp od umowy
  tutaj" / "Potwierdź odstąpienie od umowy", "Wypowiedz umowę tutaj" / "Wypowiedz teraz"; es
  "Desistir del contrato aquí" / "Confirmar el desistimiento", "Cancelar contratos aquí" /
  "Cancelar ahora"; uk/ru/be are courtesy translations.
- The express request uses the statutory verbs (PL "Żądam i wyrażam wyraźną zgodę … Przyjmuję do
  wiadomości …", DE "Ich verlange ausdrücklich und stimme ausdrücklich zu … Mir ist bekannt …", FR
  "Je demande expressément et j’accepte expressément … Je reconnais perdre …").
- Wording rule, enforced by a scan of every language: say "the right of withdrawal expires" and
  "only unused credits are reimbursed" — never non-refundable / nicht erstattungsfähig / non
  remboursable / bezzwrotny / no reembolsable / невозвратный / неповоротний / незваротны.
- Paygate texts (`checkout.*`) stay within 1200 characters after interpolating long URLs.
- An application overrides a text with `addI18nApp(lng, CONSUMER_RIGHTS_RESOURCE, data, { ns:
  LIB_NAMESPACE })`; every placeholder of a text must match its English master.

### Protocol factories

`makeConsumerRightsProtocols({ prefix, parent | guards (+ gate), path = '/consumer-rights',
public?: false | { path = '/public/consumer-rights', parent?, screens?: { withdrawal?,
cancellation?, parent? } } })`, the `makeMarketingConsentProtocols` way:

- account subtree under the app's GUARDED parent (its guards and gate inherited): `base`,
  `profile` GET `/profile`, `purchases` GET `/purchases`, `consent` GET / `giveConsent` POST
  `/consent`, `start` GET `/start?planSku` / `requestStart` POST `/start`, `withdrawals` GET /
  `withdraw` POST `/withdrawal`, `cancel` POST `/cancellation`; aliases `<prefix>:<name>`
  (`consent:give`, `start:request`);
- `public` (only when declared): `base`, `policy` GET `/policy`, `withdraw` POST `/withdrawal`,
  `cancel` POST `/cancellation` — NO guard and NO gate (like `paymentGate.webhook`; a public
  `parent` must be unguarded), receipts typed `DeclarationReceipt`; `screens` declares BOTH sticky
  frontend routes (`/legal/withdraw`, `/legal/cancel` by default); aliases `<prefix>:public:<name>`;
- neither `parent` nor `guards` is a `SyntaxError`; absent parts are left OUT of the tree (never
  `undefined`), so `protocols(tree)` and `mapProtocols` walk it as is.

`makeCheckoutReadProtocols({ prefix, parent | guards })` → `base` (`/checkout`), `amountPolicy`
GET `/amount-policy?productSku&planSku` (`AmountPolicyView`) and `planPrices` GET
`/plan-prices?productSku` (`PlanPriceList`).

## `shallowAuthentication` identifies, it does not authorize

It reads the `profileId` out of an envelope token WITHOUT verifying the signature, and throws
`PaymentIdentificationError` when there is no token or no profile in it. Use it to correlate a
checkout return with a visitor; never as the basis of an access decision — that is a gate's job.

## Depends On

- `@owlmeans/entrypoint` · `@owlmeans/route` · `@owlmeans/config` · `@owlmeans/resource`
- `@owlmeans/auth` (`PermissionSet`, `AuthForbidden`) · `@owlmeans/basic-envelope` · `@owlmeans/context`
- `@owlmeans/error` · `@owlmeans/i18n` · `@owlmeans/api-config` · peer `ajv`

## Related

- [[entitlements]] — the model across packages: admission, the usage ledger, the gates
- [[server-payment]] — the Stripe gateway, subscription store, usage ledger and gate services
- [[web-payment]] — hooks and pieces over the entitlement view
- [[client-payment]] — the browser-side adaptation of the catalogue service
- [[iam]] — `PermissionSet` and the resource-selector syntax entitlements deliberately avoid
