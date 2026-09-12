---
name: web-payment
description: Public React payment UI for OwlMeans web apps — protocol-bound checkout/balance hooks, same-window redirects, entitlement helpers and the themed AmountCheckoutDialog. Use when building payment UI with @owlmeans/web-payment.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-payment

**Install:** `bun add @owlmeans/web-payment@^0.1.18-rc.2`

Public MIT web package paired with `@owlmeans/server-payment`. It incorporates checkout, balance,
entitlement and shallow-auth helpers over the underlying `@owlmeans/client-payment` service.

Hooks accept `RegisteredEntrypoint<Request, Response>` values. Pass `ctx.entrypoint(protocol)`;
never weaken a protocol to a home-grown callable type or recover its I/O with a generic. Checkout
arguments use the protocol's `CallArguments`, so a required body cannot be omitted by the hook.

```typescript
const { checkout, pending } = useCheckout() // same-window by default
await checkout(ctx.entrypoint(account.topUp), { body: { amountMinor } })
```

`useCheckout('_blank')` is the explicit new-tab variant. `openCheckout(url)` defaults to
`window.location.assign`; both are inert when no DOM exists. `usePaymentBalance` polls one protocol,
`useEntitlements` extracts its list, and `useEntitlement` uses the shared payment predicate. `null`
means not known and must render paid controls disabled.

## AmountCheckoutDialog

The dialog takes `{ open, onOpenChange, policy, pending, onConfirm }`. It keeps integer minor units,
accepts locale decimal separators and at most two decimals, shows configured presets plus custom
input, and reports below/above-bound errors without clamping. Confirmation is disabled when invalid
or pending.

It shows net credit value, processing adjustment and pre-tax subtotal from `chargeAmountMinor`, plus
the note that Stripe calculates applicable tax. The policy maximum bounds net credit, not the
adjusted or tax-inclusive debit.

The component imports the consuming app's shadcn primitives from
`@/components/ui/{dialog,input,label,button}` and uses semantic theme tokens. The package carries
standalone copies under `src/@` only so its own build/tests resolve the same alias contract. A
Tailwind v4 consumer scanning package source adds:

```css
@source "../../node_modules/@owlmeans/web-payment/src";
```

All visible strings live in the `web-payment` library resource and must stay present in all seven
languages: `en pl ru be uk es de`.
