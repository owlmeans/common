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
