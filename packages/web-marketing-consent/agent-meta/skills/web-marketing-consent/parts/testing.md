---
name: testing
description: The package's Vite and Playwright harness, the status stubs, the signed-in bearer race, and what each spec covers.
metadata:
  purposes: test
  mentions: makeBearer, statusView, withDefinition, allItemsCurrent, window.__mc, STANDARD_MARKETING_CONSENTS, package-boundary.spec
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-marketing-consent — Testing

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
  custom text). `?lng=` really switches the interface language (`i18nInstanceHelper.setLanguage` before the first
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
  called — then the whole Terms-mode `describe`: blocked-until-ticked with an alert and no skip, Terms owed with every consent decided listing every
consent ticked as last decided and saving them with the Terms,
  ticking records terms then posts pending items and continues, an already-current version with
  nothing else pending auto-continuing, a failed recording showing `terms-error` with no skip and no
  navigation, Select-all ticking and unticking the Terms row with the consents, the order (Select
  all, Terms, rows) and the mandatory asterisk on the Terms row alone, the Terms revision line, no
  asterisk without a Terms row, and a select-all followed by unticking Terms staying blocked);
  `step.spec.ts` (non-browser — the full `pending` matrix for both modes, and the skip marker keyed
  per session vs a new sign-in); `preferences.spec.ts` (same body, no navigation on save, `onSaved`
  firing, no skip link exists, no Terms row even with `?terms=step`, no cookie item, the same list
  structure, Select-all saving as settings, a FULLY-DECIDED account still loading and showing every
  item (`allItemsCurrent()` — the regression test for the `source`-dependent loading rule in [step-frame.md](step-frame.md)));
  `inline.spec.tsx` (server-rendered — placeholders, dropped sentences, label resolution, the
  appended fallback link, per-language records); `i18n.spec.ts` (non-browser — 8-locale parity,
  the date placeholder in every language, a literal-key scan of `t('screen.…'/'preferences.…')`
  calls across the component files); `service.spec.ts` (browser — drives the REAL registered
  `MarketingConsentClientService` via `window.__mc`, since faking `assertCtx`/`context.entrypoint` by
  hand is not worth it: signed-out never calls the API, a healthy server round-trips, a failing
  server fails open on every method); `package-boundary.spec.ts` (no consumer `@/` aliases in
  `src/`).
