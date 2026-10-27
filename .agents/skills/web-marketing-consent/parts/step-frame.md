---
name: step-frame
description: MarketingConsentBody, the plain MarketingConsentScreen frame and the MarketingConsentPreferences card — the five states, the list, inline links, and the source-dependent loading of useMarketingConsent.
metadata:
  purposes: consent, screen
  mentions: MarketingConsentBody, MarketingConsentScreen, MarketingConsentPreferences, useMarketingConsent, MarketingConsentTermsModel, ConsentFields, ConsentRow, bulkSelection, optionalOnly, pristine
---

# @owlmeans/web-marketing-consent — The step, its frame and the settings card

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
   `role="alert"` on a blocked click, no Skip. EVERY catalogue item renders below the row, each
   ticked as last decided — also when the Terms are the only thing owed.
3. **optional-only** (`optionalOnly`: no Terms row, at least one item pending) — the confirm is
   ALWAYS clickable (never `aria-disabled`) but looks muted (`data-empty`, `aria-describedby` a
   hint) until `pristine` turns false — the FIRST tick/untick/Select-all this visit, after which it
   reads as an ordinary primary action. Skip is always offered here.
4. **unreadable, nothing else to show** (default mode only — Terms mode's `terms.needed` would
   already be true instead) — one error sentence, Skip.
5. **nothing pending** — renders nothing; a `useEffect` calls `loginLandingOf(ctx).continueLogin` itself. A visitor
   never has to click through an empty screen.

A "Sign out" link (`useLogout()`) renders whenever a Terms row is up, or while still loading in
Terms mode — the one way out for someone who will not accept, or who is stuck behind a failing API.

**The list (`ConsentFields`, shared by the step and the settings card).** In order:

1. **Bulk selection** — a framed box of its own (`[data-marketing-consent-all-frame]`), first on
   screen, ABOVE the Terms row. Default `bulkSelection: 'all'` draws it only when there is more than
   one row and selects all shown rows. Opt-in `'required'` labels it "Select required agreements",
   shows it only while the Terms row is needed, and ticks/unticks only Terms. Optional choices never
   contribute to that control's checked/indeterminate state and remain untouched by either action;
   a settings card or optional-only step has no bulk control in this mode. The frame
   reaches outward by its own border and padding (a negative inline margin), so its checkbox stands
   on the same vertical line as every row's checkbox — keep the two in step if either padding moves. It speaks for
   every row within its configured scope, the Terms row included while it is up: ticking it ticks Terms, and a
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

**This card loads the WHOLE catalogue, always — never gated on anything being owed.** That is the
one place `source: 'settings'` and `source: 'sign-in'` deliberately load items differently (see
below): a step must stop once nothing is outstanding, but a standing "change these at any time" card
gated the same way would render zero checkboxes the moment every item happened to already be
decided — silently breaking exactly the promise its own name makes. `save()` therefore always posts
the full catalogue here, not only whatever changed.

`useMarketingConsent({ source, locale? })` is the shared headless model: `source: 'sign-in'` from
the step, `'settings'` (the default) from preferences — posted on every `save()` call, on EVERY
LOADED item's current draft value (never a diff, `current` items included — the server upserts by
key). **When items load is `source`-dependent, on purpose**: for `'sign-in'`,
the WHOLE catalogue whenever the step is shown — an item pending (`status.pending`) or, in Terms
mode, the Terms owed (`status.terms?.version` differs from the configured one) — and nothing when
nothing is owed, so the step moves on; a step shown for the Terms alone still lists every consent,
ticked as last decided. For `'settings'` (preferences), the WHOLE catalogue, unconditionally — a
standing settings card must stay revisitable even once every item is decided. Groups are ordered
`communications`/`data` (`MC_GROUP_*`), any other group appended after in first-seen order.
`allChecked`/`allIndeterminate` count the Terms row while it is needed and optional rows only in
`bulkSelection: 'all'`; `allIndeterminate` is
applied to the select-all checkbox's `.indeterminate` DOM property via a `ref` in a `useEffect` — a
native checkbox has no ARIA `mixed` prop, only that imperative one. `save()` records `terms` FIRST
when `terms.needed`, then posts every loaded item — a step shown for the Terms alone re-records
the unchanged decisions with `source: 'sign-in'`; preferences always has the full catalogue loaded,
so its `save()` always posts it. Nothing in `save()` touches any cookie
store.

Both supplied UI hosts pass their current `useLanguage()` value to the hook. `save()` records it
in the existing `locale` field for optional-purpose decisions as well as Terms acceptance. A custom
headless host must pass its live UI locale; a bootstrap-time language captured in append options
does not establish which language the person saw when saving.
