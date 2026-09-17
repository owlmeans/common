---
name: payment
description: "How to use @owlmeans/payment — provider-agnostic payment contracts, immutable payment protocols, amount/quantity checkout policies and pricing, catalogue records, and entitlement gates. Auto-invoked when importing payment types or errors, declaring paid routes, or creating checkout."
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/payment

**Layer:** Core
**Install:** `"@owlmeans/payment": "^0.1.18-rc.29"` in `dependencies`

The contracts half of payments: the catalogue (products, plans, localizations), amount- and
quantity-priced checkout, and the entitlement model — plan capabilities, counted limits, promos,
and the entitlement view the server gate and the browser both read. It talks to no paygate: a
server-side integration (`@owlmeans/server-payment`) implements against these, and
`@owlmeans/client-payment` adapts the catalogue service for a browser. The model as a whole —
admission, the usage ledger, the two gate services — is the `entitlements` skill.

## Key exports

| Export | Description |
|---|---|
| `makePaymentService(alias?)` · `appendPaymentService(ctx, alias?)` | The catalogue reader, registered under `DEFAULT_ALIAS` / `PAYMENT_SERVICE` (`'payment'`). |
| `PaymentService` | `product(sku)` · `products()` · `plans(productSku, duration)` · `plan(planSku)` · `allPlans(productSku)` · `localize(lng, entity)` · `shallowAuthentication(token)`. |
| `Product` · `ProductPlan` · `Localization` (+ schemas) | Catalogue records. `ProductPlan` carries `rank`, `free`, `gateways`, `suspendedAt`, `capabilities: PlanCapability[]`, `limits: { [key]: LimitDeclaration }`. |
| `PlanCapability` · `LimitDeclaration` · `PromoDeclaration` (+ schemas) | What a plan grants: a permission set, a counted allowance, a time box on either. |
| `SubscriptionStatus` · `ENTITLING_STATUSES` · `TERMINAL_STATUSES` · `INTERNAL_PAYGATE` | Lifecycle vocabulary. `Active`/`Trial`/`PastDue` entitle; `Canceled`/`Expired`/`Ended`/`Blocked` are terminal; `Suspended` is revoked until resumed. |
| `LimitKind` · `LimitWindow` · `PortalFlow` (+ schemas) | `window`/`lifetime`/`occupancy`; `day`/`month`; `manage`/`cancel`/`update`/`change`/`payment-method`. |
| `ENTITLEMENT_GATE` · `LIMIT_GATE` · `CAPABILITY_FEATURE_SCOPE` · `CAPABILITY_LIMIT_SCOPE` | The two gate aliases and the two reserved scopes (`feature` for flags, `limit` for limit parameters). |
| `entitled` · `parseEntitlementParam` · `formatEntitlementParam` · `hasEntitlement` · `entitlementList` | The capability grammar and predicate. |
| `parseLimitParam` · `formatLimitParam` · `windowKeyOf` · `windowBoundsOf` · `LIFETIME_WINDOW` · `OCCUPANCY_WINDOW` | The limit grammar and window algebra. |
| `promoActive` · `promoViewOf` | Whether a promo is in force for one subscription at one instant. |
| `EntitlementView` · `EntitlementPlanView` · `CapabilityView` · `LimitView` · `PromoView` · `LimitUsage` (+ wire schemas) | The entitlement view and its rows. |
| `capabilityViewsOf` · `limitViewsOf` · `entitlementViewOf` · `reviveEntitlementView` · `capabilityOf` · `limitOf` · `hasLimitRoom` | Pure view builders and readers. |
| `CreateCheckoutBody` (`planSku`) · `CreateCheckoutResponse` · `PortalLinkBody` · `PortalLinkResponse` (+ schemas) | Wire shapes an application's own checkout and portal protocols use. |
| `CheckoutPricingMode` · `AmountCheckoutPolicy` / `QuantityCheckoutPolicy` (+ schemas) · `assertAmountCheckoutPolicy` · `assertQuantityCheckoutPolicy` · `assertCheckoutAmount` · `chargeAmountMinor` | Checkout pricing policies and their validation. |
| `EntitlementRefusal` · `CapabilityRequired` · `LimitExhausted` | Refusals — all `AuthForbidden`. |
| `PaymentError` · `PaygateError` · `UnknownPaygate` · `PaygateMappingError` · `WebhookSetupError` · `PortalUnavailable` · `ProductError` · `UnknownProduct` · `UnknownPlan` · `PlanRequired` · `PlanRankConflict` · `LimitUnknown` · `LimitMisdeclared` · `PaymentIdentificationError` · `SubscriptionError` · `UnknownSubscription` | Faults (500), except `PortalUnavailable` (409). Importing the package registers every type's message under `errors.<type>` in the seven languages. |

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
URLs. The package declares no protocols: an application declares its own checkout and portal
protocols over `CreateCheckoutBodySchema` / `PortalLinkBodySchema`; `PortalLinkBody.flow` picks the portal flow and
`planSku` names the target of a `change`.

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
