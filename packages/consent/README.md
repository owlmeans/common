# @owlmeans/consent

The framework-free, provider-agnostic core of OwlMeans cookie consent: the category model, dual
localStorage/cookie storage with in-place migration, the observable document-level `consentStore`,
a host for signal providers (the code that tells a tag vendor what was decided), the inline head
scripts that act on a stored decision before any bundle runs, the tracking gate for loaders, the
built-in dialog copy in eight languages, and cross-domain consent through decorated links. It has
**zero runtime dependencies** and names no tag vendor, so an Astro island or a plain script can load
it. An app uses it directly to read a decision outside React, gate a loader or register a signal
provider. It renders nothing — the dialog, the re-open button and the cookie-policy page are
`@owlmeans/web-consent` (or `@owlmeans/web-panel/consent` bound to OwlMeans i18n) — and a vendor's
signals and tag snippet live in that vendor's package (OwlMeans connect). Per-person marketing
preferences on the server are `@owlmeans/marketing-consent`, not this package.

## Installation

```bash
bun add @owlmeans/consent@^0.2.0-alpha.1
```

## Concepts

- **Category** — a `ConsentCategory`: a stable `key`, label/description keys, an optional
  `globalVar` written on `window`, and `tracking` — whether granting it lets a consent-gated loader
  run. The defaults are `essential` (required), `analytics` and `marketing` (both `tracking`).
- **Required category** — always granted and rendered locked: disclosure, not a question.
- **Record** — a `ConsentRecord` `{ v?, [categoryKey]: boolean }`, stored under
  `site_cookie_consent` in both localStorage and a 365-day `SameSite=Lax` cookie, localStorage read
  first. A record without `v` is migrated in place (`essential: true`, `v: 2`), never discarded.
- **Store** — `consentStore`, a module singleton: consent belongs to the document, not to a
  component tree, and is reachable from click handlers and non-React code.
- **Signal provider** — a `ConsentSignalProvider` `{ id, defaults, apply, bootstrapScript? }`,
  registered explicitly with `consentSignalHelper.register`. The store calls every provider's
  `defaults` on init and `apply` with every decision, after writing the category globals and before
  dispatching `CONSENT_EVENT`. With none registered the store works the same and signals nothing.
- **Ordering rule** — a tag obeys the state present when it loads, so a provider's defaults and a
  stored decision come from an inline script stamped above the tag's loader, never from a bundle.
- **Plugin** — a `ConsentPlugin` that can `adopt` a decision or a language from outside storage,
  `decorate` outgoing URLs and disclose `domains`. `consentLinkHelper.consentLinker()` is the one
  built-in plugin.
- **Interface language** — strictly necessary storage (`owlmeans-lng`); no category governs it.

## Usage

### Start the store and read the decision

```typescript
import { consentStore, CONSENT_ANALYTICS } from '@owlmeans/consent'

consentStore.init()   // providers' defaults, read + migrate, apply, open when nothing is stored

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

### Register a signal provider

```typescript
import { consentSignalHelper } from '@owlmeans/consent'
import type { ConsentSignalProvider } from '@owlmeans/consent'

const pixel: ConsentSignalProvider = {
  id: 'my-pixel',
  defaults: () => { myPixel.consent(false) },                 // before anything is read
  apply: record => { myPixel.consent(record.marketing === true) },
}

consentSignalHelper.register(pixel)   // once, at bundle scope, before the store starts
```

A tag vendor's package ships its provider and an `append…` helper that registers it (connect's
`@owlmeans/web-gtm`: `appendGoogleConsentMode()`).

### Stamp the head snippet and gate a loader

```typescript
import { consentTrackingHelper } from '@owlmeans/consent'

const bootstrap = consentTrackingHelper.consentBootstrapScript()   // linker + stored record → globals

// Withhold a loader until tracking is granted (now or by a later CONSENT_EVENT)
const gated = consentTrackingHelper.consentGateScript(loaderIife)

// Escaping `</script` / `<!--` in the composed inline script is the caller's job
const head = `<script>${bootstrap};${gated}</script>`
```

A page whose tag needs its vendor's signal defaults stamps that vendor's head bootstrap instead of
`consentBootstrapScript` (it carries the linker fragment and the globals too). A provider package
builds its bootstrap over the same storage contract with `storageReadScript` and `staleAutoScript`.

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
| `consentSignalHelper`, `createConsentSignalHelper()` | host | `register`, `unregister`, `get`, `list`, `clear`, `defaults(opts?)`, `apply(record, opts?)` |
| `consentTrackingHelper`, `createConsentTrackingHelper()` | helper | `trackingGranted`, `consentBootstrapScript`, `consentGateScript`, `storageReadScript`, `staleAutoScript` |
| `consentLinkHelper`, `createConsentLinkHelper()` | helper | `encodeConsentLink`, `decodeConsentLink`, `writeConsentLanguage`, `consentLinker`, `stripConsentLinkParam`, `consentLinkerScript` |
| `consentPluginHelper`, `createConsentPluginHelper()` | helper | `registerConsentPlugin`, `unregisterConsentPlugin`, `consentPlugins`, `decorateConsentUrl`, `consentDomains`, `adoptConsent`, `adoptConsentLanguage`, `startConsentPlugins`, `locateConsent` |
| `consentGeoHelper`, `createConsentGeoHelper()` | helper | `enabled`, `parseTrace`, `cloudflareLocator`, `requiresConsent`, `decide`, `privacySignal`, `automaticRecord`, `autoState` |
| `consentI18nHelper`, `createConsentI18nHelper()` | helper | `normalizeLocale`, `defaultConsentTranslate`, `interpolate` |

Deprecated top-level wrappers (`compat:factory-refactor`) remain exported: `readConsent`,
`writeConsent`, `clearConsent`, `openConsent`, `isConsented`, `consentBootstrapScript`,
`defaultConsentTranslate`, `decorateConsentUrl`, `encodeConsentLink`, `consentLinkerScript`. So does
`consentModeHelper` (`compat:consent-signals`), reduced to provider-free delegates —
`trackingGranted`, `consentBootstrapScript`, `consentGateScript` to `consentTrackingHelper`,
`pushConsentDefaults`, `applyConsent` to `consentSignalHelper` — so a generated build script that
imports it keeps building. New code calls the helper members.

### Constants

| Symbol | Value / purpose |
|---|---|
| `CONSENT_KEY` | `'site_cookie_consent'` — storage key, must not change |
| `CONSENT_COOKIE_DAYS` | `365` |
| `CONSENT_SCHEMA_VERSION` | `2` — stored record shape |
| `CONSENT_EVENT` | `'owlmeans:consent'` — dispatched by `consentSignalHelper.apply` after the globals and every provider, `detail.record` |
| `CONSENT_ESSENTIAL`, `CONSENT_ANALYTICS`, `CONSENT_MARKETING` | default category keys |
| `CONSENT_LANGUAGE_KEY` | `'owlmeans-lng'` — the interface-language storage key |
| `CONSENT_LOCALES` | `en pl ru be uk es de fr` |
| `DEFAULT_CONSENT_MESSAGES` | built-in dialog copy per locale |
| `DEFAULT_CONSENT_CATEGORIES` | `essential` (required), `analytics` and `marketing` (`tracking: true`) |
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
| `ConsentCategory`, `ConsentRecord`, `ConsentService` | category, stored decision, disclosed third-party service |
| `ConsentSignalProvider`, `ConsentSignalHelper` | a signal provider; the host's interface |
| `ConsentOptions` | `categories?`, `storageKey?`, `cookieDays?`, `cookieDomain?`, `silent?`, `linker?`, `geo?` |
| `ConsentGeoOptions`, `ConsentCloudflareOptions`, `ConsentGeoPlugin`, `ConsentGeoLocation`, `ConsentLocating` | the geo gate: `cloudflare?`, `countries?`, `timeout?`; a locator plugin; its answer; the lookup phase |
| `ConsentGeoHelper`, `ConsentGeoVerdict`, `ConsentAutoState` | the geo helper's interface, `'ask' \| 'auto'`, `'fresh' \| 'stale'` |
| `ConsentLinkerOptions`, `ConsentLinkerLanguage` | `domains`, `param?`, `maxAge?`, `language?`; `supported?`, `storageKey?` |
| `ConsentState`, `ConsentReason`, `ConsentListener`, `ConsentStore` | store state and contract |
| `ConsentLocale`, `ConsentLinkPayload`, `ConsentPlugin` | locale union, decoded `owlcc` payload, plugin seam |
| `ConsentTrackingHelper`, `ConsentStorageHelper`, `ConsentLinkHelper`, `ConsentPluginHelper`, `ConsentI18nHelper` | helper interfaces |
| `ConsentModeHelper` | deprecated — the provider-free members kept on `consentModeHelper` |

## Cross-domain linking rules

`consentLinker().adopt` accepts a decorated link only when the payload decodes with the current
version, the referrer host is a listed domain, the timestamp is within `maxAge` (and at most 60 s in
the future), and every local optional category is present. It runs only when the document has no
stored record. The parameter is stripped from the visible URL whether or not it was adopted. Links
with `rel="noreferrer"` are never decorated.

## Common pitfalls

- Stamp the head bootstrap inline above any tag loader; a decision applied from a React bundle is
  too late for a tag that already loaded.
- Register signal providers explicitly, once, before the store starts — importing a vendor package
  registers nothing. Pass the same category set to a provider's head bootstrap and to the store.
- `silent: true` suppresses the runtime effects only (globals, providers, `CONSENT_EVENT`) — a
  stamped bootstrap string still runs.
- Do not set `cookieDomain` on an existing site: it orphans the host-only cookie and re-asks every
  visitor. Do not change `CONSENT_KEY` for the same reason.
- Never present the required category as a choice, and never word a login gate as consent to
  essential cookies.
- A loader gated with `consentGateScript` waits for an optional `tracking` category; a custom
  category that should release it needs `tracking: true`.
- Neither `consentBootstrapScript`, `consentGateScript` nor the composed result is HTML-escaped by
  this package beyond JSON-encoding its own values.
- Release both ends of a linked domain pair together: a receiver that asks about a category the
  sender dropped refuses the link.

The `consent` skill covers the category model, storage migration, the signal host, the ordering
rule, gated loading, the plugin seam and language linking in depth.

## Related packages

- [`@owlmeans/web-consent`](../web-consent) — the React dialog, re-open button, `CookiePolicy` and `useConsent`
- [`@owlmeans/web-gtm`](https://github.com/owlmeans/connect/tree/main/packages/web-gtm) (OwlMeans connect) — Google Consent Mode as a signal provider, the Google tag head snippet, CSP hosts and service disclosure
- [`@owlmeans/web-panel`](../web-panel) — `/consent` subpath bound to OwlMeans i18n and the panel menu
- [`@owlmeans/astro`](../astro) — consent + head tag wiring for Astro sites, legal-page suppression
- [`@owlmeans/web-marketing-consent`](../web-marketing-consent) — bridges marketing preferences into `consentStore.save`
- [`@owlmeans/client-i18n`](../client-i18n) — reads the `owlmeans-lng` language choice this package may write
