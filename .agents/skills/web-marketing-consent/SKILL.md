---
name: web-marketing-consent
description: How to use @owlmeans/web-marketing-consent — the browser half of @owlmeans/marketing-consent: the post-sign-in privacy-choices step (MarketingConsentBody for a host that owns its layout, MarketingConsentScreen as the plain frame), a reusable MarketingConsentPreferences settings-card body, appendMarketingConsent's login step and terms landing hook, and the MarketingConsentClientService (fail-open, signed-out-safe). Auto-invoked when wiring the marketing-consent screen into a web app, framing it in an application's own layout, rendering a settings card for privacy choices, or diagnosing a person stuck on (or never shown) the marketing-consent step.
user-invocable: false
---

# @owlmeans/web-marketing-consent

**Layer:** Web (React, shadcn + Tailwind v4)
**Install:** `"@owlmeans/web-marketing-consent": "^0.1.18-rc.22"` in `dependencies`
**Contracts:** `@owlmeans/marketing-consent` — the catalogue, `marketingConsentHelper.consentStatus`, the protocol tree
**Server half:** `@owlmeans/server-marketing-consent` — `serveMarketingConsentEntrypoints` binds the
same `status`/`save`/`terms` protocols this package calls
**Login seam:** `@owlmeans/client-auth`'s `LoginStep`/`LoginLandingHook` registries (`./login`)
**Cookies:** none — this package never reads or writes `@owlmeans/consent`'s cookie record (see [parts/cookies.md](parts/cookies.md))

Read `@owlmeans/marketing-consent`'s own skill first (the catalogue, `marketingConsentHelper.consentStatus`'s decision
table, the protocol tree) and `@owlmeans/server-marketing-consent`'s (the service, `subjectOf`, the
append-only log) — this package builds on both and repeats nothing they already document.

## Key exports

| Export | Description |
|---|---|
| `MARKETING_CONSENT_CLIENT_SERVICE` | The client service alias (`context.service<MarketingConsentClientService>(...)`) |
| `MARKETING_CONSENT_LOGIN_STEP` · `MARKETING_CONSENT_LANDING_HOOK_TERMS` | Registry aliases the step and the hook register under |
| `MARKETING_CONSENT_I18N` | Re-export of `@owlmeans/marketing-consent`'s OWN `MARKETING_CONSENT_I18N` — see [parts/i18n.md](parts/i18n.md) |
| `makeMarketingConsentClient(protocols, opts?)` · `appendMarketingConsentClient(ctx, protocols, opts?)` | Build/register the `MarketingConsentClientService` |
| `MarketingConsentClientService` | `status(opts?)`, `save(request)`, `recordTerms(acceptance)`, `last()`, `preferences()`, optional `bulkSelection` — see "Fail open, always" |
| `marketingConsentStep(client, entrypointAlias, opts?)` | The `LoginStep` — `opts.confirmsTerms` moves the Terms row here (see [parts/terms-mode.md](parts/terms-mode.md)); pending while `status().pending` is true and this sign-in has not skipped it |
| `marketingConsentSkipOf(ctx)` — `.isSkipped()` · `.markSkipped()` | The skip marker's read/write half — keyed per sign-in (`Auth.sessionId`, else the raw token), never a credential |
| `termsRecorder(client, locale?)` | The terms-acceptance `LoginLandingHook` |
| `appendMarketingConsent(ctx, opts)` | The ONE call an app makes — wires the client, the step and the terms hook: `{ protocols, config?, step?, terms?: boolean \| 'step', preferences?, bulkSelection?: 'all' \| 'required', locale? }` — see [parts/terms-mode.md](parts/terms-mode.md) |
| `marketingConsentEntrypoints(protocols)` | `[bindScreen(protocols.screen, handler(MarketingConsentScreen))]` |
| `MarketingConsentBody` | Everything the step does and none of the page around it (`{ className? }`) — the host puts it in its own layout; renders NOTHING once nothing is left to answer, so a frame hides itself while empty (`empty:hidden`) |
| `MarketingConsentScreen` | The plain frame — a centered card up to 768px around `MarketingConsentBody` (`RoutedComponent`); what `marketingConsentEntrypoints` binds |
| `MarketingConsentPreferences` | The reusable settings-card body (`{ translate?, className?, onSaved? }`) — never shows a Terms row, whatever `appendMarketingConsent({ terms })` says |
| `useMarketingConsent(opts?)` | The headless model both components share — `{ loading, unreadable, saving, error, termsError, gpc, groups, bulkSelection, allChecked, allIndeterminate, toggleAll, toggle, pristine, optionalOnly, deferred, terms, save, skip }`; `opts: { source?: 'sign-in' \| 'settings', locale? }` |
| `MarketingConsentTermsModel` | `{ needed, ticked, attempted, tick, documents, notices, revisedAt?, version }` — `useMarketingConsent(...).terms` |
| `MARKETING_CONSENT_SKIP_STORAGE` | The skip marker's `localStorage` key |

## Wiring

```ts
import { appendMarketingConsent, marketingConsentEntrypoints } from '@owlmeans/web-marketing-consent'
import { makeMarketingConsentProtocols } from '@owlmeans/marketing-consent'

// shared package — the SAME object the server binds `serveMarketingConsentEntrypoints` to
export const marketingConsentProtocols = makeMarketingConsentProtocols({ parent: appProtocols.account.base })

// web app's makeContext
appendMarketingConsent(context, { protocols: marketingConsentProtocols })
// entrypoints: ...marketingConsentEntrypoints(marketingConsentProtocols)
// PLUS the app's own bindAll for base/status/save/terms, alongside the server's bindAll — this
// package binds only the SCREEN. Exactly the split @owlmeans/web-oauth's oauthEntrypoints draws
// for its own consent API; see that package's skill if this split is unfamiliar.
```

`appendMarketingConsent(ctx, opts)` does three things, each independently toggleable:

1. Registers the `MarketingConsentClientService` (`opts.preferences`, `opts.bulkSelection`) — via
   `appendMarketingConsentClient`, so calling `appendMarketingConsent` twice never double-registers.
2. `opts.step !== false` — `login.registerStep(marketingConsentStep(client, opts.protocols.screen.alias,
   { confirmsTerms: opts.terms === 'step' && opts.step !== false }))`.
3. `opts.terms !== false` — **always** registers `termsRecorder(client, opts.locale)`, even in
   `'step'` mode: the hook itself reads `loginTermsHelper.termsDeferred(ctx)` (`@owlmeans/client-auth/login`) and
   no-ops once that is true, rather than `append.ts` deciding it eagerly — see [parts/terms-mode.md](parts/terms-mode.md)
   for why. `opts.terms: 'step'` together with `opts.step: false` behaves like `true` (no step
   left to confirm on).

A host that has its own layout for this step binds its OWN screen instead of `marketingConsentEntrypoints`'s:
`bindScreen(protocols.screen, handler(() => <MyLayout><MarketingConsentBody /></MyLayout>))`. The
layout is the host's — its mark, a language switcher, the width its copy needs; the package draws
only the step.

## Fail open, always

`MarketingConsentClientService` NEVER calls the API while signed out
(`AuthService.authenticated()` — no args, returns the token or `null` — checked before every call)
and NEVER throws into a caller: any rejected/thrown network call is swallowed, returning `null`
(`status`, `save`) or `false` (`recordTerms`) instead. A broken consent read/write must never block
sign-in or break the app — the same discipline `@owlmeans/web-oauth`'s `loginLandingOf(ctx).landAfterLogin`/
`.continueLogin` already apply to a step/hook that hangs or throws (bound-and-swallow, timeout
included).

`status(opts?)` also caches: `opts.fresh !== true` and an already-cached `last()` skips the network
round trip entirely (a footer "Privacy choices" link wants a quick paint, not a forced refetch);
`marketingConsentStep` and the two components pass `{ fresh: true }` because a
post-sign-in decision must never be stale.

## Scope: the landing path only

Strict Terms mode applies only while a sign-in is actually LANDING through
`loginLandingOf(ctx).landAfterLogin`/`.continueLogin` — a deep link straight to another screen, the back button, or a
session minted before this mode was ever turned on all bypass it, same as every other `LoginStep`.
Nothing in this package adds a standing guard elsewhere in the app; if one is ever wanted (a layout
that refuses to render until `client.status()` shows no pending terms), it is the CONSUMING
application's own addition, not something this package should grow.

## Related

- `@owlmeans/marketing-consent` — the catalogue, `marketingConsentHelper.consentStatus`'s decision table, the protocol
  tree (read its skill first; this package repeats nothing it already documents)
- `@owlmeans/server-marketing-consent` — the service and handlers this package's `status`/`save`/
  `terms` calls reach
- `@owlmeans/client-auth` (`./login`) — `LoginStep`/`LoginLandingHook`, `loginLandingOf(ctx).landAfterLogin`/
  `.continueLogin`/`useContinueLogin`, `loginTermsHelper.resolveTerms`/`.termsAccepted` — the seam this package plugs
  into; read its skill for the bound-and-swallow contract every step/hook shares
- `@owlmeans/consent` / `@owlmeans/web-consent` — the cookie dialog and its record: a sibling this
  package deliberately never touches (see [parts/cookies.md](parts/cookies.md))
- `@owlmeans/web-oauth` — the structural precedent this package copies: headless-hook/thin-component
  split, vendored `src/@/` primitives, the `@source` line, the Vite+Playwright test harness shape

## Parts

Load a part on top of this core when its job is in play.

| Part | Load it when |
|---|---|
| [terms-mode](parts/terms-mode.md) | Using `terms: 'step'` — the Terms confirmation moved onto this step, the one strict, never fail-open place |
| [login-step](parts/login-step.md) | Changing or diagnosing the login step (`pending`, the skip marker) or the `termsRecorder` landing hook |
| [step-frame](parts/step-frame.md) | Framing the step in a host layout, rendering the settings card, or changing the states, the list, inline links or `useMarketingConsent` |
| [contract](parts/contract.md) | Keying a test or CSS on the `data-marketing-consent-*` hooks, or adding the Tailwind `@source` line every consuming app needs |
| [testing](parts/testing.md) | Running or extending this package's browser specs and harness |
| [cookies](parts/cookies.md) | Tempted to bridge cookie consent and marketing consent (never — and why) |
| [i18n](parts/i18n.md) | Adding or overriding the step's strings or an application's own consents' words |
