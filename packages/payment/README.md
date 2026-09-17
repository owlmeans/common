# @owlmeans/payment

Payment contracts shared by a server and a browser: the product catalogue, amount- or
quantity-priced checkout, and the entitlement model — plans that grant capabilities and counted
limits, promos, and the entitlement view both a gate and a UI read. It talks to no paygate; a
server integration (`@owlmeans/server-payment`) implements against these contracts.

## Installation

```bash
bun add @owlmeans/payment@^0.1.18-rc.29
```

## Concepts

- **Plan** — a catalogue record with a `rank` (higher is an upgrade) and optionally `free: true`
  (price 0, no paygate): every entity holds some plan, even without paying.
- **Capability** — a granted permission, written `[scope:]permission[>=n]`, asserted under
  `ENTITLEMENT_GATE`.
- **Limit** — a counted allowance, written `limit:<key>[>=n]`, asserted under `LIMIT_GATE`. Three
  kinds: `window` (calendar UTC day/month), `lifetime` (never renews), `occupancy` (a held count).
- **Promo** — `{ until, grandfather? }` on a capability set or a limit: in force before `until`,
  or for a subscription created before it when grandfathered.
- **Entitlement view** — the effective plan, every capability and every limit with its usage, at
  one instant; built by pure helpers the server and the browser share.

## Usage

Declare a plan:

```typescript
import { LimitKind, LimitWindow, PlanDuration, PlanStatus } from '@owlmeans/payment'
import type { ProductPlan } from '@owlmeans/payment'

const proMonthly: ProductPlan = {
  productSku: 'pro', sku: 'pro-monthly', status: PlanStatus.Active, duration: PlanDuration.Monthly,
  price: 20, title: 'Pro', rank: 10, gateways: ['stripe'],
  capabilities: [
    { scope: 'feature', permissions: { whitelabel: true } },
    { scope: 'feature', permissions: { beta: true }, promo: { until: new Date('2027-01-01'), grandfather: true } },
  ],
  limits: {
    seats: { kind: LimitKind.Occupancy, limit: 5 },
    exports: { kind: LimitKind.Window, window: LimitWindow.Month, limit: 100, unit: 'file' },
  },
}
```

Gate a route on a capability or on a limit:

```typescript
import { ENTITLEMENT_GATE, LIMIT_GATE, entitled, formatLimitParam } from '@owlmeans/payment'

protocol(route(WHITELABEL, '/whitelabel', backend(BASE, RouteMethod.POST)), contract(typed()),
  entitled('feature:whitelabel'))
protocol(route(INVITE, '/invite', backend(BASE, RouteMethod.POST)), contract(typed()),
  { gate: { alias: LIMIT_GATE, params: [formatLimitParam('seats')] } })
```

Build and read an entitlement view:

```typescript
import {
  capabilityOf, entitlementViewOf, hasLimitRoom, limitOf, reviveEntitlementView,
} from '@owlmeans/payment'

const view = entitlementViewOf(plan, planView, usage)          // server
const fromWire = reviveEntitlementView(await response.json())  // browser: ISO strings → Dates
capabilityOf(fromWire, 'feature:whitelabel')
hasLimitRoom(limitOf(fromWire, 'seats'))
```

Refuse and recover the fields on the other side of a service hop:

```typescript
import { LimitExhausted } from '@owlmeans/payment'
import { ResilientError } from '@owlmeans/error'

throw new LimitExhausted({ key: 'seats', used: 5, limit: 5 })
// …after marshal/unmarshal:
const error = ResilientError.ensure(caught)
if (error instanceof LimitExhausted) { error.limitKey; error.used; error.limit; error.resetsAt }
```

## API

- Catalogue: `makePaymentService(alias?)`, `appendPaymentService(ctx, alias?)`, `PaymentService`
  (`product`, `products`, `plans`, `plan`, `allPlans`, `localize`, `shallowAuthentication`),
  `l10nToId`, record types/prefixes.
- Checkout: `CheckoutPricingMode`, `AmountCheckoutPolicy`/`QuantityCheckoutPolicy` (+ schemas),
  `assertAmountCheckoutPolicy`, `assertQuantityCheckoutPolicy`, `assertCheckoutAmount`,
  `chargeAmountMinor`, `CreateCheckoutBody` (`planSku`) / `CreateCheckoutResponse` (+ schemas),
  `PortalFlow`, `PortalLinkBody` / `PortalLinkResponse` (+ schemas).
- Entitlement grammar: `ENTITLEMENT_GATE`, `LIMIT_GATE`, `CAPABILITY_FEATURE_SCOPE`,
  `CAPABILITY_LIMIT_SCOPE`, `entitled`, `parseEntitlementParam`, `formatEntitlementParam`,
  `hasEntitlement`, `entitlementList`, `parseLimitParam`, `formatLimitParam`.
- Statuses: `SubscriptionStatus` (incl. `PastDue`), `ENTITLING_STATUSES`, `TERMINAL_STATUSES`,
  `INTERNAL_PAYGATE`.
- Limits and promos: `LimitKind`, `LimitWindow`, `LimitDeclaration`, `PlanCapability`,
  `PromoDeclaration` (+ schemas), `windowKeyOf`, `windowBoundsOf`, `LIFETIME_WINDOW`,
  `OCCUPANCY_WINDOW`, `promoActive`, `promoViewOf`.
- Views: `EntitlementView`, `EntitlementPlanView`, `CapabilityView`, `LimitView`, `PromoView`,
  `LimitUsage` (+ wire schemas), `capabilityViewsOf`, `limitViewsOf`, `entitlementViewOf`,
  `reviveEntitlementView`, `capabilityOf`, `limitOf`, `hasLimitRoom`.
- Errors: `EntitlementRefusal` → `CapabilityRequired`, `LimitExhausted` (all `AuthForbidden`);
  `PaymentError` family incl. `LimitUnknown`, `LimitMisdeclared`, `PlanRequired`,
  `PlanRankConflict`, `WebhookSetupError`, `PortalUnavailable` (declares `httpStatus = 409`, so an
  HTTP boundary answers 409; the other faults answer 500). Messages are registered under
  `errors.<type>` in seven languages.

## Common pitfalls

- A limit parameter is never a capability: `hasEntitlement(sets, 'limit:x')` is always `false`.
- A view's dates are ISO strings on the wire — revive before calling date methods.
- A promo ends AT `until`; grandfathering needs the subscription's creation date on the plan view.
- A refusal's fields survive a hop only through its message; catch the class, not the text.

## Related Packages

- `@owlmeans/server-payment` — Stripe gateway, subscription store, usage ledger and the two gates
- `@owlmeans/client-payment` — browser-side catalogue service
- `@owlmeans/web-payment` — React hooks and pieces over the entitlement view

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.28
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
