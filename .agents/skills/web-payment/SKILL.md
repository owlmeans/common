---
name: web-payment
description: Public React payment UI for OwlMeans web apps — protocol-bound checkout/balance hooks, same-window redirects, entitlement helpers and the themed AmountCheckoutDialog. Use when building payment UI with @owlmeans/web-payment.
user-invocable: false
---

# @owlmeans/web-payment

**Install:** `bun add @owlmeans/web-payment@^0.1.18-rc.11`

Public MIT web package paired with `@owlmeans/server-payment`. It incorporates checkout, balance,
entitlement and shallow-auth helpers over the underlying `@owlmeans/client-payment` service, plus
presentational pieces over the entitlement view of `@owlmeans/payment` (the model itself is the
`entitlements` skill).

## Protocol-bound hooks

Hooks accept `RegisteredEntrypoint<Request, Response>` values. Pass `ctx.entrypoint(protocol)`;
never weaken a protocol to a home-grown callable type or recover its I/O with a generic. Call
arguments use the protocol's `CallArguments`, so a required body cannot be omitted by the hook.

```typescript
const { checkout, pending } = useCheckout() // same-window by default
await checkout(ctx.entrypoint(account.topUp), { body: { amountMinor } })
```

- `useCheckout('_blank')` is the explicit new-tab variant. `openCheckout(url)` defaults to
  `window.location.assign`; both are inert when no DOM exists.
- `usePaymentBalance(entry, intervalMs?, deps?)` polls one protocol and keeps the last good answer;
  a failed poll is swallowed, because explicit actions own their errors.

## Entitlement hooks — `null` means unknown

| Hook | Answers |
|---|---|
| `useEntitlementView(entry, intervalMs = 60_000, deps = [], ...request)` | The polled `EntitlementView`, revived (`reviveEntitlementView`) so every date is a `Date`; `null` until the first answer. Trailing `request` arguments are the protocol's `CallArguments`. |
| `useCapability(view, param)` | `boolean \| null` — the capability predicate over granted rows; `null` for a null view. |
| `useLimit(view, key)` | `LimitStatus \| null` — the `LimitView` plus `exhausted` and `ratio`; `null` for a null view or an undeclared key. |
| `usePortal(flow, target = '_self')` | `{ portal(entry, request?), pending }` — calls a protocol whose body is a `PortalLinkBody` with `body.flow = flow`, then `openCheckout(url, target)`. The caller's arguments omit `flow` (a compile error otherwise); navigation is inert without a DOM. |

- **`null` renders paid controls disabled**, never enabled-then-refused. A `false` is an answer;
  `null` is the absence of one.
- **One poller per view.** An application that keeps the view in its own store (fed once, refreshed
  after the actions that change it) reads it through the pure selectors, not a second
  `useEntitlementView`.
- Anything read off a view fetched some other way must be revived before a date is used.

## Pure selectors

| Selector | Returns |
|---|---|
| `capabilityStateOf(view, param)` | `boolean \| null` — what `useCapability` memoizes |
| `limitStatusOf(limitView)` | `LimitStatus \| null` — `exhausted = remaining < 1` (a `limit: 0` row is exhausted); `ratio = used / limit` clamped to `[0, 1]`, and for a `0` ceiling `1` once anything is used, else `0` |
| `planStatusLineOf(planView)` | `{ kind, tone, date? }` — first match: `created`/`canceled`/`expired`/`ended` (inactive), `blocked` (critical), `paused` (a `pausedAt`, warning), `suspended` (critical), `trial` (`trialEnd`), `past-due` (warning), `cancel-scheduled` (`periodEnd`, warning), `free`, `renews` (`periodEnd`), `active` |
| `promoInscriptionOf(promoView)` | `'free-until'` (active, not grandfathered) · `'grandfathered'` (active, grandfathered) · `'ended'` (inactive) · `null` |

Use these, plus `capabilityOf` / `limitOf` / `hasLimitRoom` from `@owlmeans/payment`, wherever the
browser decides something; the server gate uses the same predicates, so a disabled button and a
403 cannot disagree.

## Pieces

Pieces take data and callbacks only — no protocol calls, no product copy (titles, prices, labels
and action text come from the application). Every one accepts `className`.

| Piece | Props | Renders |
|---|---|---|
| `PlanCard` | `plan: EntitlementPlanView`, `offer?: { sku, title, priceLabel, highlight? }`, `current?`, `pending?`, `actionLabel?`, `onAction?(sku)`, `children?` | Title; the status line (with a tone dot) for the entity's own plan, or for an offer only when it is current; a "Current plan" badge; `priceLabel`; children; one action button (outline when current, disabled while `pending`). `current` defaults to `offer.sku === plan.sku`. |
| `LimitMeter` | `limit: LimitView`, `label`, `showReset? = true`, `compact?` | `used of limit` (with `unit`), a `Progress` bar, "Limit reached" when exhausted, "Resets on …" for a window limit, the promo inscription. `limit: 0` reads "Not included" and draws no bar. |
| `CapabilityList` | `capabilities: CapabilityView[]`, `labels: Record<param, string>`, `onlyGranted?` | One row per labelled param in view order (duplicate params collapse, granted wins); unlabelled rows are not rendered; ungranted rows are muted; promo inscription under the label. |

- **Stable selectors** for tests and styling: `[data-plan-card]` with `data-plan-sku`,
  `data-plan-status` (the line kind), `data-plan-tone`, `data-current`; `[data-plan-status-line]`,
  `[data-plan-current]`, `[data-plan-price]`; `[data-limit-meter]` with `data-limit-key`,
  `data-limit-kind`, `data-included`, `data-exhausted`, and `[data-limit-usage]`,
  `[data-limit-resets]`, `[data-limit-exhausted]`; `[data-capability-list]`, `[data-capability]`
  with `data-granted`; `[data-promo]` carrying the inscription kind.
- **Dates render as calendar UTC days** (`dateStyle: 'medium'`) in the current language — the
  calendar limit windows count in, so a reset date names the day the counter rolls.
- Promo copy: "Free until {{date}}", "Included for your plan", "Promotion ended".

## AmountCheckoutDialog

The dialog takes `{ open, onOpenChange, policy, pending, onConfirm }`. It keeps integer minor units,
accepts locale decimal separators and at most two decimals, shows configured presets plus custom
input, and reports below/above-bound errors without clamping. Confirmation is disabled when invalid
or pending.

It shows net credit value, processing adjustment and pre-tax subtotal from `chargeAmountMinor`, plus
the note that Stripe calculates applicable tax. The policy maximum bounds net credit, not the
adjusted or tax-inclusive debit.

## The `@/components/ui/*` contract

Components import the consuming app's shadcn primitives through the app alias:
`@/components/ui/{button,dialog,input,label}` for the dialog and
`@/components/ui/{card,progress,button}` for the pieces (`Card`, `CardHeader`, `CardTitle`,
`CardDescription`, `CardContent`, `CardFooter`, `Progress`). The consumer therefore provides those
files and the peer `@radix-ui/react-progress` beside the dialog's Radix peers. The package carries
standalone copies under `src/@` only so its own build and tests resolve the same alias; they are
never exported. Styling uses semantic theme tokens only (`primary`, `muted-foreground`,
`destructive`, `border`, `card`).

A Tailwind v4 consumer scanning package source adds:

```css
@source "../../node_modules/@owlmeans/web-payment/src";
```

## Strings

All visible strings live in the `web-payment` library resource (`lib` namespace) in all seven
languages — `en pl ru be uk es de` — under two branches: `amount-checkout` and `entitlement`
(`plan`, `status`, `limit`, `promo`, `capability`). A new key lands in every language at once, with
the same `{{placeholders}}`; the parity spec walks the resources recursively. An application
overrides a string with `addI18nApp(lng, 'web-payment', data, { ns: LIB_NAMESPACE })`.

## Tests

Category D plus unit specs: `bun test ./tests` runs the selector and hook specs (hooks rendered with
`react-dom/server`, a fake `window` for navigation) and drives chromium through the Vite harness,
which picks a surface by `?case=` (none = the dialog, `pieces`, `hook`). The harness pre-bundles
every runtime dependency in `optimizeDeps.include`; one discovered mid-navigation loads a second
React and the page throws "Invalid hook call".
