---
name: web-marketing-consent
description: How to use @owlmeans/web-marketing-consent — the browser half of @owlmeans/marketing-consent: the post-sign-in privacy-choices screen, a reusable MarketingConsentPreferences settings-card body, appendMarketingConsent's login step and landing hooks, the MarketingConsentClientService (fail-open, signed-out-safe), and the cookie-consent bridge to @owlmeans/consent. Auto-invoked when wiring the marketing-consent screen into a web app, rendering a settings card for privacy choices, reconciling cookie-consent decisions with saved account decisions, or diagnosing a person stuck on (or never shown) the marketing-consent step.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-marketing-consent

**Layer:** Web (React, shadcn + Tailwind v4)
**Install:** `"@owlmeans/web-marketing-consent": "^0.1.18-rc.2"` in `dependencies`
**Contracts:** `@owlmeans/marketing-consent` — the catalogue, `consentStatus`, the protocol tree
**Server half:** `@owlmeans/server-marketing-consent` — `serveMarketingConsentEntrypoints` binds the
same `status`/`save`/`terms` protocols this package calls
**Login seam:** `@owlmeans/client-auth`'s `LoginStep`/`LoginLandingHook` registries (`./login`)
**Cookie bridge:** `@owlmeans/consent`'s `consentStore` (device-side cookie/tracking decisions)

Read `@owlmeans/marketing-consent`'s own skill first (the catalogue, `consentStatus`'s decision
table, the protocol tree) and `@owlmeans/server-marketing-consent`'s (the service, `subjectOf`, the
append-only log) — this package builds on both and repeats nothing they already document.

## Key exports

| Export | Description |
|---|---|
| `MARKETING_CONSENT_CLIENT_SERVICE` | The client service alias (`context.service<MarketingConsentClientService>(...)`) |
| `MARKETING_CONSENT_LOGIN_STEP` · `MARKETING_CONSENT_LANDING_HOOK_TERMS` · `MARKETING_CONSENT_LANDING_HOOK_SYNC` | Registry aliases the step/hooks register under |
| `MARKETING_CONSENT_I18N` | Re-export of `@owlmeans/marketing-consent`'s OWN `MARKETING_CONSENT_I18N` — see "One shared i18n resource" below |
| `makeMarketingConsentClient(protocols, opts?)` · `appendMarketingConsentClient(ctx, protocols, opts?)` | Build/register the `MarketingConsentClientService` |
| `MarketingConsentClientService` | `status(opts?)`, `save(request)`, `recordTerms(acceptance)`, `last()`, `bridges()`, `preferences()` — see "Fail open, always" |
| `cookieConsentBridge(opts?)` | A `MarketingConsentBridge` over `@owlmeans/consent`'s `consentStore` |
| `marketingConsentStep(client, entrypointAlias)` | The `LoginStep` — pending while `status().pending` is true |
| `termsRecorder(loginTermsConfig, client, locale?)` · `landingSync(client)` | The two `LoginLandingHook`s |
| `appendMarketingConsent(ctx, opts)` | The ONE call an app makes — wires the client, the step and both landing hooks |
| `marketingConsentEntrypoints(protocols)` | `[bindScreen(protocols.screen, handler(MarketingConsentScreen))]` |
| `MarketingConsentScreen` | The post-sign-in screen (`RoutedComponent`) |
| `MarketingConsentPreferences` | The reusable settings-card body (`{ translate?, className?, onSaved? }`) |
| `useMarketingConsent(opts?)` | The headless model both components share — `{ loading, saving, error, gpc, groups, allChecked, allIndeterminate, toggleAll, toggle, save, skip }` |

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

`appendMarketingConsent(ctx, opts)` does four things, each independently toggleable:

1. Registers the `MarketingConsentClientService` (`opts.bridges ?? [cookieConsentBridge()]`,
   `opts.preferences`) — via `appendMarketingConsentClient`, so calling `appendMarketingConsent`
   twice never double-registers.
2. `opts.step !== false` — `login.registerStep(marketingConsentStep(client, opts.protocols.screen.alias))`.
3. `opts.terms !== false` — reads `(context.cfg as CommonConfig).security?.auth?.login?.terms`
   (the SAME typed path `@owlmeans/client-panel`'s `useLoginMethods` reads) and registers
   `termsRecorder`.
4. Always registers `landingSync`.

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
cleanly. `ConsentFields` (the shared group/item body) reads BOTH halves through one `t` —
`t(item.definition.labelKey, ...)` for a domain key, `t('screen.updated', ...)` for one of ours,
`t('link.default', 'Learn more')` for the domain package's own link fallback text.

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
`marketingConsentStep`/`landingSync`/the two components all pass `{ fresh: true }` because a
post-sign-in decision must never be stale.

## The login step and the two landing hooks

`marketingConsentStep(client, entrypointAlias)` is `pending: async () => (await client.status({
fresh: true }))?.pending ?? false` — a fetch failure fails OPEN (not pending), because a broken
read must never permanently trap a signed-in person on a screen they cannot get past.
`entrypointAlias` is `protocols.screen.alias` — `continueLogin`'s `LoginStep.entrypoint` is where
the dispatcher sends the browser while the step is pending.

`termsRecorder` and `landingSync` are `LoginLandingHook`s, run once per freshly landed token by
`landAfterLogin` (see `@owlmeans/client-auth`'s `./login` skill for the bound-and-swallow contract
they share with every other landing hook):

- **`termsRecorder`** (priority 100, runs first) — if `resolveTerms(loginTermsConfig)` is required
  and `termsAccepted(resolved)` (the LOCAL `localStorage` marker `@owlmeans/client-auth`'s sign-in
  screen already set before the flow was allowed to start), posts `client.recordTerms({ documents,
  notices, version, locale })`. A config with terms disabled, or a person who has not yet locally
  accepted, records nothing.
- **`landingSync`** (priority 90) — reconciles every `client.bridges()` against the freshly loaded
  status: a device with cookie decisions but no saved account decisions SEEDS the account
  (`client.save({ source: 'cookie' })`); an account with decisions but a bare device SEEDS the
  device (`bridge.write`); both present (agreeing or not), or neither present, and NOTHING is
  overwritten — the safer of two wrong guesses is to leave two already-made choices alone rather
  than silently pick one.

`MarketingConsentScreen`'s own "Save and continue"/"Continue without saving" buttons call
`useContinueLogin()({ after: MARKETING_CONSENT_LOGIN_STEP })` directly — that is `continueLogin`,
NOT `landAfterLogin`, so clicking through this step never re-runs `termsRecorder`/`landingSync`
(those only fire once, on the token that just landed, before this step's screen was ever reached).

## The cookie-consent bridge

`cookieConsentBridge(opts?: { storageOptions?: ConsentOptions })` is a `MarketingConsentBridge`
over `@owlmeans/consent`'s singleton `consentStore`, for every `MarketingConsentDefinition` whose
`cookieCategory` names a `@owlmeans/consent` category (`trackers.analytics` -> `CONSENT_ANALYTICS`,
`trackers.advertising` -> `CONSENT_MARKETING`). `consentStore.save` REPLACES the stored record
wholesale (no merge of its own), so `write` always spreads the CURRENT record first and always
re-asserts the essential category before patching in only the categories this bridge owns.
`opts.storageOptions` is read ONLY to find which category is "essential" (a host that renamed it
via its own `consentStore.init(storageOptions)` elsewhere is still honored); this bridge never
calls `consentStore.init` itself — it has no opinion about whether a cookie dialog exists at all.

A `suppress` flag guards re-entrancy: `write` sets it before calling `consentStore.save` and clears
it in a `finally`, and `subscribe`'s own listener skips while it is set — otherwise a save made
THROUGH this bridge would immediately hand the same change back to whatever reacts to `subscribe`,
which could write again and loop. An update made OUTSIDE the bridge (the cookie dialog's own UI)
still reaches every subscriber normally.

## The screen and the settings card

`MarketingConsentScreen` — full page, no application chrome, same `100dvh` centered-card shape as
`@owlmeans/web-oauth`'s consent screen. **Renders when framed too** — unlike that screen (a
token-mint decision a clickjacking overlay could steal), saving a marketing preference is not one,
so there is deliberately no framed-refusal branch. Nothing checked by default is a fully valid
save; there is no minimum-selection validation anywhere.

`MarketingConsentPreferences({ translate?, className?, onSaved? })` renders the SAME group/item/
select-all body (`ConsentFields`, internal — not exported) without the full-page chrome, for a
host's own settings card. `MarketingConsentClientService.preferences()` names the entrypoint alias
a footer "Privacy choices" link should point at; that screen is expected to render THIS component,
not `MarketingConsentScreen`. No `useContinueLogin` here at all — nothing navigates on save, and
there is no skip: a settings card is always revisitable, so failing to save just leaves the error
showing and the draft in place.

`useMarketingConsent({ source })` is the shared headless model: `source: 'sign-in'` from the screen,
`'settings'` (the default) from preferences — posted on every `save()` call, on EVERY item's
current draft value (never a diff; the server upserts by key). Groups are ordered
`communications`/`data`/`trackers` (`MC_GROUP_*`), any other group appended after in first-seen
order. `allIndeterminate` is applied to the select-all checkbox's `.indeterminate` DOM property via
a `ref` in a `useEffect` — a native checkbox has no ARIA `mixed` prop, only that imperative one.

## `data-marketing-consent-*` contract

`data-marketing-consent` (screen root), `data-marketing-consent-all`,
`data-marketing-consent-item="<key>"`, `data-marketing-consent-updated="<key>"`,
`data-marketing-consent-save`, `data-marketing-consent-skip` (screen only — preferences has none),
`data-marketing-consent-error` (screen; preferences uses a bare `role="alert"`, no fixed id),
`data-marketing-consent-preferences-save`. `-all`/`-item`/`-updated` are the SAME attributes in
both the screen and `MarketingConsentPreferences` — the two are never mounted on one page at once.
Do not rename them.

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
  both landing hooks are really registered, even though no spec drives them directly), the
  marketing-consent API bound with `bindAll` under a backend parent on the harness's own origin,
  the screen's own entrypoint, a bare `home` screen, and a `/prefs` screen that renders
  `MarketingConsentPreferences` for the preferences specs. `tests/helpers.ts`'s `open(path, {
  stubs, signedIn, lng })` stubs `status`/`save`/`terms` via `page.route` on
  `/\/api\/.*marketing-consent\//`; `statusView(overrides?)` builds a `MarketingConsentStatusView`
  from `STANDARD_MARKETING_CONSENTS` (every standard key is `opt-in`, so the un-overridden default
  IS "nothing checked").
- A signed-in visit is `?bearer=<makeBearer(USER)>`, written to IndexedDB (`idb-keyval`) BEFORE
  `createRoot(...).render(...)` — **wait for a rendered marker** (`#home`, `[data-marketing-consent-save]`)
  before `page.evaluate`-ing anything: `domcontentloaded` fires as soon as the module script
  STARTS running, not once its own top-level `await`s (writing that bearer record) have settled: a
  bare `page.evaluate` right after `goto` races the write and reads "signed out".
- **What is covered:** `screen.spec.ts` (nothing checked by default, select-all/indeterminate, the
  `updated` badge, save posting every current draft value then continuing the flow to `/`, a failed
  save showing error+skip with skip still moving the flow on, a framed mount rendering normally);
  `preferences.spec.ts` (same body, no navigation on save, `onSaved` firing, no skip link exists);
  `bridge.spec.ts` (non-browser — a fake `localStorage`/`document`/`window`, the same fixture
  `@owlmeans/consent`'s own suite uses; read/write/the re-entrancy guard); `i18n.spec.ts`
  (non-browser — 8-locale parity plus a literal-key scan of `t('screen.…'/'preferences.…')` calls
  across the three component files); `service.spec.ts` (browser — drives the REAL registered
  `MarketingConsentClientService` via `window.__mc`, since faking `assertCtx`/`context.entrypoint`
  by hand is not worth it: signed-out never calls the API, a healthy server round-trips, a failing
  server fails open on every method); `package-boundary.spec.ts` (no consumer `@/` aliases in
  `src/`).

## Related

- `@owlmeans/marketing-consent` — the catalogue, `consentStatus`'s decision table, the protocol
  tree (read its skill first; this package repeats nothing it already documents)
- `@owlmeans/server-marketing-consent` — the service and handlers this package's `status`/`save`/
  `terms` calls reach
- `@owlmeans/client-auth` (`./login`) — `LoginStep`/`LoginLandingHook`, `landAfterLogin`/
  `continueLogin`/`useContinueLogin`, `resolveTerms`/`termsAccepted` — the seam this package plugs
  into; read its skill for the bound-and-swallow contract every step/hook shares
- `@owlmeans/consent` — `consentStore`, `ConsentRecord`, the categories this bridge patches
- `@owlmeans/web-oauth` — the structural precedent this package copies: headless-hook/thin-component
  split, vendored `src/@/` primitives, the `@source` line, the Vite+Playwright test harness shape
