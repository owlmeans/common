---
name: payment
description: "How to use @owlmeans/payment — provider-agnostic payment contracts, immutable payment protocols, amount/quantity checkout policies and pricing, catalogue records, and entitlement gates. Auto-invoked when importing payment types or errors, declaring paid routes, or creating checkout."
user-invocable: false
---

# @owlmeans/payment

**Layer:** Core
**Install:** `"@owlmeans/payment": "^0.1.18-rc.18"` in `dependencies`

The contracts half of payments: the catalogue (products, plans, localizations), the subscription
record, the entitlement grammar, and the entrypoint declarations both sides of a checkout share. It
talks to no paygate — a server-side integration implements against these, and
`@owlmeans/client-payment` adapts the same service for a browser.

## Key exports

| Export | Description |
|---|---|
| `makePaymentService(alias?)` · `appendPaymentService(ctx, alias?)` | The catalogue reader, registered under `DEFAULT_ALIAS` / `PAYMENT_SERVICE` (`'payment'`). |
| `PaymentService` | `product(sku)` · `products()` · `plans(productSku, duration)` · `plan(planSku)` · `allPlans(productSku)` · `localize(lng, entity)` · `shallowAuthentication(token)`. |
| `paymentApi` | Immutable protocol tree — `paymentApi.subscription.propagate`, `paymentApi.service.checkout.session.external.create`. |
| `CheckoutPricingMode` | `Amount` for a caller-selected net monetary value; `Quantity` for reusable unit prices. |
| `AmountCheckoutPolicy` / `QuantityCheckoutPolicy` (+ schemas) | Configured bounds/default/presets and adjustment, or quantity bounds/default. |
| `assertAmountCheckoutPolicy` / `assertQuantityCheckoutPolicy` / `assertCheckoutAmount` | Startup and request-boundary validation. |
| `chargeAmountMinor(amount, policy)` | Integer-only gross-up of net amount before tax. |
| `entitled(params, opts?)` · `ENTITLEMENT_GATE` | Declare on a route that an entrypoint needs a paid capability. |
| `hasEntitlement(capabilities, param)` · `entitlementList(capabilities)` · `parseEntitlementParam` · `formatEntitlementParam` | The entitlement grammar — pure, and shared by the server gate and the UI. |
| `CAPABILITY_FEATURE_SCOPE` | `'feature'`, the scope that carries flags. |
| `Product` · `ProductPlan` · `PlanSubscription` · `Localization` · `LimitConfig` · `CapabilityUsage` | The record shapes, each with a matching `…Schema` for entrypoint body validation. |
| `CreateCheckoutBody` / `CreateCheckoutResponse` · `SubscriptionPropagateBody` (+ schemas) | The wire shapes of the two calls that cross a service boundary. |
| `ProductType` · `PlanStatus` · `PlanDuration` · `SubscriptionStatus` · `PaymentEntityType` (+ schemas) | The enumerations. All string-valued, so they survive a config file. |
| `PRODUCT_RECORD_TYPE` · `PLAN_RECORD_TYPE` · `L10N_RECORD_TYPE` (+ the matching `…_PREFIX`) · `l10nToId` | How catalogue records are typed and addressed in the config resource. |
| `PaymentError` · `PaygateError` · `UnknownPaygate` · `PaygateMappingError` · `ProductError` · `UnknownProduct` · `UnknownPlan` · `PaymentIdentificationError` · `SubscriptionError` · `UnknownSubscription` | The `ResilientError` family. Importing the package also registers its translated messages. |

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
raises, and what a caller answering "no such product" catches. `localize` is the opposite: it reads
with `load`, tries the asked-for language, falls back to the default one, and returns `null` when
neither exists, because a missing translation is a display problem and never a reason to fail a
call.

## Entitlements

A paid capability is a `PermissionSet` on a plan, a product or a subscription, and one requirement
is written as a string:

    [<scope>:]<permission>[>=<n>]

`feature:branding--whitelabel` · `renewable:credits>=100` · `production--standalone`

- **`@` is deliberately not part of the grammar.** That is `@owlmeans/iam`'s resource-selector
  syntax; reusing it would make two different things look identical in a route declaration.
- **Keep flags and quotas in different scopes.** `CAPABILITY_FEATURE_SCOPE` carries booleans;
  numeric allowances belong under their own scope. Merged, "has one slot left" and "may remove the
  platform credit" become the same number, and the purchase that spends the quota takes the feature
  with it.
- **A floor is a numeric question.** `>=n` passes only for a number at least that big — a boolean
  flag, however true, does not answer it.
- **A malformed parameter answers `false`, it never throws.** A gate that crashed on a typo would
  take down the endpoint it guards, which is strictly worse than refusing the request.
- **Declare the requirement on the protocol, not in the handler.** `entitled(...)` is sugar over
  the protocol's `gate: { alias: ENTITLEMENT_GATE, params }` option; the framework asserts a gate before the handler is entered, so
  the route table states what a feature costs and no new endpoint can forget to check. Several
  parameters are OR'd, as with every other gate.
- The gate service itself is not here — bind something under `ENTITLEMENT_GATE` in the server
  application, or every entitled route refuses.

```typescript
import { entitled, hasEntitlement, entitlementList } from '@owlmeans/payment'

// On the protocol:
protocol(
  route(MY_ROUTE, '/whitelabel', backend(BASE, RouteMethod.POST)),
  contract(typed()),
  { gate: { alias: ENTITLEMENT_GATE, params: ['feature:branding--whitelabel'] } },
)

// In the UI, to render a control disabled rather than let it fail:
const allowed = hasEntitlement(capabilities, 'renewable:credits>=100')
// On the wire, as the answer to "what does this subscription grant?":
const granted = entitlementList(capabilities)
```

## Checkout

Bind `paymentApi.service` directly in both client and server layers. Call the protocol object; its
body and response are inferred without a consumer generic. `protocols(paymentApi.service)` is only
for framework materialization, never a public compatibility export.

```typescript
import { paymentApi } from '@owlmeans/payment'
import { bindAll } from '@owlmeans/client-entrypoint'

export const appEntrypoints = [...bindAll(paymentApi.service)]

const result = await ctx.entrypoint(paymentApi.service.checkout.session.external.create).call({
  body: { productSku, entitySlug, service, amountMinor, successUrl }
})
window.location.assign(result.url)
```

`entitySlug` is the only organization value on a public checkout body. A server resolves it to the
stable `entityId` before persisting a customer/session. `PlanSubscription.entityId` remains an
internal record key, not an HTTP body convention.

### Amount checkout

`amountMinor` is the net value credited to the customer, in integer currency minor units. The
policy bounds that value; fees and tax do not enlarge the credit. Gross up the pre-tax charge with:

```
ceil((amountMinor + fixedMinor) * 10_000 / (10_000 - rateBps))
```

Validate the whole policy when configuration is declared, then validate every selected amount at
the backend boundary. Minimum, default, maximum, preset entries, fixed adjustment and basis-point
rate are safe integers; presets are unique/in-range and the rate is below 100%. The maximum applies
to `amountMinor`, not the adjusted checkout subtotal or Stripe tax-inclusive total.

Quantity checkout remains supported. It uses its reusable unit price and quantity policy; do not
infer a pricing mode from the presence of `amountMinor`.

## One propagation protocol

`paymentApi.subscription.propagate` is the one subscription propagation route. Its body carries the
organization as `entitySlug`; `entityId` belongs only to stored `PlanSubscription` records and
in-process services. Do not add misspelled aliases or flattened declaration lists as compatibility
surfaces: a consumer imports and binds the named protocol from the immutable tree.

## `shallowAuthentication` identifies, it does not authorize

It reads the `profileId` out of an envelope token WITHOUT verifying the signature, and throws
`PaymentIdentificationError` when there is no token or no profile in it. Use it to correlate a
checkout return with a visitor; never as the basis of an access decision — that is a gate's job.

## Depends On

- `@owlmeans/entrypoint` · `@owlmeans/route` · `@owlmeans/config` · `@owlmeans/resource`
- `@owlmeans/auth` (`PermissionSet`) · `@owlmeans/basic-envelope` · `@owlmeans/context`
- `@owlmeans/error` · `@owlmeans/i18n` · peer `ajv`

## Related

- [[client-payment]] — the browser-side adaptation of the same service
- [[iam]] — `PermissionSet` and the resource-selector syntax entitlements deliberately avoid
