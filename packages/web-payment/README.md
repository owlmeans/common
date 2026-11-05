# @owlmeans/web-payment

Public React payment hooks and an amount-checkout dialog for OwlMeans web applications. Entrypoint
hooks accept protocol-bound `RegisteredEntrypoint` values. The dialog consumes shadcn primitives
through the application's `@/components/ui/*` aliases and uses semantic theme tokens only. A web app
uses it for credit top-ups, plan and limit displays over the organization entity's entitlement view,
live tax estimates and, on the `./consumer` subpath, the EU consumer-rights dialogs and forms. It
does not decide entitlements or talk to the payment provider: the contracts are `@owlmeans/payment`,
the client service is `@owlmeans/client-payment` and the server half is `@owlmeans/server-payment`.

## Installation

```bash
bun add @owlmeans/web-payment@^0.1.21
```

Peer dependencies: `react`, `react-dom`, `tailwindcss`, `tailwind-merge`, `clsx`,
`class-variance-authority`, `@radix-ui/react-dialog`, `@radix-ui/react-label`,
`@radix-ui/react-select`, `@radix-ui/react-slot`, `@radix-ui/react-progress`, and
`@radix-ui/react-checkbox` when the app imports `@owlmeans/web-payment/consumer`.

### Setup

Components import the consuming app's shadcn primitives through the app alias:
`@/components/ui/{button,dialog,input,label,select}` for the dialog and the estimate,
`@/components/ui/{card,progress,button}` for the entitlement pieces, and `@/components/ui/checkbox`
only from `./consumer`. The application provides those files. Styling uses semantic theme tokens
only (`primary`, `muted-foreground`, `destructive`, `border`, `card`).

Add this package's source to Tailwind v4 scanning when consuming source directly:

```css
@source "../../node_modules/@owlmeans/web-payment/src";
```

## Concepts

- **Protocol-bound hooks** — every hook takes `ctx.entrypoint(protocol)`, a
  `RegisteredEntrypoint<Request, Response>`, and the protocol's own `CallArguments`, so a required
  body cannot be omitted.
- **Same-window redirects** — checkout and portal hooks send the current window to the returned URL
  by default; `'_blank'` is the explicit new-tab variant. Without a DOM the navigation is inert and
  the response is still returned.
- **Amount checkout dialog** — integer minor units, locale decimal separators with at most two
  decimals, configured presets plus a custom input, below/above-bound errors without clamping, and
  the net credit, processing adjustment and pre-tax subtotal. A `limit` narrows the policy with the
  same computation the server refuses with; an `estimate` adds a live tax/currency read.
- **Entitlements** — the polled `EntitlementView` is `null` until known, and `null` renders paid
  controls disabled. One poller per view: an app that keeps the view in its own store reads it
  through the pure selectors.
- **Pieces take data and callbacks only** — titles, prices, labels and action copy come from the
  application; status lines, "N of M", reset dates and promo inscriptions come from the package.
- **Strings** — every visible interface string lives in the packaged eight-language `web-payment`
  library resource (`WEB_PAYMENT_RESOURCE`), registered on import.
- **`./consumer`** — a separate subpath with the EU consumer-rights pieces (spend consent,
  subscription start, withdrawal and cancellation functions, the consent gate), so an app that never
  renders them needs neither their checkbox primitive nor its peer.

## Usage

### 1. Top up credits

```tsx
import { AmountCheckoutDialog, useCheckout } from '@owlmeans/web-payment'

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
tokens, integer minor units, and the packaged `web-payment` resource. `usePaymentBalance(entry,
intervalMs?, deps?)` polls a balance protocol and keeps the last good answer.

### 2. Narrow by limit and estimate tax

```tsx
import { AmountCheckoutDialog, usePriceEstimate } from '@owlmeans/web-payment'

const estimate = usePriceEstimate(ctx.entrypoint(account.priceEstimate), { enabled: open })

<AmountCheckoutDialog
  open={open} onOpenChange={setOpen} pending={pending}
  policy={amountView.policy} limit={amountView.limit}
  estimate={estimate}
  legalNote={withdrawalNote}
  onConfirm={(amountMinor, country) => checkout(ctx.entrypoint(account.topUp), {
    body: { amountMinor, country },
  })}
/>
```

`limit` hides presets above the maximum, clamps the default and shows a `CheckoutLimitNote`; a
`blocked` limit disables the input and the confirm button. `usePriceEstimate` fetches only while
`enabled`, caches per protocol alias, body and country, preselects the buyer's own country once, and
adopts a locked billing country over any pick. Several estimates sharing one picker (a plan
comparison table) pass `{ enabled, country, onCountryChange }`, render `CountrySelect` once and one
`PriceEstimateAmount` per offer.

### 3. Entitlements

`useEntitlementView(ctx.entrypoint(account.entitlements))` polls a served `EntitlementView` and
revives its ISO dates; `null` means "not known yet", so render paid controls disabled until it
answers. Read it with `useCapability(view, param)` (`boolean | null`) and `useLimit(view, key)`
(the limit row plus `exhausted` and a `ratio` clamped to `[0, 1]`). An application that keeps the
view in its own store uses the pure selectors instead — `entitlementSelectorHelper`'s
`capabilityStateOf`, `limitStatusOf`, `planStatusLineOf`, `promoInscriptionOf` — and never polls a
second time.

```tsx
import { PortalFlow } from '@owlmeans/payment'
import {
  CapabilityList, LimitMeter, PlanCard, useEntitlementView, useLimit, usePortal,
} from '@owlmeans/web-payment'

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

### 4. Gate spending on consent (`./consumer`)

```tsx
import { makeConsumerRightsProtocols } from '@owlmeans/payment'
import { PerformanceConsentProvider, useConsentGate } from '@owlmeans/web-payment/consumer'

<PerformanceConsentProvider view={ctx.entrypoint(rights.consent)} record={ctx.entrypoint(rights.giveConsent)}>
  <App />
</PerformanceConsentProvider>

// in a component
const { withConsent } = useConsentGate()
await withConsent(() => ctx.entrypoint(api.runTask).call({ body }))
```

The provider renders one spend-consent dialog for the whole app. `withConsent(action)` runs the
action and, on a spend-consent refusal, asks and retries exactly once; a decline throws
`ConsentDeclined`. Outside a provider the gate passes through.

## API

| Export | Kind | Purpose |
|---|---|---|
| `useCheckout(target?)` | hook | `{ checkout(entry, ...args), pending }` — calls a checkout protocol, then opens its `url` |
| `usePaymentBalance(entry, intervalMs?, deps?)` | hook | Polled protocol answer (default 60 s); `null` until the first success; failures swallowed |
| `openCheckout(url, target?)` | function | `window.location.assign` by default, `window.open` with `noopener,noreferrer` for `'_blank'` |
| `makePaymentService`, `appendPaymentService`, `PaymentService` | function / type | Re-exported from `@owlmeans/client-payment` |
| `AmountCheckoutDialog` | component | Amount top-up dialog: `open`, `onOpenChange`, `policy`, `onConfirm(amountMinor, country?)`, `pending?`, `disabled?`, `estimate?`, `limit?`, `legalNote?`, `details?` |
| `CheckoutLimitNote` | component | What the checkout is narrowed to now, why, and when it rises again; nothing when nothing narrowed |
| `usePriceEstimate(entry, opts, ...request)` | hook | Live `PriceEstimateControl` for a `PriceEstimateBody` protocol |
| `isLockedAnswer(estimate)` | function | Whether an estimate is for a locked billing country (`locked` or `source: 'profile'`) |
| `CountrySelect` | component | The billing-country picker alone, in the viewer's language |
| `PriceEstimateAmount` | component | Rate, estimated total and status sentence for a subtotal, no picker |
| `PriceEstimateSummary` | component | `CountrySelect` + `PriceEstimateAmount` bound to one control |
| `useEntitlementView(entry, intervalMs?, deps?, ...request)` | hook | Polled, revived `EntitlementView`; `null` until known |
| `useCapability(view, param)` | hook | `boolean \| null` |
| `useLimit(view, key)` | hook | `LimitStatus \| null` |
| `usePortal(flow, target?)` | hook | `{ portal(entry, request?), pending }` — billing-portal flow with `body.flow` set |
| `PlanCard` | component | A plan or offer with status line, current badge, price label and one action |
| `LimitMeter` | component | Usage of one limit, progress bar, reset date, promo inscription |
| `CapabilityList` | component | Labelled capabilities, granted or muted |
| `entitlementSelectorHelper`, `createEntitlementSelectorHelper()` | object / factory | `capabilityStateOf`, `limitStatusOf`, `planStatusLineOf`, `promoInscriptionOf` |
| `capabilityStateOf`, `limitStatusOf`, `planStatusLineOf`, `promoInscriptionOf` | function | Deprecated aliases of the helper's methods |
| `amountInputHelper`, `createAmountInputHelper()` | object / factory | `decimalSeparator`, `parseAmountMinor`, `inputAmount` for locale money inputs |
| `WEB_PAYMENT_RESOURCE` | const | `'web-payment'` — the library resource of every interface string |
| `AmountCheckoutDialogProps`, `CheckoutLimitNoteProps`, `PlanCardProps`, `LimitMeterProps`, `CapabilityListProps`, `CountrySelectProps`, `PriceEstimateAmountProps`, `PriceEstimateSummaryProps` | type | Component props |
| `PriceEstimateControl`, `UsePriceEstimateOptions`, `PriceEstimateRequest`, `PriceEstimateArguments` | type | Price-estimate hook types |
| `PortalRequest`, `PortalArguments`, `CheckoutTarget`, `CheckoutResult` | type | Checkout and portal call types |
| `LimitStatus`, `PlanStatusLine`, `PlanStatusLineKind`, `PlanStatusTone`, `PromoInscription`, `PlanOffer`, `EntitlementCopy` | type | Entitlement read-model types |
| `AmountInputHelper`, `FormatHelper`, `EntitlementSelectorHelper` | type | Helper contracts |

### `@owlmeans/web-payment/consumer`

| Export | Kind | Purpose |
|---|---|---|
| `PerformanceConsentDialog`, `SubscriptionStartDialog` | component | Spend consent and subscription-start statements, unchecked by default |
| `WithdrawalFunctionButton`, `WithdrawalForm`, `WithdrawalDialog`, `CancellationForm` | component | Statutory withdrawal and cancellation functions with review and receipt steps |
| `LanguageToggle`, `LegalLinks`, `linksFor`, `useShownLanguage`, `useUiLanguage` | component / hook | Contract language vs interface language, legal links |
| `usePerformanceConsent`, `useSubscriptionStart`, `useWithdrawal`, `useCancellation` | hook | Protocol-bound controls for the pieces above |
| `PerformanceConsentProvider`, `useConsentGate` | component / hook | One consent dialog per app and its `ensure` / `withConsent` gate |
| `makeAsker`, `makeConsentGate`, `passThroughGate` | function / const | The React-free asking state machine and gate |
| `consentRefusalHelper`, `consentRefusalKindOf`, `isPerformanceConsentRefusal`, `ConsentDeclined` | object / function / class | Recognising consent refusals and declines |
| `fixedTextHelper`, `paymentTextOf`, `legalTextOf`, `usePaymentText`, `useLegalText` | object / function / hook | Interface and legal text in any language |
| `Field`, `Choice`, `Honeypot`, `isEmail`, `EMAIL_PATTERN` | component / function / const | Form building blocks |

## Common pitfalls

- Do not wrap a protocol in a home-grown callable type; pass `ctx.entrypoint(protocol)` so the
  protocol's `CallArguments` stay enforced.
- `null` from the entitlement hooks means unknown, not denied — render paid controls disabled, never
  enabled-then-refused.
- A second `useEntitlementView` for a view the app already stores doubles the polling; use
  `entitlementSelectorHelper` instead.
- A view fetched some other way must be revived before its dates are used.
- The caller's arguments to `usePortal` and `usePriceEstimate` omit `body.flow` and `body.country`;
  the hooks own them.
- The policy maximum bounds net credit, not the adjusted or tax-inclusive debit.
- `AmountCheckoutDialog` scrolls its body; never render the confirm button outside it.
- A missing `@/components/ui/*` file or Radix peer fails the consumer's build, not this package's;
  the copies under `src/@` exist only for this package's own build and tests and are never exported.
- `WithdrawalDialog` does not clear the receipt the application holds — reset it on close.

## Related packages

- [`@owlmeans/payment`](../payment) — contracts, entitlement view, `PortalFlow`, consumer-rights protocols and legal copy
- [`@owlmeans/client-payment`](../client-payment) — the client payment service
- [`@owlmeans/server-payment`](../server-payment) — the server half these protocols call
- [`@owlmeans/client-i18n`](../client-i18n) — `useI18nLib` and `useLanguage` the pieces read
- [`@owlmeans/web-panel`](../web-panel) — the shadcn + Tailwind v4 web shell

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.21
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
