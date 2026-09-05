---
name: payment
description: "How to use @owlmeans/payment — the provider-agnostic payment contracts: the product/plan/subscription catalogue and its schemas, the paymentApi entrypoint aliases, PaymentService, and the entitlement grammar that gates paid capabilities. Auto-invoked when importing payment types or errors, declaring an entrypoint with entitled(), reading entitlements, or calling the checkout entrypoint."
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/payment

**Layer:** Core
**Install:** `"@owlmeans/payment": "^0.1.18-rc.13"` in `dependencies`

The contracts half of payments: the catalogue (products, plans, localizations), the subscription
record, the entitlement grammar, and the entrypoint declarations both sides of a checkout share. It
talks to no paygate — a server-side integration implements against these, and
`@owlmeans/client-payment` adapts the same service for a browser.

## Key exports

| Export | Description |
|---|---|
| `makePaymentService(alias?)` · `appendPaymentService(ctx, alias?)` | The catalogue reader, registered under `DEFAULT_ALIAS` / `PAYMENT_SERVICE` (`'payment'`). |
| `PaymentService` | `product(sku)` · `products()` · `plans(productSku, duration)` · `plan(planSku)` · `allPlans(productSku)` · `localize(lng, entity)` · `shallowAuthentication(token)`. |
| `paymentApi` | The entrypoint alias tree — `paymentApi.subscription.propagate`, `paymentApi.service.checkout.session.external.create`. |
| `entrypoints` · `serviceEntrypoints` | The declarations to register: the subscription callback surface, and the checkout service surface. |
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
- **Declare the requirement on the route, not in the handler.** `entitled(...)` is sugar over
  `gate(ENTITLEMENT_GATE, params)`; the framework asserts a gate before the handler is entered, so
  the route table states what a feature costs and no new endpoint can forget to check. Several
  parameters are OR'd, as with every other gate.
- The gate service itself is not here — bind something under `ENTITLEMENT_GATE` in the server
  application, or every entitled route refuses.

```typescript
import { entitled, hasEntitlement, entitlementList } from '@owlmeans/payment'

// On the route:
entrypoint(route(MY_ROUTE, '/whitelabel', backend(BASE, RouteMethod.POST)),
  entitled('feature:branding--whitelabel'))

// In the UI, to render a control disabled rather than let it fail:
const allowed = hasEntitlement(capabilities, 'renewable:credits>=100')
// On the wire, as the answer to "what does this subscription grant?":
const granted = entitlementList(capabilities)
```

## Checkout

Register `serviceEntrypoints` (and `entrypoints` where subscriptions are propagated back), then
call the alias. `ClientEntrypoint.call` resolves to the response value itself and throws the reply's
error; `invoke` is the form that hands back the value and the outcome together.

```typescript
import { paymentApi, serviceEntrypoints } from '@owlmeans/payment'
import type { CreateCheckoutBody, CreateCheckoutResponse } from '@owlmeans/payment'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'

export const appEntrypoints = [...myEntrypoints, ...serviceEntrypoints]

const result = await ctx.entrypoint<ClientEntrypoint<CreateCheckoutResponse>>(
  paymentApi.service.checkout.session.external.create
).call({
  body: { productSku, entityId, service, successUrl } satisfies CreateCheckoutBody
})
window.open(result.url, '_blank')
```

`entityId` on a checkout and on a `PlanSubscription` is the organization entity a subscription is
billed to — a stable record id, never an `entitySlug`, so a rename costs nothing.

## Two spellings, both registered

`entrypoints` declares `/propogate` and `/propagate` as two routes over the same
`SubscriptionPropagateBodySchema`, and `paymentApi.subscription` carries an alias for each.
`propogate` is marked `@deprecated`, as are the type alias `SubscriptionPropogateBody` and the
duplicate `SubscriptionPropogateBodySchema`: write every new declaration and every new call against
`propagate` / `SubscriptionPropagateBody` / `SubscriptionPropagateBodySchema`. The misspelled route
stays registered as long as anything might call it — dropping it is a breaking change on a wire
nobody controls both ends of.

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
