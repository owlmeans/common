---
name: web-payment
description: Public React payment UI for OwlMeans web apps — protocol-bound checkout/balance hooks, same-window redirects, entitlement helpers, the themed AmountCheckoutDialog with its per-entity checkout limit, the locked-country price estimate, and the EU consumer-rights pieces of the ./consumer subpath (spend consent, subscription start, withdrawal and cancellation functions, the consent gate). Use when building payment UI with @owlmeans/web-payment.
user-invocable: false
---

# @owlmeans/web-payment

**Install:** `bun add @owlmeans/web-payment@^0.1.18-rc.21`

Public MIT web package paired with `@owlmeans/server-payment`. It incorporates checkout, balance,
entitlement and shallow-auth helpers over the underlying `@owlmeans/client-payment` service, plus
presentational pieces over the entitlement view of `@owlmeans/payment` (the model itself is the
`entitlements` skill), and — on the `./consumer` subpath — the consumer-rights pieces over
`@owlmeans/payment`'s consumer-rights contracts and legal copy (the `payment` skill).

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
| `CheckoutLimitNote` | `limit: CheckoutLimitView \| null`, `reasonLabel?: string \| (reason) => string` | Nothing for `null` or a limit that narrowed nothing; else "You can add up to {max} right now" (or "You cannot add credits right now" when `blocked`), the reason's sentence (`per-purchase`, `window`, `hold`, any other → generic; `reasonLabel` replaces it) and "More becomes available on {resetsAt}" (UTC, to the minute). |

- **Stable selectors** for tests and styling: `[data-plan-card]` with `data-plan-sku`,
  `data-plan-status` (the line kind), `data-plan-tone`, `data-current`; `[data-plan-status-line]`,
  `[data-plan-current]`, `[data-plan-price]`; `[data-limit-meter]` with `data-limit-key`,
  `data-limit-kind`, `data-included`, `data-exhausted`, and `[data-limit-usage]`,
  `[data-limit-resets]`, `[data-limit-exhausted]`; `[data-capability-list]`, `[data-capability]`
  with `data-granted`; `[data-promo]` carrying the inscription kind; `[data-checkout-limit]` with
  `data-max-minor`, `data-blocked` (`"true"`/`"false"`), `data-reason`, `data-resets-at` (ISO).
- **Dates render as calendar UTC days** (`dateStyle: 'medium'`) in the current language — the
  calendar limit windows count in, so a reset date names the day the counter rolls.
- Promo copy: "Free until {{date}}", "Included for your plan", "Promotion ended".

## AmountCheckoutDialog

The dialog takes `{ open, onOpenChange, policy, pending, onConfirm, estimate?, limit?, legalNote? }`.
It keeps integer minor units, accepts locale decimal separators and at most two decimals, shows
configured presets plus custom input, and reports below/above-bound errors without clamping.
Confirmation is disabled when invalid or pending.

It shows net credit value, processing adjustment and pre-tax subtotal from `chargeAmountMinor`.
With no `estimate`, the plain note that Stripe calculates applicable tax; with one, `PriceEstimateSummary`
renders instead (see below) against the SAME `chargeMinor`, so the country picker and its numbers
track whatever the buyer has typed. The policy maximum bounds net credit, not the adjusted or
tax-inclusive debit.

- **`limit`** (`AmountPolicyView.limit`, what the entity may buy NOW) narrows `policy` through
  `@owlmeans/payment`'s `narrowAmountPolicy` — the same computation the server refuses with
  (`CheckoutLimitExceeded`), so the control and a refusal cannot disagree. Presets above the
  maximum disappear, the default is clamped, the above-bound error names the narrowed maximum
  ("The most you can add right now is …"), and a `CheckoutLimitNote` shows above the presets.
  `policy` may be the plan's or one already narrowed (`AmountPolicyView.policy`) — narrowing is
  idempotent. **`blocked`** disables the presets, the input and the confirm button; the pinned
  policy `narrowAmountPolicy` returns for a block is never an offer of the minimum.
- **`legalNote`** is a slot right above the buttons for the application's legal line (the EU
  withdrawal note of a top-up, terms links) — `[data-legal-note]`.
- Selectors: `[data-amount-checkout]` (`data-blocked`), `[data-amount-preset="<minor>"]`,
  `[data-amount-confirm]`.

## Price estimate: a live tax/currency read for any amount

```typescript
// self-contained (one estimate, its own picker) — the credit dialog:
const estimate = usePriceEstimate(ctx.entrypoint(account.priceEstimate), { enabled: dialogOpen })
<AmountCheckoutDialog … estimate={estimate} />
<PriceEstimateSummary control={estimate} subtotalMinor={planPriceMinor} currency="usd" />

// shared (one picker, several estimates) — a plan comparison table:
const [country, setCountry] = useState('')
const pro = usePriceEstimate(entry, { enabled, country, onCountryChange: setCountry }, { body: { planSku: 'pro' } })
const team = usePriceEstimate(entry, { enabled, country, onCountryChange: setCountry }, { body: { planSku: 'team' } })
<CountrySelect value={country} onChange={setCountry} disabled={pro.locked} />   {/* rendered ONCE */}
<PriceEstimateAmount control={pro} subtotalMinor={proPriceMinor} currency="usd" />     {/* per offer */}
<PriceEstimateAmount control={team} subtotalMinor={teamPriceMinor} currency="usd" />
```

- **`usePriceEstimate(entry, { enabled, ttlMs?, country?, onCountryChange? }, ...request)`** calls a
  `PriceEstimateBody` protocol (`@owlmeans/payment`'s `PriceEstimate` response) only while `enabled`,
  and again whenever the country changes — a closed dialog costs nothing. A module-level client
  cache (keyed by the entry's alias, the request body and the country; default TTL 5 min) shares an
  answer across every mounted instance and never caches a rejected fetch. The caller's `request`
  omits `body.country` — the hook owns it — the same way `usePortal`'s omits `flow`.
  - **Uncontrolled** (no `opts.country`): the hook owns the country itself, and the first answer
    whose `source` is `'customer'` preselects it, once.
  - **Controlled** (`opts.country` given): the caller owns the country — several `usePriceEstimate`
    calls can share ONE value (a plan comparison table, one picker, one estimate per offer); the
    hook never preselects on its own, and the returned control's `onCountryChange` calls
    `opts.onCountryChange` instead of an internal setter.
  - **Locked** (an answer with `locked: true` or `source: 'profile'` — the entity's billing country
    fixed by its first purchase): the hook adopts that country over any pick (controlled: through
    `opts.onCountryChange`, once), returns `locked: true`, and ignores `onCountryChange` from then
    on (`isLockedAnswer(estimate)`).
- **`CountrySelect({ value, onChange, label?, id?, className?, disabled?, note? })`** is the picker
  alone — `Intl.DisplayNames` + `Intl.Collator` over `@owlmeans/payment`'s `COUNTRY_CODES`, so it
  lists the buyer's language's own country names. Render it once and drive every estimate that
  shares it. `disabled` (a locked country) disables it; `note` is a line under it. Selectors
  `[data-country-select]` with `data-locked` and `data-country`, `[data-country-note]`.
- **`PriceEstimateAmount({ control, subtotalMinor, currency, suffix?, className? })`** is the
  numbers alone, no picker: via `estimateOf` re-derived against `subtotalMinor`, a rate row for a
  `taxed` status, an estimated total, and one sentence for every status that leaves no number to
  trust (reverse charge, no tax, "at checkout", "choose a country"). `data-price-estimate` /
  `data-status` are stable test hooks.
  - When the estimate carries `local` (Adaptive Pricing found the country's currency), the tax and
    total show ONLY in that currency, each marked `≈` — never both currencies at once, which would
    read as two different prices for the same line. A short note explains the amount is converted
    at Stripe's current rate and confirmed at checkout. With no `local`, the amounts show in
    `currency` (the integration currency) with no `≈` and no note.
- **`PriceEstimateSummary`** is `CountrySelect` bound to the control's own `country`/
  `onCountryChange` followed by `PriceEstimateAmount` — the one-estimate composition. A `locked`
  control renders the picker disabled with the "set by your first purchase" note. Building a
  shared picker composes the two pieces separately instead, one `PriceEstimateAmount` per estimate.

## `./consumer` — the EU consumer-rights pieces

`import { … } from '@owlmeans/web-payment/consumer'` — a separate subpath, so an application that
never renders them needs neither their checkbox primitive nor its peer. Legal text comes from
`@owlmeans/payment`'s `payment-consumer-rights` copy (`consumerText`, `legalLabelsOf`,
`consentStatementOf` render the same strings the server records and mails); the interface text
comes from this package's `web-payment` resource. Neither carries product copy: the trader, the
plan title and the price line are the view's or the application's.

**The language rule.** A consent or statutory function is shown in the CONTRACT language — the
billing country's (`view.language`, `list.language`, the `language` prop) — with a toggle to the
interface language and back (`useShownLanguage`, `LanguageToggle`). The whole piece switches: the
legal copy through `legalTextOf(lng)`, the interface strings through `paymentTextOf(lng)` (both
read any language without i18next and without draining a bundle — `resolveI18nResource`), dates
and amounts through `Intl` in that language. The toggle alone is phrased in the INTERFACE language
("Show in German") — the reader who needs it reads that one. The links follow the shown language
(`links` prop: a record by language or a function such as `lng => linksOf(policy, lng)`; absent,
the view's own). What a person agrees to is what was on screen: toggling un-ticks the checkbox, and
the recorded body names the language shown.

| Piece | Props | Behaviour |
|---|---|---|
| `PerformanceConsentDialog` | `open, onOpenChange, view: PerformanceConsentView \| null, onConfirm(body: PerformanceConsentBody), onDecline?, uiLanguage?, pending?, error?, links?, onWithdraw?, formatAmount?` | Title and intro (count, last deadline), the purchases with date, amount and last withdrawal day (`performance-consent.purchase`), ONE checkbox carrying the whole statement (`performance-consent.checkbox` with `view.trader`), **unchecked by default**; confirm ("Start now" / "Jetzt beginnen" …) disabled until it is ticked; decline ("Not now"); links Billing Terms · Withdrawal information · the withdrawal function (a button when `onWithdraw`, else the links' `withdrawalFunction` page). `onConfirm` gets `{ purchaseIds, textVersion, language: <shown>, acknowledged: true, uiLanguage }`. |
| `SubscriptionStartDialog` | `open, onOpenChange, view: SubscriptionStartView \| null, planTitle, price?: ReactNode, onConfirm(body: SubscriptionStartBody), onDecline?, uiLanguage?, pending?, error?, links?, onWithdraw?` | The same shape before a subscription checkout; confirm is "Continue to payment" — the step before the paygate's own order button. |
| `WithdrawalFunctionButton` | `language, onClick, uiLanguage?, disabled?, variant? = 'outline'` | The statutory entry ("Withdraw from contract here", "Vertrag widerrufen", "Renoncer au contrat ici", "Odstąp od umowy tutaj") in the contract language; the interface language's label as `title` when they differ. |
| `WithdrawalForm` / `WithdrawalDialog` | `mode: 'in-app' \| 'public', language, onSubmit(body: WithdrawalBody), list?, defaults?, uiLanguage?, pending?, error?, receipt?, formatAmount?` (+ `open, onOpenChange` for the dialog; `onClose` for the form) | Three steps. **Form**: in-app a contract picker over `list.candidates` (bought, paid, last day, estimated refund), publicly a contract-reference field — plus name and e-mail, NOTHING else is asked (a public form also carries the honeypot). **Review**: the summary and the statutory confirm ("Confirm withdrawal", "Widerruf bestätigen", "Confirmer la rétractation", "Potwierdź odstąpienie od umowy"). **Receipt** (whenever `receipt` is set): the received sentence with date AND time in UTC, reference, status, refund. The dialog does not clear the receipt the application holds — reset it on close. |
| `CancellationForm` | `mode, language, onSubmit(body: CancellationBody), defaults?, uiLanguage?, pending?, error?, receipt?, onPrint?, onClose?` | **Form**: kind (ordinary / extraordinary — the reason becomes required), name, contract or customer reference, effective (earliest / a date from today), e-mail, and a honeypot. **Summary** with the statutory confirm ("Cancel now", "Jetzt kündigen", "Notification de la résiliation", "Wypowiedz teraz"). **Receipt**: received date and time in UTC, the effective date when known, status, a print button (`onPrint`, default `window.print()`). |

- `error` is `true` (the generic sentence in the shown language) or the application's own node — a
  `WithdrawalUnavailable` phrased by the app, say.
- **The honeypot** (`Honeypot`, internal): an input named `website`, off screen, `tabIndex={-1}`,
  inside `aria-hidden`; only a filled one is sent (`body.honeypot`), and the server answers a bot
  exactly like a person.
- **Bodies** carry `language` = the shown language; an in-app withdrawal sends `purchaseId` and
  `contractRef`, a public one `contractRef` only.

### Hooks — protocol-bound, from `makeConsumerRightsProtocols`

```ts
usePerformanceConsent(view: RegisteredEntrypoint<{}, PerformanceConsentView>,
  record: RegisteredEntrypoint<{ body: PerformanceConsentBody }, PerformanceConsentResponse>,
  opts?: { enabled?, uiLanguage?, links?, onWithdraw?, onRecorded?(response) })
  → { view, required: boolean | null, ensure(opts?: { force? }): Promise<boolean>, refresh(), dialog }
PerformanceConsentProvider({ view, record, options?, children })   // ONE dialog for the app
useConsentGate() → { ensure, withConsent<T>(action): Promise<T>, required }
useSubscriptionStart(start: RegisteredEntrypoint<{ query: { planSku } }, SubscriptionStartView>,
  requestStart: RegisteredEntrypoint<{ body: SubscriptionStartBody }, SubscriptionStartResponse>, opts?)
  → { ensure(planSku, { planTitle, price? }): Promise<string | null>, view, dialog }
useWithdrawal(withdrawals | null, withdraw, { enabled? }) → { list, load, submit, receipt, pending, error, reset, form }
useCancellation(cancel) → { submit, receipt, pending, error, reset, form }
```

- **`ensure()`** reads the view fresh: `true` when nothing is required, or once the consent was
  confirmed AND recorded; `false` on a decline or a closed dialog. A failed read answers `true` —
  the server's 428 stays the authority, and a flaky read never blocks work that needs no consent.
  Concurrent calls share ONE pending answer (a burst of clicks opens one dialog). A record refused
  with a 428 (a stale text version) reloads the view and keeps the dialog open.
- **`useSubscriptionStart().ensure`** answers the `startRequestId` to send with the checkout
  (`CreateCheckoutBody.startRequestId`), `''` when none is needed (or the read failed — the
  checkout's own refusal then decides), `null` on a decline.
- **`withConsent(action)`** runs the action; on a SPEND-consent refusal it asks with
  `ensure({ force: true })` and retries exactly ONCE. A decline throws `ConsentDeclined`
  (`isConsentDeclined`); a second refusal and every other failure propagate unchanged. Outside a
  provider the gate passes through (`ensure` → `true`, refusals propagate).
- The asking state machine is `makeAsker` and the gate `makeConsentGate` (pure, React-free).
- `dialog` / `form` objects are spread into ONE piece each; `form.error` is a boolean, the raw
  failure is `error`.

### Recognising a consent refusal

`isConsentRefusal(e)` — `consentRefusalOf(e) != null` (the class after the registry, or its marker
in `message`/`type`) OR `httpStatusOf(e) === 428` (`@owlmeans/api/status`: a production body is only
an incident id, so the status is all that is left). Read on the error AND on what it wraps —
`cause`, `error`, `original`, `originalError`, `inner`, `reason`, an aggregate's `errors`, and
strings — five levels deep with a cycle guard, so a planning `CommitFailed`
(`planning:commit-failed:<transition>:<the refusal's text>`) is recognised without depending on
planning. `consentRefusalKindOf(e)` → `'performance' | 'subscription-start' | 'unknown'` (a bare
428) `| null`; `isPerformanceConsentRefusal(e)` is what the gate retries on (performance or
unknown — never a subscription start).

### Selectors

| Piece | Selectors |
|---|---|
| Spend consent | `[data-consent-dialog]` (also `[data-performance-consent]`) with `data-language` (shown), `data-contract-language`, `data-text-version`; `[data-consent-purchase]` with `data-purchase-id`, `data-deadline` (ISO); `[data-consent-statement]`; `[data-consent-checkbox]` (Radix `data-state`); `[data-consent-confirm]`; `[data-consent-decline]`; `[data-consent-language-toggle]` (also `[data-language-toggle]` with `data-target-language`) |
| Legal links (both dialogs) | `[data-legal-links]`, `[data-legal-link="billing-terms" \| "withdrawal-information" \| "withdrawal-function"]` |
| Subscription start | `[data-start-dialog]` (also `[data-subscription-start]`) with `data-language`, `data-contract-language`, `data-plan-sku`; `[data-start-statement]`, `[data-start-price]`, `[data-start-checkbox]`, `[data-start-confirm]`, `[data-start-decline]`, `[data-start-language-toggle]` |
| Withdrawal | `[data-withdrawal-function]` (`data-language`); `[data-withdrawal-dialog]` (`data-language`, `data-step`); `[data-withdrawal-form]` with `data-withdrawal-step="form\|review\|receipt"` (also `data-step`, `data-mode`, `data-language`); `[data-withdrawal-candidate]` (`data-purchase-id`, `data-contract-ref`) and its radio `[data-withdrawal-candidate-input="<purchaseId>"]`; `[data-withdrawal-estimate]` (`data-refund-minor`); `[data-withdrawal-field="contract\|name\|email"]`; `[data-withdrawal-continue]`, `[data-withdrawal-back]`, `[data-withdrawal-confirm]`; `[data-withdrawal-receipt]` (`data-status`, `data-declaration-id`, `data-received-at`), `[data-withdrawal-reference]`, `[data-withdrawal-received-at]`, `[data-withdrawal-refund]`; `[data-withdrawal-language-toggle]` |
| Cancellation | `[data-cancellation-form]` with `data-cancellation-step="form\|review\|receipt"` (also `data-step`, `data-mode`, `data-language`); `[data-cancellation-field="kind\|reason\|name\|contract\|effective\|date\|email"]` (kind radios carry `data-kind`, effective radios `data-effective`); `[data-cancellation-continue]`, `[data-cancellation-back]`, `[data-cancellation-confirm]`, `[data-cancellation-summary]`; `[data-cancellation-receipt]` (`data-status`, `data-declaration-id`, `data-received-at`, `data-effective-at`), `[data-cancellation-effective]`, `[data-cancellation-print]`; `[data-cancellation-language-toggle]` |
| Honeypot | `[data-honeypot]` |

## The `@/components/ui/*` contract

Components import the consuming app's shadcn primitives through the app alias:
`@/components/ui/{button,dialog,input,label,select}` for the dialog and estimate summary,
`@/components/ui/{card,progress,button}` for the pieces (`Card`, `CardHeader`, `CardTitle`,
`CardDescription`, `CardContent`, `CardFooter`, `Progress`), and — **only from `./consumer`** —
`@/components/ui/checkbox` (`export { Checkbox }` with the Radix Root props, the stock shadcn file).
The consumer therefore provides those files and the peers `@radix-ui/react-progress` /
`@radix-ui/react-select` beside the dialog's Radix ones, plus `@radix-ui/react-checkbox` when it
imports `./consumer`. The package carries standalone copies under `src/@` only so its own build and
tests resolve the same alias; they are never exported (its checkbox draws an inline SVG check, no
icon library). Styling uses semantic theme tokens only (`primary`, `muted-foreground`,
`destructive`, `border`, `card`).

A Tailwind v4 consumer scanning package source adds:

```css
@source "../../node_modules/@owlmeans/web-payment/src";
```

## Strings

All visible interface strings live in the `web-payment` library resource (`lib` namespace,
`WEB_PAYMENT_RESOURCE`) in all eight languages — `en pl ru be uk es de fr` — under
`amount-checkout` (incl. `above-limit`), `checkout-limit` (`note`, `blocked`, `resets`,
`reason.{per-purchase,window,hold,other}`), `entitlement` (`plan`, `status`, `limit`, `promo`,
`capability`), `estimate` (`country`, `country-locked`, `tax-type`, `rate`, `total`,
`converted-note`, `status`, `loading`, `failed`), and for `./consumer`: `consumer` (toggle, steps,
receipt labels, validation), `withdrawal` (candidate lines, estimate, kinds, `status.*`) and
`cancellation` (`effective-at`, `status.*`). The legal copy is NOT here — it is `@owlmeans/payment`'s.

- A new key lands in every language at once, with the same `{{placeholders}}`; the parity spec
  walks the resources recursively and scans every language for the forbidden wording (never
  "non-refundable" or a translation of it: the right of withdrawal EXPIRES for what was used, and
  unused credits ARE reimbursed). Every `WithdrawalStatus`, `CancellationStatus` (incl. `review` —
  extraordinary and unmatched public cancellations) and `PurchaseKind` value has its string; the
  spec iterates the enums, so a new status fails it until all eight languages phrase it.
- The last withdrawal day shown anywhere is `@owlmeans/payment`'s `lastWithdrawalDayOf(deadline)`
  (the deadline is exclusive), formatted as a UTC date — the rule the server's e-mails use.
- The `consumer`/`withdrawal`/`cancellation` branches take the register of the legal copy they sit
  beside (de and es formal, like `payment-consumer-rights`), while `amount-checkout` and
  `checkout-limit` keep the dialog's.
- An application overrides a string with `addI18nApp(lng, 'web-payment', data, { ns: LIB_NAMESPACE })`
  — `paymentTextOf` reads that override too.

## Tests

Category D plus unit specs: `bun test ./tests` runs the selector, hook, cache, consent-refusal
(`consent-refusal.spec.ts`: class, marker in message/type/string, bare 428 `ApiStatusError`,
stamped status, `cause`/`error`/aggregate nesting, a `CommitFailed`-shaped message, negatives) and
asker/gate (`consumer-hooks.spec.ts`: `makeAsker` sharing and failing open, `withConsent` retrying
exactly once, first-render hook shapes with `react-dom/server`) specs, the 8-language parity spec,
and drives chromium through the Vite harness, which picks a surface by `?case=` (none = the dialog,
`pieces`, `hook`, `shared-estimate`; `consent`, `start`, `withdrawal`, `withdrawal-public`,
`cancellation`, `limit` (`&blocked=true`), `country-locked`, `consent-gate`), with `?lng=` the
contract language and `?ui=` the interface language, and for the dialog an `?estimate=<name>`
canned `PriceEstimateControl` fixture (`tests/harness/estimate-fixtures.ts`,
`tests/harness/consumer-fixtures.ts` — no server, no Stripe). The harness pre-bundles every runtime
dependency in `optimizeDeps.include` (`@radix-ui/react-checkbox` included); one discovered
mid-navigation loads a second React and the page throws "Invalid hook call".
