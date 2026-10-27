---
name: terms-mode
description: Terms mode (terms set to step) — moving the Terms confirmation off the sign-in screen onto this step, the one strict place, and the shared acceptance body.
metadata:
  purposes: auth, consent
  mentions: confirmsTerms, termsDeferred, loginTermsHelper, termsAcceptanceOf, resolveTerms, recordTerms, localizedHrefs, hrefMap, MarketingConsentConfig
---

# @owlmeans/web-marketing-consent — Terms mode

## Terms mode — moving the confirmation off the sign-in screen

`appendMarketingConsent(ctx, { ..., terms: 'step' })` moves the Terms confirmation from the sign-in
screen onto THIS step instead — `@owlmeans/client-auth/login`'s `loginTermsHelper.termsDeferred(ctx)` is what the
sign-in screen (`FallbackLoginScreen`, `web-panel`'s `LoginScreen`) checks to remove its own
checkbox; see that package's `login-methods` skill for the sign-in side. The privacy notice is
UNAFFECTED either way — it renders on the sign-in screen (as `[data-login-privacy]`/
`LoginPrivacyNotice`) and on THIS screen (as `[data-marketing-consent-privacy]`, see [contract.md](contract.md)) regardless
of which mode is on, because it was never something either checkbox consented to.

**This is the ONE place in the whole marketing-consent surface that is STRICT rather than
fail-open**, on purpose: the confirmation moved here to be the one thing nobody gets past
unconfirmed.

- `marketingConsentStep(client, alias, { confirmsTerms: true })` sets `LoginStep.required: true` —
  a `pending` that throws or times out is read as PENDING (see `login-plugins`'s `required`
  exception), not "not pending".
- `pending` itself: pending `status == null` (the read failed) `|| status.terms?.version !==
  loginTermsHelper.resolveTerms(ctx.cfg...terms).version`. Reads the terms configuration FRESH from `ctx.cfg` on
  every call, never a value captured once at `appendMarketingConsent` time — `apiConfigMiddleware`
  can still be merging it in when this step registers.
- **Skip is never offered while the Terms row is on screen.** `useMarketingConsent`'s `terms.needed`
  is exactly the condition a screen must check before rendering its Skip control at all.
- A failed `client.recordTerms(...)` shows its OWN error (`termsError`/`[data-marketing-consent-
  terms-error]`) and the person stays — there is no fallback here, unlike an item `save()` failure.

`loginTermsHelper.termsAcceptanceOf(resolved, locale?)` (`@owlmeans/client-auth/login`) builds the body — the SAME
helper `termsRecorder` uses for the sign-in-screen path, so the wire shape never forks between the
two places a person might confirm.
When `LoginTermsConfig.localizedHrefs` is configured, both displayed links and this evidence select
the explicit destination for the same live UI locale. The canonical digest/revisions and save schema
remain unchanged; a language change alone never asks for a new agreement.
Optional-purpose `MarketingConsentLink.hrefMap` uses the same `termsHrefOf` presentation resolver
in `inlineHelper.resolveLinks`. Configure complete translated destinations including fragments;
omitted/unmapped locales keep the canonical href. No decision/Terms-save or ledger fields are added.

`opts.config` (`MarketingConsentConfig`) is accepted for symmetry with the server's
`appendMarketingConsentService({ config })` call but is NOT read here — `marketingConsentHelper.resolveMarketingConsents`
only ever runs where the catalogue is enumerated (the server); this package's UI reads the
ALREADY-RESOLVED `MarketingConsentStatusItem.definition` back off the status response and never
re-resolves the catalogue client-side.
