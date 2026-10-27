---
name: web-consent
description: How to use @owlmeans/web-consent — the React cookie-consent UI (the bottom bar by default, the preferences window, the locating spinner), its re-open button, the geo gate's props, the generated cookie-policy page and the useConsent hooks, plus the Tailwind @source line every consumer must add. Auto-invoked when mounting a consent bar or dialog, rendering a cookie policy, gating a feature on a consent category, or importing CookieConsent, CookiePolicy or useConsent.
user-invocable: false
---

# @owlmeans/web-consent

**Layer:** Web (React)
**Install:** `"@owlmeans/web-consent": "^0.1.18-rc.51"` in `dependencies`

The browser components of the consent set. The model — categories, storage, migration, the store,
Consent Mode signalling — is `@owlmeans/consent`, and this package re-exports a **named selection**
of it (listed under Key Exports) so an application usually has one import. Four public
`@owlmeans/consent` exports are deliberately not in that list — `makeConsentStore`,
`CONSENT_SETUP_FLAG`, `CONSENT_SIGNAL_DEFAULTS` and the `ConsentListener` type —
so a caller that needs one of them imports it from `@owlmeans/consent` directly. **Read the
`consent` skill for the model; read this one for the components.**

## Deliberately not a shadcn package

It uses **no shadcn primitive and no `@` alias**, and owns a four-line `cn` of its own. The `@`
contract exists so a consumer's THEME and primitives win — `cn` has neither in it, and requiring an
alias for it would mean adopting an OwlMeans UI contract before you may render a consent notice.
One of the surfaces that needs this dialog most is a static site with its own component library and
no such alias, where that would simply fail to build.

For the same reason it is not part of `@owlmeans/web-panel`: that would drag ~30 packages onto a
cookie notice. `@owlmeans/web-panel/consent` is the thin binding to OwlMeans i18n on top of these
components — see the i18n section of [parts/setup.md](parts/setup.md).

## Key Exports

| Export | Description |
|--------|-------------|
| `CookieConsent` | The consent UI — the bar, the preferences window, the locating spinner — **and** the persistent re-open button |
| `ConsentDisplayMode` / `CONSENT_DEFAULT_MODE` | `'bar'` (the default) or `'window'` — how a first-time visitor is asked |
| `ConsentMenuWidget` | A plain row a HOST'S OWN menu renders to reopen the dialog, in place of (or beside) `CookieConsent`'s own floating button — see [parts/menu.md](parts/menu.md) |
| `CookiePolicy` | The cookie-policy page, generated from the configuration in force |
| `ConsentToggle` | One category row — locked and labelled when the category is required |
| `useConsent(opts?)` | This document's consent state and the actions over it (`UseConsentModel`) — **it also initialises the store on mount**, see below |
| `useConsentCategory(key)` | Whether one category is granted, for a component gating a single thing |
| `CookieConsentProps` / `CookiePolicyProps` / `ConsentLink` | The component props |
| Re-exports from `@owlmeans/consent` | The complete list: `consentStore`; `consentStorageHelper` (`readConsent`, `writeConsent`, `clearConsent`, `migrateConsent`); `consentModeHelper` (`applyConsent`, `pushConsentDefaults`, `consentBootstrapScript`, `consentDefaults`, `consentUpdate`, `gtagConsent`, `trackingGranted`, `consentGateScript`); `consentI18nHelper` (`defaultConsentTranslate`, `interpolate`, `normalizeLocale`); `DEFAULT_CONSENT_CATEGORIES`, `DEFAULT_CONSENT_MESSAGES`, `CONSENT_KEY`, `CONSENT_COOKIE_DAYS`, `CONSENT_SCHEMA_VERSION`, `CONSENT_LOCALES`, `CONSENT_ESSENTIAL` / `CONSENT_ANALYTICS` / `CONSENT_MARKETING`, the plugin seam (`consentPluginHelper`: `registerConsentPlugin`, `unregisterConsentPlugin`, `consentPlugins`, `decorateConsentUrl`, `consentDomains`, `adoptConsent`, `startConsentPlugins`, `adoptConsentLanguage`, `locateConsent`), the geo gate (`consentGeoHelper`; `CONSENT_REQUIRED_COUNTRIES`, `CONSENT_COUNTRIES_GDPR` / `_ALIGNED` / `_OPT_IN`, `CONSENT_GEO_UNKNOWN`, `CONSENT_TRACE_PATH`, `CONSENT_GEO_TIMEOUT`, `CONSENT_AUTO_MAX_AGE`, `CONSENT_IDLE_STATE`, `CONSENT_STATE_ATTRIBUTE`; the types `ConsentGeoOptions`, `ConsentGeoPlugin`, `ConsentGeoLocation`, `ConsentCloudflareOptions`, `ConsentLocating`, `ConsentGeoHelper`, `ConsentGeoVerdict`, `ConsentAutoState`), the linker (`consentLinkHelper`: `consentLinker`, `encodeConsentLink`, `decodeConsentLink`, `stripConsentLinkParam`, `consentLinkerScript`, `writeConsentLanguage`; `CONSENT_LANGUAGE_KEY`, `CONSENT_EVENT`, `CONSENT_LINK_PARAM`, `CONSENT_LINK_MAX_AGE`, `CONSENT_LINK_SKEW`), and the types `ConsentCategory`, `ConsentOptions`, `ConsentReason`, `ConsentRecord`, `ConsentService`, `ConsentSignal`, `ConsentState`, `ConsentStore`, `ConsentLocale`, `ConsentLinkerOptions`, `ConsentLinkerLanguage`, `ConsentPlugin`, `ConsentLinkPayload` and the five helper interfaces |

## Reading the decision

```tsx
import { consentStore, useConsent, useConsentCategory } from '@owlmeans/web-consent'

const consent = useConsent()          // { record, open, reason, granted, save, acceptAll, openDialog, close }
const analytics = useConsentCategory('analytics')   // one category, for a component gating one thing
if (consentStore.granted('analytics')) { /* outside React — a click handler, a service */ }
```

Both hooks subscribe through `useSyncExternalStore` over the module-singleton store, because consent
is a property of the DOCUMENT rather than of a component tree: the dialog, the re-open button, the
policy page and whatever an app gates on it all read one value, and local copies would disagree the
moment one of them saved. During server rendering the snapshot is `CONSENT_IDLE_STATE` — one frozen
object, "no record, closed, not locating" — so no surface flashes into static HTML before hydration
corrects it (`tests/ssr.spec.tsx`). `UseConsentModel.locating` exposes the lookup.

**`useConsent` is not a pure reader — it runs `consentStore.init(opts)` on mount.** Two consequences
a component that only wanted to read has to plan for:

- **It opens the consent UI.** `init` reads storage, and with no stored record it publishes
  `open: true, reason: 'initial'` — or, with `geo`, starts locating. So a `useConsent()` in a card that merely wanted `granted('analytics')`
  gates the page for a first-time visitor. Read a single category with `useConsentCategory(key)` —
  that hook subscribes and does **not** init — or `consentStore.granted(key)` outside React.
- **The first `useConsent` to mount fixes the Consent Mode defaults.** `init` calls
  `consentModeHelper.pushConsentDefaults`, which is idempotent through the `CONSENT_SETUP_FLAG` window flag: whoever
  gets there first declares the `consent/default` signals from *its* categories, and every later
  call returns immediately. A bare `useConsent()` mounting before `CookieConsent` therefore declares
  `DEFAULT_CONSENT_CATEGORIES`' signals and the app's own `categories` never declare theirs — which
  silently breaks the parity rule (the category set the dialog renders is the set it saves —
  [parts/dialog.md](parts/dialog.md)). Pass the app's `opts` wherever `useConsent` is called, or
  do not call it outside the dialog.

`opts` are read on the mounting pass only (the effect's dependency list is empty), so changing them
in a later render has no effect on that mount.

## Depends On

- `@owlmeans/consent` — the model; the named selection above is re-exported from this package's root
- Peers (app-provided): `react`, `tailwindcss`, `tailwind-merge`, `clsx`, `lucide-react`

## Related

- `consent` — the model: categories, `globalVar`, storage and migration, Consent Mode v2, the
  ordering rule. Read it before changing anything a category means
- `web-gtm` — the head snippet that carries a stored decision to a Google tag, and
  `googleTagHelper.googleTagServices(id)` for this page's `services`
- `astro` — stamping that snippet from a static site's layout
- `login-methods` / `login-plugins` — the sign-in precondition that raises this dialog with
  `reason: 'login'`
- `web-panel` — its `./consent` subpath, the OwlMeans-i18n binding of these components

## Parts

Load a part on top of this core when its job is in play.

| Part | Load it when |
|---|---|
| [dialog](parts/dialog.md) | Mounting `CookieConsent` — its surfaces, props (`mode`, `geo`, `linker`, `categories`), the re-open button, the bar, focus, the login-raised window |
| [look](parts/look.md) | Restyling the bar or the window, or checking the flat look, focus outlines, switch names and the a11y harness |
| [menu](parts/menu.md) | Offering cookie preferences from a host's own menu (`ConsentMenuWidget`) |
| [policy-page](parts/policy-page.md) | Rendering the generated `CookiePolicy` page, its services disclosure or regional rule |
| [setup](parts/setup.md) | Adding the Tailwind `@source` line every consumer needs (pointing at `src`), or passing a `translate` resolver / adding a string |
