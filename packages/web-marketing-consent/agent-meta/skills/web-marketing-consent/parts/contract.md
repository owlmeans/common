---
name: contract
description: The data-marketing-consent-* DOM contract that test helpers read, and the Tailwind @source line every consuming app adds.
metadata:
  purposes: config, test
  mentions: data-marketing-consent, answerMarketingConsent, makePageHelper, @source, web-marketing-consent/src
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-marketing-consent — DOM contract and the @source line

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
`makePageHelper(page).answerMarketingConsent` reads them.

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
