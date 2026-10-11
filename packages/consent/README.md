# @owlmeans/consent

The framework-free core of OwlMeans cookie consent: the category model, dual localStorage/cookie
storage with in-place migration, the observable document-level `consentStore`, Google Consent Mode
v2 signalling with the inline head scripts that must run before a tag manager loads, the built-in
dialog copy in eight languages, and cross-domain consent through decorated links. It has **zero
runtime dependencies**, so an Astro island or a plain script can load it. An app uses it directly
to stamp the head snippet, read a decision outside React, or gate a loader. It renders nothing — the
dialog, the re-open button and the cookie-policy page are `@owlmeans/web-consent` (or
`@owlmeans/web-panel/consent` bound to OwlMeans i18n), and the Google tag snippet itself is
`@owlmeans/web-gtm`. Per-person marketing preferences on the server are `@owlmeans/marketing-consent`,
not this package.

## Installation

```bash
bun add @owlmeans/consent@^0.1.18-rc.12
```

## Concepts

- **Category** — a `ConsentCategory`: a stable `key`, label/description keys, an optional
  `globalVar` written on `window`, the Consent Mode `signals` it drives and an optional `dataLayer`
  `event`. The defaults are `essential` (required), `analytics` and `marketing`.
- **Required category** — always granted and rendered locked: disclosure, not a question.
- **Record** — a `ConsentRecord` `{ v?, [categoryKey]: boolean }`, stored under
  `site_cookie_consent` in both localStorage and a 365-day `SameSite=Lax` cookie, localStorage read
  first. A record without `v` is migrated in place (`essential: true`, `v: 2`), never discarded.
- **Store** — `consentStore`, a module singleton: consent belongs to the document, not to a
  component tree, and is reachable from click handlers and non-React code.
- **Ordering rule** — `consent/default` must be on `window.dataLayer` before the tag manager loads,
  so it is pushed by an inline script stamped above the snippet, not by a bundle.
- **Plugin** — a `ConsentPlugin` that can `adopt` a decision or a language from outside storage,
  `decorate` outgoing URLs and disclose `domains`. `consentLinkHelper.consentLinker()` is the one
  built-in plugin.
- **Interface language** — strictly necessary storage (`owlmeans-lng`); no category governs it.

## Usage

### Start the store and read the decision

```typescript
import { consentStore, CONSENT_ANALYTICS } from '@owlmeans/consent'

consentStore.init()   // push defaults, read + migrate, apply, open when nothing is stored

const unsubscribe = consentStore.subscribe(state => {
  if (state.open) {
    showDialog(state.reason)   // 'initial' | 'reopen' | 'login' | custom
  }
})

if (consentStore.granted(CONSENT_ANALYTICS)) {
  startAnalytics()
}

consentStore.save({ essential: true, analytics: true, marketing: false })
consentStore.acceptAll()
consentStore.open('reopen')   // e.g. from a footer link
```

`useConsent()` in `@owlmeans/web-consent` calls `init` on mount; a host that mounts neither the
dialog nor a tag loader calls it once itself, with the same options everything else receives.

### Stamp the head snippet above the tag manager

```typescript
import { consentModeHelper } from '@owlmeans/consent'

const bootstrap = consentModeHelper.consentBootstrapScript()   // defaults + the stored record

// Withhold a loader until tracking is granted (now or by a later CONSENT_EVENT)
const gated = consentModeHelper.consentGateScript(loaderIife)

// Escaping `</script` / `<!--` in the composed inline script is the caller's job
const head = `<script>${bootstrap};${gated}</script>`
```

### Custom categories

```typescript
import { DEFAULT_CONSENT_CATEGORIES, consentStore } from '@owlmeans/consent'
import type { ConsentCategory } from '@owlmeans/consent'

const categories: ConsentCategory[] = [
  ...DEFAULT_CONSENT_CATEGORIES.filter(category => category.key !== 'marketing'),
  { key: 'chat', labelKey: 'chat', descriptionKey: 'chatDesc', globalVar: 'owlConsentChat' },
]

consentStore.init({ categories })
```

### Share a decision across first-party domains

```typescript
import { consentLinkHelper, consentStore } from '@owlmeans/consent'

const linker = {
  domains: ['owlmeans.com', 'app.example.com'],
  language: { supported: ['en', 'pl', 'de'] },   // omit `supported` on a send-only site
}

consentStore.init({ linker })   // registers consentLinker, adopts, writes the language, strips `owlcc`

// For a page that must adopt before any bundle (and before its i18n reads storage)
const fragment = consentLinkHelper.consentLinkerScript({ linker })
```

### Ask only where the law requires it

```typescript
import { consentPluginHelper, consentStore } from '@owlmeans/consent'

// Cloudflare mode: a same-origin GET of /cdn-cgi/trace, `loc=` decides
consentStore.init({ geo: { cloudflare: true } })

// …or a locator of your own — one async method that resolves the country or throws
consentPluginHelper.registerConsentPlugin({
  alias: 'my-geo', locate: async () => ({ country: await myCountryLookup() }),
})
consentStore.init({ geo: {} })

await consentStore.settled()   // the state once the lookup is over
```

A visitor located in `CONSENT_REQUIRED_COUNTRIES` (or `geo.countries`) is asked; anyone else gets an
automatic decision (`auto: <unix s>` on the record) — every category, or only the required ones
under Global Privacy Control; a visitor nobody can locate is asked. An automatic decision is trusted
for `CONSENT_AUTO_MAX_AGE` (one hour) and then re-checked silently; an explicit decision always wins.

### Built-in copy

```typescript
import { consentI18nHelper } from '@owlmeans/consent'

const t = consentI18nHelper.defaultConsentTranslate('pl-PL')   // falls back to 'en'
t('analytics', 'Analytics')
```

## API

### Store and helpers

| Symbol | Kind | Purpose |
|---|---|---|
| `consentStore`, `makeConsentStore()` | store | `get`, `subscribe`, `init(opts?)`, `save(record)`, `acceptAll`, `open(reason?)`, `close`, `granted(key)`, `options()`, `settled()` |
| `consentStorageHelper`, `createConsentStorageHelper()` | helper | `migrateConsent`, `readConsent`, `writeConsent`, `clearConsent` |
| `consentModeHelper`, `createConsentModeHelper()` | helper | `gtagConsent`, `consentDefaults`, `consentUpdate`, `pushConsentDefaults`, `applyConsent`, `trackingGranted`, `consentBootstrapScript`, `consentGateScript` |
| `consentLinkHelper`, `createConsentLinkHelper()` | helper | `encodeConsentLink`, `decodeConsentLink`, `writeConsentLanguage`, `consentLinker`, `stripConsentLinkParam`, `consentLinkerScript` |
| `consentPluginHelper`, `createConsentPluginHelper()` | helper | `registerConsentPlugin`, `unregisterConsentPlugin`, `consentPlugins`, `decorateConsentUrl`, `consentDomains`, `adoptConsent`, `adoptConsentLanguage`, `startConsentPlugins`, `locateConsent` |
| `consentGeoHelper`, `createConsentGeoHelper()` | helper | `enabled`, `parseTrace`, `cloudflareLocator`, `requiresConsent`, `decide`, `privacySignal`, `automaticRecord`, `autoState` |
| `consentI18nHelper`, `createConsentI18nHelper()` | helper | `normalizeLocale`, `defaultConsentTranslate`, `interpolate` |

Deprecated top-level wrappers (`compat:factory-refactor`) remain exported: `readConsent`,
`writeConsent`, `clearConsent`, `openConsent`, `isConsented`, `consentBootstrapScript`,
`defaultConsentTranslate`, `decorateConsentUrl`, `encodeConsentLink`, `consentLinkerScript`. New code
calls the helper members.

### Constants

| Symbol | Value / purpose |
|---|---|
| `CONSENT_KEY` | `'site_cookie_consent'` — storage key, must not change |
| `CONSENT_COOKIE_DAYS` | `365` |
| `CONSENT_SCHEMA_VERSION` | `2` — stored record shape |
| `CONSENT_SETUP_FLAG` | `'cookieConsentSetup'` — window flag making `pushConsentDefaults` idempotent |
| `CONSENT_EVENT` | `'owlmeans:consent'` — dispatched by `applyConsent`, `detail.record` |
| `CONSENT_ESSENTIAL`, `CONSENT_ANALYTICS`, `CONSENT_MARKETING` | default category keys |
| `CONSENT_LANGUAGE_KEY` | `'owlmeans-lng'` — the interface-language storage key |
| `CONSENT_LOCALES` | `en pl ru be uk es de fr` |
| `DEFAULT_CONSENT_MESSAGES` | built-in dialog copy per locale |
| `DEFAULT_CONSENT_CATEGORIES` | `essential` (required), `analytics`, `marketing` |
| `CONSENT_SIGNAL_DEFAULTS` | every Consent Mode v2 signal `denied`, except `security_storage` `granted` |
| `CONSENT_LINK_PARAM`, `CONSENT_LINK_MAX_AGE`, `CONSENT_LINK_SKEW` | `'owlcc'`, `300` s, `60` s |
| `CONSENT_REQUIRED_COUNTRIES` | where a located visitor is asked — the union of `CONSENT_COUNTRIES_GDPR`, `CONSENT_COUNTRIES_ALIGNED`, `CONSENT_COUNTRIES_OPT_IN` |
| `CONSENT_GEO_UNKNOWN` | codes that name no country (`XX`, `T1`, …) — asked |
| `CONSENT_TRACE_PATH`, `CONSENT_GEO_TIMEOUT` | `'/cdn-cgi/trace'`, `2500` ms |
| `CONSENT_AUTO_MAX_AGE` | `3600` s — how long an automatic decision is trusted |
| `CONSENT_IDLE_STATE` | the frozen pre-init state and server snapshot |
| `CONSENT_STATE_ATTRIBUTE` | `'data-consent'` on `<html>`: `locating`, `open`, `decided`, `idle` |

### Types

| Symbol | Purpose |
|---|---|
| `ConsentSignal` | the Consent Mode v2 signal names |
| `ConsentCategory`, `ConsentRecord`, `ConsentService` | category, stored decision, disclosed third-party service |
| `ConsentOptions` | `categories?`, `storageKey?`, `cookieDays?`, `cookieDomain?`, `silent?`, `linker?`, `geo?` |
| `ConsentGeoOptions`, `ConsentCloudflareOptions`, `ConsentGeoPlugin`, `ConsentGeoLocation`, `ConsentLocating` | the geo gate: `cloudflare?`, `countries?`, `timeout?`; a locator plugin; its answer; the lookup phase |
| `ConsentGeoHelper`, `ConsentGeoVerdict`, `ConsentAutoState` | the geo helper's interface, `'ask' \| 'auto'`, `'fresh' \| 'stale'` |
| `ConsentLinkerOptions`, `ConsentLinkerLanguage` | `domains`, `param?`, `maxAge?`, `language?`; `supported?`, `storageKey?` |
| `ConsentState`, `ConsentReason`, `ConsentListener`, `ConsentStore` | store state and contract |
| `ConsentLocale`, `ConsentLinkPayload`, `ConsentPlugin` | locale union, decoded `owlcc` payload, plugin seam |
| `ConsentModeHelper`, `ConsentStorageHelper`, `ConsentLinkHelper`, `ConsentPluginHelper`, `ConsentI18nHelper` | helper interfaces |

## Cross-domain linking rules

`consentLinker().adopt` accepts a decorated link only when the payload decodes with the current
version, the referrer host is a listed domain, the timestamp is within `maxAge` (and at most 60 s in
the future), and every local optional category is present. It runs only when the document has no
stored record. The parameter is stripped from the visible URL whether or not it was adopted. Links
with `rel="noreferrer"` are never decorated.

## Common pitfalls

- Stamp `consentBootstrapScript()` inline above the tag-manager snippet; pushing defaults from a
  React bundle is too late.
- `silent: true` suppresses runtime pushes only — the stamped bootstrap string still pushes.
- Do not set `cookieDomain` on an existing site: it orphans the host-only cookie and re-asks every
  visitor. Do not change `CONSENT_KEY` for the same reason.
- Never present the required category as a choice, and never word a login gate as consent to
  essential cookies.
- Consent Mode speaks on `window.dataLayer` only; a tag on another queue never hears it.
- Neither `consentBootstrapScript`, `consentGateScript` nor the composed result is HTML-escaped by
  this package beyond JSON-encoding its own values.
- Release both ends of a linked domain pair together: a receiver that asks about a category the
  sender dropped refuses the link.

The `consent` skill covers the category model, storage migration, the ordering rule, gated loading,
the plugin seam and language linking in depth.

## Related packages

- [`@owlmeans/web-consent`](../web-consent) — the React dialog, re-open button, `CookiePolicy` and `useConsent`
- [`@owlmeans/web-gtm`](../web-gtm) — Google tag head snippet, CSP hosts and Google service disclosure
- [`@owlmeans/web-panel`](../web-panel) — `/consent` subpath bound to OwlMeans i18n and the panel menu
- [`@owlmeans/astro`](../astro) — `owlHeadScripts` for Astro sites, legal-page suppression
- [`@owlmeans/web-marketing-consent`](../web-marketing-consent) — bridges marketing preferences into `consentStore.save`
- [`@owlmeans/client-i18n`](../client-i18n) — reads the `owlmeans-lng` language choice this package may write
