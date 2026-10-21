---
name: sign-in
description: The sign-in screen's terms confirmation, privacy notice and provider disclosure — LoginTerms, LoginPrivacyNotice, LoginProviderNote and their DOM hooks.
metadata:
  purposes: auth
  mentions: LoginTerms, LoginPrivacyNotice, LoginProviderNote, LoginScreen, LocalizedLoginScreen, appendLoginScreen, data-login-terms, data-login-provider
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-panel — Sign-in screen

| Export | Description |
|--------|-------------|
| `LoginScreen` / `LocalizedLoginScreen` / `appendLoginScreen` | The identity-provider choice screen — see `login-methods`. `LoginScreen` is pure w.r.t. `locale` too, exactly like `translate`: it is a prop, defaulting to nothing, never an implicit `useLanguage()` read, because a component that reaches for i18n context directly crashes an app mounted without one. `LocalizedLoginScreen` supplies `useLanguage()`'s value when the caller does not pass its own |

## The terms confirmation — `LoginTerms`, `LoginPrivacyNotice`

`components/login/terms.tsx` renders `LoginTermsModel` (`@owlmeans/client-panel/auth`) via
`loginTermsHelper.termsSentence` + `.termsLabelResolver` (`@owlmeans/client-auth/login`) rather than re-deriving
link/label pairs itself. **`[data-login-terms]` marks exactly one checkbox — or NONE, once
`model.terms.deferred` is true** (`LoginScreen` renders `LoginTerms` when not deferred,
`LoginPrivacyNotice` when it is): an e2e suite elsewhere in the platform treats the checkbox as a
strict, at-most-one-match locator, so a change here must never add a second one, whatever
billing/product/custom documents a configuration adds. `[data-login-privacy]` is a SIBLING
paragraph of the checkbox's `<label>`, never nested inside it — a privacy disclosure is not
something the checkbox consents to — and it is exported ON ITS OWN as `LoginPrivacyNotice`: it
still renders while deferred, since the disclosure was never the checkbox's to remove. A linked
document/notice fragment carries `data-login-document="<key>"`. `[data-login-revised]` renders only
when NOT deferred and the resolved terms carry a `revisedAt` (i.e. the configuration set
`showRevision: true` and at least one document has its own revision date) — deferred, that date
belongs to the document the checkbox agreed to, and there is no checkbox on this screen to attach it
to. `LoginTerms`/`LoginPrivacyNotice` take `locale?: string` — from `LoginScreen`'s own `locale`
prop, never read from context directly — for `Intl.ListFormat` and a custom document's locale-keyed
`labelMap`. Method buttons carry `aria-disabled={model.blocked || undefined}`, never a literal
`"false"` — a deferred screen (which never sets `blocked`) then renders identically to an unblocked
ordinary one, with no special case. Pinned by `tests/login.spec.ts` → the "with billing, product and
custom documents configured" and "the Terms confirmation deferred to a step" blocks.

## The provider disclosure — `LoginProviderNote`

`LoginScreen` renders `useLoginMethods().provider` (`@owlmeans/client-panel/auth`, resolution rules
there) through `components/login/provider.tsx`:
`<div role="note" data-login-provider data-placement="top|inline">` — a `ShieldCheck` icon, the
sentence, and, when `info` resolved, `<a data-login-provider-info target="_blank"
rel="noopener noreferrer">More information</a>`. Never a `header`/`nav`: it is a disclosure, not a
landmark.

- **No provider → the DOM is exactly the pre-provider screen** (no note, no stage, title
  `login.title`).
- **`top`** (the platform's own hosts) — the strip is the FIRST child of `[data-login-screen]`,
  full width, at the screen's top edge; the card sits in `<div data-login-stage>`, which takes the
  remaining height and centres it. The screen's column layout, its zero padding, the stage's flex
  centring/padding and the strip's width are INLINE styles (same reason as the screen height —
  `login-methods` → Layout); classes there are cosmetic only.
- **`inline`** (an owner's own domain) — the note is one line inside `CardContent`, directly under
  the methods and above the terms; the screen keeps its ordinary shape.
- The card title becomes `login.provider.title` ("Sign in to {{product}}") whenever a provider
  resolves; `props.title` still wins.
- Copy: `login.provider.{title,top,inline,more}` in all eight languages
  (`components/login/i18n/*.json`), registered by `components/login/i18n.ts` into the SAME `auth`
  library resource as `client-auth`'s login copy (deep-merged; this package owns only the
  `login.provider` subtree). Names are filled after translation by `loginProviderHelper.fill`.
- Still exactly one `[data-login-terms]` in either placement. Pinned by `tests/login.spec.ts` →
  "the provider disclosure" (`?provider=top|inline` in the harness) and
  `tests/login-provider.spec.ts` (resolver, `fill`, eight-language key/placeholder parity).
