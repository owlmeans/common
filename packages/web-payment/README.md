# @owlmeans/web-payment

Public React payment hooks and an amount-checkout dialog for OwlMeans applications. Entrypoint
hooks accept protocol-bound `RegisteredEntrypoint` values. The dialog consumes shadcn primitives
through the application's `@/components/ui/*` aliases and uses semantic theme tokens only.

Add this package's source to Tailwind v4 scanning when consuming source directly:

```css
@source "../../node_modules/@owlmeans/web-payment/src";
```

```tsx
const { checkout, pending } = useCheckout()

<AmountCheckoutDialog
  open={open}
  onOpenChange={setOpen}
  policy={balance.topUpPolicy}
  pending={pending}
  onConfirm={amountMinor => checkout(ctx.entrypoint(account.topUp), {
    body: { amountMinor },
  })}
/>
```

Checkout redirects the current window by default; pass `useCheckout('_blank')` only when a new tab
is intentional. The dialog uses the consumer's `@/components/ui/*` primitives, semantic theme
tokens, integer minor units, and the packaged seven-language `web-payment` resource.

## Entitlements

`useEntitlementView(ctx.entrypoint(account.entitlements))` polls a served `EntitlementView` and
revives its ISO dates; `null` means "not known yet", so render paid controls disabled until it
answers. Read it with `useCapability(view, param)` (`boolean | null`) and `useLimit(view, key)`
(the limit row plus `exhausted` and a `ratio` clamped to `[0, 1]`). An application that keeps the
view in its own store uses the pure selectors instead — `capabilityStateOf`, `limitStatusOf`,
`planStatusLineOf`, `promoInscriptionOf` — and never polls a second time.

```tsx
const view = useEntitlementView(ctx.entrypoint(account.entitlements))
const seats = useLimit(view, 'seats')
const { portal, pending } = usePortal(PortalFlow.Change)

{view != null && <>
  <PlanCard plan={view.plan} offer={{ sku: 'pro-monthly', title: 'Pro', priceLabel: '$20 / month' }}
    actionLabel="Change plan" pending={pending}
    onAction={planSku => portal(ctx.entrypoint(account.portal), { body: { planSku } })} />
  {seats != null && <LimitMeter limit={seats} label="Seats" />}
  <CapabilityList capabilities={view.capabilities} labels={{ 'feature:whitelabel': 'White label' }} />
</>}
```

`usePortal(flow)` sets `body.flow` on a protocol whose body is a `PortalLinkBody` and sends the
browser to the returned URL. The pieces take data and callbacks only: titles, prices, labels and
action copy come from the application; status lines, "N of M", reset dates and promo inscriptions
come from the packaged `entitlement` strings. They import `@/components/ui/{card,progress,button}`,
so the consumer provides those primitives and `@radix-ui/react-progress`.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.33
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
