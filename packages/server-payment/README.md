# @owlmeans/server-payment

Public server-side payment primitives for OwlMeans applications. The package registers payment
resources, the entitlement gate, protocol-bound webhook/resync entrypoints, and a Stripe gateway
supporting amount-priced consumables, quantity-priced consumables, and subscriptions.

Applications declare products and plans during configuration, mount `paymentGateEntrypoints`, and
register completion callbacks on the payment observer. Amount policies are validated at declaration
time. Stripe Checkout is always authoritative: completion is idempotent by session id and an
amount checkout is fulfilled only after its paid currency and subtotal match its signed-in metadata.

```typescript
import { CheckoutPricingMode, PlanDuration, ProductType } from '@owlmeans/payment'
import {
  appendPaymentGatewayService, declarePaymentPlan, declarePaymentProduct, observer,
} from '@owlmeans/server-payment'

declarePaymentProduct(cfg, {
  sku: 'app-credits', type: ProductType.Consumable, services: ['app'], gateways: ['stripe'],
  name: 'Credits',
})
declarePaymentPlan(cfg, {
  productSku: 'app-credits', sku: 'app-credit-unit', duration: PlanDuration.Consumable,
  price: 0.02, pricingMode: CheckoutPricingMode.Amount,
  amountPolicy: {
    currency: 'usd', minimumMinor: 500, maximumMinor: 50_000, defaultMinor: 1_000,
    presetsMinor: [1_000, 2_000, 5_000, 10_000], fixedMinor: 0, rateBps: 200,
  },
})

appendPaymentGatewayService(context)
observer(context).onTopUp(async completion => {
  if (completion.mode === 'amount') await credit(completion.entityId, completion.amountMinor)
})
```

Mount `paymentGateEntrypoints` in the server entrypoint list. `gateway(context).createLink(...)`
accepts the stable organization `entityId` only after the application has resolved it at its
authenticated boundary; public protocol bodies use `entitySlug`.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.17
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
