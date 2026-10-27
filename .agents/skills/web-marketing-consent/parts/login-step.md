---
name: login-step
description: The login step's fail-open pending check, the per-sign-in skip marker, the termsRecorder landing hook, and why the step's buttons call continueLogin.
metadata:
  purposes: auth, consent
  mentions: marketingConsentStep, termsRecorder, marketingConsentSkipOf, LoginStep, LoginLandingHook, landAfterLogin, continueLogin, useContinueLogin, MARKETING_CONSENT_LOGIN_STEP
---

# @owlmeans/web-marketing-consent — The login step and the terms hook

## The login step and the terms hook

`marketingConsentStep(client, entrypointAlias, opts?)`'s `pending` is fail-open by DEFAULT — a
fetch failure means not-pending, because a broken read must never permanently trap a signed-in
person on a screen they cannot get past — except in Terms mode, which is the deliberate exception
([terms-mode.md](terms-mode.md)). It also checks `marketingConsentSkipOf(ctx).isSkipped()`: pending items with THIS sign-in already
skipped read as not-pending, so a skip is honoured for the rest of the sign-in (a `/dispatcher`
revisit included) and forgotten the moment a new one starts. `entrypointAlias` is
`protocols.screen.alias` — `loginLandingOf(ctx).continueLogin`'s `LoginStep.entrypoint` is where the dispatcher sends
the browser while the step is pending.

`termsRecorder` is a `LoginLandingHook`, run once per freshly landed token by
`loginLandingOf(ctx).landAfterLogin` (see `@owlmeans/client-auth`'s `./login` skill for the bound-and-swallow contract
they share with every other landing hook):

- **`termsRecorder`** (priority 100, runs first) — no-ops once `loginTermsHelper.termsDeferred(ctx)` is true (the
  step confirms it instead). Otherwise, if `.resolveTerms(ctx.cfg...terms)` is required and
  `.termsAccepted(resolved)` (the LOCAL `localStorage` marker `@owlmeans/client-auth`'s sign-in
  screen already set before the flow was allowed to start), posts
  `client.recordTerms(loginTermsHelper.termsAcceptanceOf(resolved, locale))`. Reads the terms configuration fresh
  from `ctx.cfg` on every landing, never a value captured once at `appendMarketingConsent` time. A
  config with terms disabled, or a person who has not yet locally accepted, records nothing.

`MarketingConsentBody`'s own "Save and continue"/"Skip for now" buttons call
`useContinueLogin()({ after: MARKETING_CONSENT_LOGIN_STEP })` directly — that is `loginLandingOf(ctx).continueLogin`,
NOT `.landAfterLogin`, so clicking through this step never re-runs `termsRecorder` (it only fires
once, on the token that just landed, before this step's screen was ever reached).
