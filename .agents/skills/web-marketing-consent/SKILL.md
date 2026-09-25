---
name: web-marketing-consent
description: How to use @owlmeans/web-marketing-consent — the browser half of @owlmeans/marketing-consent: the post-sign-in privacy-choices step (MarketingConsentBody for a host that owns its layout, MarketingConsentScreen as the plain frame), a reusable MarketingConsentPreferences settings-card body, appendMarketingConsent's login step and terms landing hook, and the MarketingConsentClientService (fail-open, signed-out-safe). Auto-invoked when wiring the marketing-consent screen into a web app, framing it in an application's own layout, rendering a settings card for privacy choices, or diagnosing a person stuck on (or never shown) the marketing-consent step.
user-invocable: false
---

# @owlmeans/web-marketing-consent

**Layer:** Web (React, shadcn + Tailwind v4)
**Install:** `"@owlmeans/web-marketing-consent": "^0.1.18-rc.6"` in `dependencies`
**Contracts:** `@owlmeans/marketing-consent` — the catalogue, `consentStatus`, the protocol tree
**Server half:** `@owlmeans/server-marketing-consent` — `serveMarketingConsentEntrypoints` binds the
same `status`/`save`/`terms` protocols this package calls
**Login seam:** `@owlmeans/client-auth`'s `LoginStep`/`LoginLandingHook` registries (`./login`)
**Cookies:** none — this package never reads or writes `@owlmeans/consent`'s cookie record (see "Cookies are a separate surface")

Read `@owlmeans/marketing-consent`'s own skill first (the catalogue, `consentStatus`'s decision
table, the protocol tree) and `@owlmeans/server-marketing-consent`'s (the service, `subjectOf`, the
append-only log) — this package builds on both and repeats nothing they already document.

## Key exports

| Export | Description |
|---|---|
| `MARKETING_CONSENT_CLIENT_SERVICE` | The client service alias (`context.service<MarketingConsentClientService>(...)`) |
| `MARKETING_CONSENT_LOGIN_STEP` · `MARKETING_CONSENT_LANDING_HOOK_TERMS` | Registry aliases the step and the hook register under |
| `MARKETING_CONSENT_I18N` | Re-export of `@owlmeans/marketing-consent`'s OWN `MARKETING_CONSENT_I18N` — see "One shared i18n resource" below |
| `makeMarketingConsentClient(protocols, opts?)` · `appendMarketingConsentClient(ctx, protocols, opts?)` | Build/register the `MarketingConsentClientService` |
| `MarketingConsentClientService` | `status(opts?)`, `save(request)`, `recordTerms(acceptance)`, `last()`, `preferences()` — see "Fail open, always" |
| `marketingConsentStep(client, entrypointAlias, opts?)` | The `LoginStep` — `opts.confirmsTerms` moves the Terms row here (see "Terms mode" below); pending while `status().pending` is true and this sign-in has not skipped it |
| `isMarketingConsentSkipped(ctx)` · `markMarketingConsentSkipped(ctx)` | The skip marker's read/write half — keyed per sign-in (`Auth.sessionId`, else the raw token), never a credential |
| `termsRecorder(client, locale?)` | The terms-acceptance `LoginLandingHook` |
| `appendMarketingConsent(ctx, opts)` | The ONE call an app makes — wires the client, the step and the terms hook: `{ protocols, config?, step?, terms?: boolean \| 'step', preferences?, locale? }` — see "Terms mode" |
| `marketingConsentEntrypoints(protocols)` | `[bindScreen(protocols.screen, handler(MarketingConsentScreen))]` |
| `MarketingConsentBody` | Everything the step does and none of the page around it (`{ className? }`) — the host puts it in its own layout; renders NOTHING once nothing is left to answer, so a frame hides itself while empty (`empty:hidden`) |
| `MarketingConsentScreen` | The plain frame — a centered card up to 768px around `MarketingConsentBody` (`RoutedComponent`); what `marketingConsentEntrypoints` binds |
| `MarketingConsentPreferences` | The reusable settings-card body (`{ translate?, className?, onSaved? }`) — never shows a Terms row, whatever `appendMarketingConsent({ terms })` says |
| `useMarketingConsent(opts?)` | The headless model both components share — `{ loading, unreadable, saving, error, termsError, gpc, groups, allChecked, allIndeterminate, toggleAll, toggle, pristine, optionalOnly, deferred, terms, save, skip }`; `opts: { source?: 'sign-in' \| 'settings', locale? }` |
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

1. Registers the `MarketingConsentClientService` (`opts.preferences`) — via
   `appendMarketingConsentClient`, so calling `appendMarketingConsent` twice never double-registers.
2. `opts.step !== false` — `login.registerStep(marketingConsentStep(client, opts.protocols.screen.alias,
   { confirmsTerms: opts.terms === 'step' && opts.step !== false }))`.
3. `opts.terms !== false` — **always** registers `termsRecorder(client, opts.locale)`, even in
   `'step'` mode: the hook itself reads `termsDeferred(ctx)` (`@owlmeans/client-auth/login`) and
   no-ops once that is true, rather than `append.ts` deciding it eagerly — see "Terms mode" below
   for why. `opts.terms: 'step'` together with `opts.step: false` behaves like `true` (no step
   left to confirm on).

A host that has its own layout for this step binds its OWN screen instead of `marketingConsentEntrypoints`'s:
`bindScreen(protocols.screen, handler(() => <MyLayout><MarketingConsentBody /></MyLayout>))`. The
layout is the host's — its mark, a language switcher, the width its copy needs; the package draws
only the step.

## Terms mode — moving the confirmation off the sign-in screen

`appendMarketingConsent(ctx, { ..., terms: 'step' })` moves the Terms confirmation from the sign-in
screen onto THIS step instead — `@owlmeans/client-auth/login`'s `termsDeferred(ctx)` is what the
sign-in screen (`FallbackLoginScreen`, `web-panel`'s `LoginScreen`) checks to remove its own
checkbox; see that package's `login-methods` skill for the sign-in side. The privacy notice is
UNAFFECTED either way — it renders on the sign-in screen (as `[data-login-privacy]`/
`LoginPrivacyNotice`) and on THIS screen (as `[data-marketing-consent-privacy]`, below) regardless
of which mode is on, because it was never something either checkbox consented to.

**This is the ONE place in the whole marketing-consent surface that is STRICT rather than
fail-open**, on purpose: the confirmation moved here to be the one thing nobody gets past
unconfirmed.

- `marketingConsentStep(client, alias, { confirmsTerms: true })` sets `LoginStep.required: true` —
  a `pending` that throws or times out is read as PENDING (see `login-plugins`'s `required`
  exception), not "not pending".
- `pending` itself: pending `status == null` (the read failed) `|| status.terms?.version !==
  resolveTerms(ctx.cfg...terms).version`. Reads the terms configuration FRESH from `ctx.cfg` on
  every call, never a value captured once at `appendMarketingConsent` time — `apiConfigMiddleware`
  can still be merging it in when this step registers.
- **Skip is never offered while the Terms row is on screen.** `useMarketingConsent`'s `terms.needed`
  is exactly the condition a screen must check before rendering its Skip control at all.
- A failed `client.recordTerms(...)` shows its OWN error (`termsError`/`[data-marketing-consent-
  terms-error]`) and the person stays — there is no fallback here, unlike an item `save()` failure.

`termsAcceptanceOf(resolved, locale?)` (`@owlmeans/client-auth/login`) builds the body — the SAME
helper `termsRecorder` uses for the sign-in-screen path, so the wire shape never forks between the
two places a person might confirm.

`opts.config` (`MarketingConsentConfig`) is accepted for symmetry with the server's
`appendMarketingConsentService({ config })` call but is NOT read here — `resolveMarketingConsents`
only ever runs where the catalogue is enumerated (the server); this package's UI reads the
ALREADY-RESOLVED `MarketingConsentStatusItem.definition` back off the status response and never
re-resolves the catalogue client-side.

## One shared i18n resource, not two

`MARKETING_CONSENT_I18N` here is a re-export of `@owlmeans/marketing-consent`'s OWN constant
(`'marketing-consent'`) — this package does NOT register a second resource for its `screen.*`/
`preferences.*` strings. `@owlmeans/i18n`'s `addI18nLib` pushes a new resource ENTRY rather than
replacing one, and `client-i18n`'s `useI18nResource` merges every entry for a given
`(lng, resource, ns)` with `i18n.addResourceBundle(lng, ns, data, true, true)` (deep merge) before
it is ever read. The domain package's bundle (`group.*`, `consent.*`, `link.*`, `errors.*`) and
this package's own (`screen.*`, `preferences.*`) have disjoint top-level keys, so the two combine
cleanly. `ConsentFields` (the shared select-all/list body) reads BOTH halves through one `t` —
`t(item.definition.labelKey, ...)` for a domain key, `t('screen.updated', ...)` and
`t('screen.last-updated', ...)` for ours, `t('link.default', 'Learn more')` for the domain
package's own link fallback text. An application adds its own consents' words to the same resource
(`addI18nLib(lng, 'marketing-consent', { consent: { … } })`) or gives a custom definition per-language
`label`/`description` records.

## Fail open, always

`MarketingConsentClientService` NEVER calls the API while signed out
(`AuthService.authenticated()` — no args, returns the token or `null` — checked before every call)
and NEVER throws into a caller: any rejected/thrown network call is swallowed, returning `null`
(`status`, `save`) or `false` (`recordTerms`) instead. A broken consent read/write must never block
sign-in or break the app — the same discipline `@owlmeans/web-oauth`'s `landAfterLogin`/
`continueLogin` already apply to a step/hook that hangs or throws (bound-and-swallow, timeout
included).

`status(opts?)` also caches: `opts.fresh !== true` and an already-cached `last()` skips the network
round trip entirely (a footer "Privacy choices" link wants a quick paint, not a forced refetch);
`marketingConsentStep` and the two components pass `{ fresh: true }` because a
post-sign-in decision must never be stale.

## The login step and the terms hook

`marketingConsentStep(client, entrypointAlias, opts?)`'s `pending` is fail-open by DEFAULT — a
fetch failure means not-pending, because a broken read must never permanently trap a signed-in
person on a screen they cannot get past — except in Terms mode, which is the deliberate exception
above. It also checks `isMarketingConsentSkipped(ctx)`: pending items with THIS sign-in already
skipped read as not-pending, so a skip is honoured for the rest of the sign-in (a `/dispatcher`
revisit included) and forgotten the moment a new one starts. `entrypointAlias` is
`protocols.screen.alias` — `continueLogin`'s `LoginStep.entrypoint` is where the dispatcher sends
the browser while the step is pending.

`termsRecorder` is a `LoginLandingHook`, run once per freshly landed token by
`landAfterLogin` (see `@owlmeans/client-auth`'s `./login` skill for the bound-and-swallow contract
they share with every other landing hook):

- **`termsRecorder`** (priority 100, runs first) — no-ops once `termsDeferred(ctx)` is true (the
  step confirms it instead). Otherwise, if `resolveTerms(ctx.cfg...terms)` is required and
  `termsAccepted(resolved)` (the LOCAL `localStorage` marker `@owlmeans/client-auth`'s sign-in
  screen already set before the flow was allowed to start), posts
  `client.recordTerms(termsAcceptanceOf(resolved, locale))`. Reads the terms configuration fresh
  from `ctx.cfg` on every landing, never a value captured once at `appendMarketingConsent` time. A
  config with terms disabled, or a person who has not yet locally accepted, records nothing.

`MarketingConsentBody`'s own "Save and continue"/"Skip for now" buttons call
`useContinueLogin()({ after: MARKETING_CONSENT_LOGIN_STEP })` directly — that is `continueLogin`,
NOT `landAfterLogin`, so clicking through this step never re-runs `termsRecorder` (it only fires
once, on the token that just landed, before this step's screen was ever reached).

## The step, its frame and the settings card

**`MarketingConsentBody({ className? })` is the step; the page around it is the host's.** It carries
everything — states, auto-advance, save/skip/sign-out, heading, list, errors, hint, buttons — and no
page chrome. An application with a layout (a mark, a language switcher, a card sized for its copy)
puts it there; `MarketingConsentScreen` is the plain frame for one that has none: a centered card up
to 768px wide (`max-w-3xl`) that hides itself while the body renders nothing. **The package sets no
width anywhere below the frame** — rows use `min-w-0`/`break-words` so a long statement wraps inside
whatever the host gives it, and the host makes the frame as wide as its longest line needs.

**The heading is "Agreements and consents", and its lead-in has two wordings.** `screen.subtitle`
covers contact AND data use (the step asks for both); `screen.subtitle-terms` opens with confirming
the terms and conditions, and is the one shown while the Terms row is on the screen — or about to
be, while the status is still loading in Terms mode (`data-marketing-consent-subtitle="terms"`
against `="consents"`). The same keys exist in all 8 languages; change them together.

**Renders when framed too** — unlike `@owlmeans/web-oauth`'s consent screen (a token-mint decision
a clickjacking overlay could steal), saving a marketing preference is not one, so there is
deliberately no framed-refusal branch. **Nothing checked (or nothing changed) is still a fully
valid save; there is no minimum-selection validation anywhere.** The body walks through five
states, in this order — `screen.tsx`'s own docblock spells out each one's markup:

1. **loading** (`data-state="loading"`) — the status read is outstanding, timed out at ~10s into
   `unreadable` rather than shown forever.
2. **Terms row up** (`terms.needed`) — `aria-disabled`/`data-blocked` on the confirm until ticked, a
   `role="alert"` on a blocked click, no Skip. Pending items (if any) render below the row.
3. **optional-only** (`optionalOnly`: no Terms row, at least one item pending) — the confirm is
   ALWAYS clickable (never `aria-disabled`) but looks muted (`data-empty`, `aria-describedby` a
   hint) until `pristine` turns false — the FIRST tick/untick/Select-all this visit, after which it
   reads as an ordinary primary action. Skip is always offered here.
4. **unreadable, nothing else to show** (default mode only — Terms mode's `terms.needed` would
   already be true instead) — one error sentence, Skip.
5. **nothing pending** — renders nothing; a `useEffect` calls `continueLogin` itself. A visitor
   never has to click through an empty screen.

A "Sign out" link (`useLogout()`) renders whenever a Terms row is up, or while still loading in
Terms mode — the one way out for someone who will not accept, or who is stuck behind a failing API.

**The list (`ConsentFields`, shared by the step and the settings card).** In order:

1. **Select all** — a framed box of its own (`[data-marketing-consent-all-frame]`), first on
   screen, ABOVE the Terms row. Drawn only when there is more than one row to select. The frame
   reaches outward by its own border and padding (a negative inline margin), so its checkbox stands
   on the same vertical line as every row's checkbox — keep the two in step if either padding moves. It speaks for
   every row on screen, the Terms row included while it is up: ticking it ticks Terms, and a
   partial selection (Terms alone, or some consents) reads as indeterminate. That counts as a change
   (`pristine` turns false). The Terms row stays independently tickable, and a save with it
   unticked is still blocked.
2. **The Terms row**, when `terms.needed` — the first row of the SAME list, drawn by the same
   `ConsentRow` as every consent (checkbox, statement with its document links, a muted "Last
   updated: …" from the terms configuration's revision) and marked mandatory: a danger asterisk
   (`[data-marketing-consent-required]`, `aria-hidden`, with a screen-reader-only "required") and
   `aria-required` on the checkbox, plus a "* Required" note under the list. Only mandatory rows
   carry the asterisk; no consent does.
3. **The consents**, one continuous list in catalogue order (`communications`, `data`, then any other
   group in first-seen order — the grouping only orders the rows; no group heading or separator is
   drawn, so the `group.*` bundle keys are unused by this UI). A row is the item's statement (`consent.<key>.label`, "I confirm that
   I agree to …"), its detail, a "Last updated: `<definition.revisedAt>`" line
   (`[data-marketing-consent-revised="<key>"]`, the date is the raw ISO string exactly like the Terms
   line), the "Updated" badge when `item.updated`, and the Global Privacy Control note where
   `honorGpc` applies.

**Links are part of the sentence.** A definition's `links` are drawn where the translated text
carries `{{link}}`/`{{link2}}`/… (`components/inline.tsx`: the string is split on the tokens, the
same technique the sign-in terms sentence uses). A link is labelled by its per-language `label`,
then its `labelKey`, then `link.default`. A description whose placeholder has no link behind it
loses that whole sentence (a configuration with no links must not read "described in the ."); a
statement keeps its words and only loses the placeholder. Links present but no placeholder anywhere
in the text: the first link is appended to the detail rather than left stray. There is no standalone
"Learn more" anchor. A custom definition with no `labelKey`/`descriptionKey` renders its
per-language `label`/`description` records (exact language, base language, `en`, then anything) —
never its raw key unless it has no text at all.

`MarketingConsentPreferences({ translate?, className?, onSaved? })` renders the SAME list without
the page chrome, for a host's own settings card. `MarketingConsentClientService.preferences()`
names the entrypoint alias a footer "Privacy choices" link should point at; that screen is expected
to render THIS component, not the step. No `useContinueLogin` here at all — nothing navigates on
save, and there is no skip and no Terms row, whatever the application's `appendMarketingConsent({
terms })` says: `useMarketingConsent({ source: 'settings' })` computes `terms.needed` only for
`source: 'sign-in'`, so this card is unaffected either way. Failing to save just leaves the error
showing and the draft in place.

**This card loads the WHOLE catalogue, always — never gated on `status.pending`.** That is the one
place `source: 'settings'` and `source: 'sign-in'` deliberately load items differently (see below):
a step must stop asking once nothing is outstanding, but a standing "change these at any time" card
gated the same way would render zero checkboxes the moment every item happened to already be
decided — silently breaking exactly the promise its own name makes. `save()` therefore always posts
the full catalogue here, not only whatever changed.

`useMarketingConsent({ source, locale? })` is the shared headless model: `source: 'sign-in'` from
the step, `'settings'` (the default) from preferences — posted on every `save()` call, on EVERY
LOADED item's current draft value (never a diff, and never an item that is already `current` — the
server upserts by key). **Which items load is `source`-dependent, on purpose**: for `'sign-in'`,
only pending items — `status.pending === true ? status.items : []`, so a step never re-asks a
settled catalogue; for `'settings'` (preferences), the WHOLE catalogue, unconditionally — a
standing settings card must stay revisitable even once every item is decided. Groups are ordered
`communications`/`data` (`MC_GROUP_*`), any other group appended after in first-seen order.
`allChecked`/`allIndeterminate` count the Terms row while it is needed; `allIndeterminate` is
applied to the select-all checkbox's `.indeterminate` DOM property via a `ref` in a `useEffect` — a
native checkbox has no ARIA `mixed` prop, only that imperative one. `save()` records `terms` FIRST
when `terms.needed`, then posts every loaded item if there are any — a sign-in visit that is
Terms-only, with nothing else pending, never calls `save`'s item half at all; preferences always has
the full catalogue loaded, so its `save()` always posts it. Nothing in `save()` touches any cookie
store.

## `data-marketing-consent-*` contract

`data-marketing-consent` (the body's root, also carries `data-state="loading"|"ready"`),
`data-marketing-consent-fields` (the list), `data-marketing-consent-all` (the select-all checkbox)
and `data-marketing-consent-all-frame` (its framed box), `data-marketing-consent-item="<key>"`,
`data-marketing-consent-updated="<key>"`, `data-marketing-consent-revised="<key>"` (a consent row's
"Last updated" line), `data-marketing-consent-link` (an inline anchor), `data-marketing-consent-save`
(also carries `data-blocked="true"` while a Terms row is unticked, and `data-empty="true"` while
`optionalOnly && pristine`), `data-marketing-consent-hint` (the "you may proceed" line, `optionalOnly
&& pristine` only), `data-marketing-consent-skip` + `data-marketing-consent-skip-note` (the step
only, whenever `!loading && !terms.needed` — NOT only after a failed save; preferences has neither),
`data-marketing-consent-signout` (step only, `terms.needed || (loading && deferred)`),
`data-marketing-consent-terms` (the Terms checkbox itself, carrying `data-version`; ONLY in Terms
mode with `terms.needed`), `data-marketing-consent-terms-revised`, `data-marketing-consent-required`
(the asterisk) and `data-marketing-consent-required-note` (only with a Terms row),
`data-marketing-consent-privacy` (renders in EVERY mode, never only in Terms mode),
`data-marketing-consent-error` (step; also the default-mode "unreadable" state; preferences uses a
bare `role="alert"`, no fixed id), `data-marketing-consent-terms-error` (a failed Terms recording —
distinct from the items' own error), `data-marketing-consent-preferences-save`. `-all`/`-item`/
`-updated`/`-revised` are the SAME attributes in both the step and `MarketingConsentPreferences` —
the two are never mounted on one page at once. Do not rename them; `@owlmeans/test-ui`'s
`answerMarketingConsent` reads them.

## The `@source` line — a consumer rule

Same trap as `@owlmeans/web-oauth`/`@owlmeans/web-consent`: Tailwind's scanner reads the CSS root
plus `@source` directives and excludes `node_modules`, so a class used only inside this package
never reaches the app's stylesheet and the screen/card render unstyled with nothing in the
consumer's own sources to blame. Every consuming app adds:

```css
@source "../../../node_modules/@owlmeans/web-marketing-consent/src";
```

Point at the shipped `src`, **never** `build` — under a linked workspace the `node_modules` entry
is a symlink into this monorepo, where every package's `build` directory is ignored by `.gitignore`,
so a `build` source scans zero files and reports nothing; the failure is silent. Primitives
(`button`, `card`, `label`) are private under `src/@/` and imported only by relative specifiers —
checkbox rows are a bare native `<input type="checkbox">`, the same choice `@owlmeans/client-auth`'s
own `LoginTerms` makes for a sign-in screen (no checkbox primitive, and its Radix peer, is vendored
just to render one). `tests/package-boundary.spec.ts` fails on any `from '@/…'` in `src/`.

## Testing

Category D (`/testing-ui`) — `bun test ./tests` drives a real chromium against a real app, with
only the server absent, the same harness shape as `@owlmeans/web-oauth`'s:

- **Harness** (`tests/context.ts` boots Vite; `tests/harness/mount.tsx` is the app) — the real
  `@owlmeans/web-client` context, `appendMarketingConsent(context, { protocols })` (so the step and
  the terms hook are really registered, even though no spec drives the hook directly), the
  marketing-consent API bound with `bindAll` under a backend parent on the harness's own origin,
  the screen's own entrypoint, a bare `home` screen, and a `/prefs` screen that renders
  `MarketingConsentPreferences` for the preferences specs. `tests/helpers.ts`'s `open(path, {
  stubs, signedIn, lng })` stubs `status`/`save`/`terms` via `page.route` on
  `/\/api\/.*marketing-consent\//`; `statusView(overrides?)` builds a `MarketingConsentStatusView`
  from `STANDARD_MARKETING_CONSENTS` (every standard key is `opt-in`, so the un-overridden default
  IS "nothing checked"), and `withDefinition(key, patch)` swaps part of one item's definition (links,
  custom text). `?lng=` really switches the interface language (`setLanguage` before the first
  render), so a non-English row is testable.
- A signed-in visit is `?bearer=<makeBearer(USER)>`, written to IndexedDB (`idb-keyval`) BEFORE
  `createRoot(...).render(...)` — **wait for a rendered marker** (`#home`, `[data-marketing-consent-save]`)
  before `page.evaluate`-ing anything: `domcontentloaded` fires as soon as the module script
  STARTS running, not once its own top-level `await`s (writing that bearer record) have settled: a
  bare `page.evaluate` right after `goto` races the write and reads "signed out".
- **Harness switch `?terms=step`** (read BEFORE `appendMarketingConsent`) sets
  `security.auth.login.terms = { required: true, version: 'harness-terms-v1', terms, privacy,
  revisions, showRevision: true }` and passes `terms: 'step'` — one harness process serves both
  modes.
- **What is covered:** `screen.spec.ts` (nothing checked by default, select-all/indeterminate, the
  `updated` badge, save posting every current draft value then continuing the flow to `/`, a failed
  save showing error+skip with skip still moving the flow on, Skip present WITHOUT a failed save,
  the `pristine`/`data-empty`/hint states, a framed mount rendering normally, the privacy notice in
  default mode too, no cookie item/note and a cookie decision made elsewhere left byte-identical by
  a save, Select-all framed and first, the last-updated line on every row, statements starting with
  the confirmation and the link inside the sentence, no dangling sentence without links, custom
  per-language text in English and Polish, no Select-all for a lone consent, everything-already-
  decided in DEFAULT mode auto-continuing (`allItemsCurrent()`, `helpers.ts`) with only `GET status`
  called — then the whole Terms-mode `describe`: blocked-until-ticked with an alert and no skip,
  ticking records terms then posts pending items and continues, an already-current version with
  nothing else pending auto-continuing, a failed recording showing `terms-error` with no skip and no
  navigation, Select-all ticking and unticking the Terms row with the consents, the order (Select
  all, Terms, rows) and the mandatory asterisk on the Terms row alone, the Terms revision line, no
  asterisk without a Terms row, and a select-all followed by unticking Terms staying blocked);
  `step.spec.ts` (non-browser — the full `pending` matrix for both modes, and the skip marker keyed
  per session vs a new sign-in); `preferences.spec.ts` (same body, no navigation on save, `onSaved`
  firing, no skip link exists, no Terms row even with `?terms=step`, no cookie item, the same list
  structure, Select-all saving as settings, a FULLY-DECIDED account still loading and showing every
  item (`allItemsCurrent()` — the regression test for the `source`-dependent loading rule above));
  `inline.spec.tsx` (server-rendered — placeholders, dropped sentences, label resolution, the
  appended fallback link, per-language records); `i18n.spec.ts` (non-browser — 8-locale parity,
  the date placeholder in every language, a literal-key scan of `t('screen.…'/'preferences.…')`
  calls across the component files); `service.spec.ts` (browser — drives the REAL registered
  `MarketingConsentClientService` via `window.__mc`, since faking `assertCtx`/`context.entrypoint` by
  hand is not worth it: signed-out never calls the API, a healthy server round-trips, a failing
  server fails open on every method); `package-boundary.spec.ts` (no consumer `@/` aliases in
  `src/`).

## Cookies are a separate surface

**Nothing in this package reads or writes a device's cookie consent, and no consent here is bound
to a cookie category.** There is no bridge, no seeding of the ledger from the device, no
back-propagation of a saved decision into the cookie record, and no `trackers.*` consent. The cookie
dialog (`@owlmeans/consent`, `@owlmeans/web-consent`) keeps its own record — including the choices
it carries between an organisation's domains through its own linker — and a person who already
decided there is never asked the same question again, because this step cannot ask it.

That separation is the legal reason, not only a tidy one. A cookie banner collects an ePrivacy
Art. 5(3) consent: storage on this terminal, given before sign-in, not tied to an identified person.
The ledger is a GDPR Art. 6(1)(a) consent of the identified person, applied across devices and
server-side. Reusing the first for the second is the function creep EDPB Guidelines 05/2020 warns
about (§58; §56 on purpose specification), a silently seeded value shown pre-checked is the
pre-ticked box §79 and Recital 32 (CJEU C-673/17 *Planet49*) rule out, and "a device cookie said
yes" — possibly chosen on another domain — is weak evidence under Art. 7(1). A store this package
does not own is a store it does not write, in either direction.

## Scope: the landing path only

Strict Terms mode applies only while a sign-in is actually LANDING through
`landAfterLogin`/`continueLogin` — a deep link straight to another screen, the back button, or a
session minted before this mode was ever turned on all bypass it, same as every other `LoginStep`.
Nothing in this package adds a standing guard elsewhere in the app; if one is ever wanted (a layout
that refuses to render until `client.status()` shows no pending terms), it is the CONSUMING
application's own addition, not something this package should grow.

## Related

- `@owlmeans/marketing-consent` — the catalogue, `consentStatus`'s decision table, the protocol
  tree (read its skill first; this package repeats nothing it already documents)
- `@owlmeans/server-marketing-consent` — the service and handlers this package's `status`/`save`/
  `terms` calls reach
- `@owlmeans/client-auth` (`./login`) — `LoginStep`/`LoginLandingHook`, `landAfterLogin`/
  `continueLogin`/`useContinueLogin`, `resolveTerms`/`termsAccepted` — the seam this package plugs
  into; read its skill for the bound-and-swallow contract every step/hook shares
- `@owlmeans/consent` / `@owlmeans/web-consent` — the cookie dialog and its record: a sibling this
  package deliberately never touches (see "Cookies are a separate surface")
- `@owlmeans/web-oauth` — the structural precedent this package copies: headless-hook/thin-component
  split, vendored `src/@/` primitives, the `@source` line, the Vite+Playwright test harness shape
