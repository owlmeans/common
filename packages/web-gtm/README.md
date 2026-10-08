# @owlmeans/web-gtm

The Google tag half of OwlMeans cookie consent. It emits the inline `<head>` script for any Google
id — Tag Manager (`GTM-`), GA4 (`G-`), Google tag (`GT-`), Google Ads (`AW-`), Floodlight (`DC-`) —
with the Consent Mode defaults declared **before** the loader runs, plus the id validator, the CSP
host lists, the cookie-policy disclosure for a tag, the `<noscript>` frame and a script-side loader
for hosts that cannot edit their HTML. It produces strings and data, holds no state, and reads the
consent decision from `@owlmeans/consent`. A web app or static site uses it whenever it runs a Google
tag. It does not render the consent dialog (`@owlmeans/web-consent`) and has no event API — events
reach `dataLayer` through `@owlmeans/log` with `@owlmeans/web-log`'s `gtmAnalyticsPlugin`. The
`web-gtm` skill covers this package; the `consent` skill covers the model and ordering rule it
implements.

## Installation

```bash
bun add @owlmeans/web-gtm@^0.1.18-rc.36
```

## Concepts

- **Order** — a Google tag decides what it may do from the consent state present when it loads. A
  React bundle always arrives too late, so the head script emits the consent bootstrap first and the
  loader after it, as one inline script stamped from HTML.
- **Mode** — `'basic'` (the default, `GOOGLE_TAG_DEFAULT_MODE`) withholds the loader until a
  signal-bearing, non-required category is granted, from storage or a later `CONSENT_EVENT`.
  `'advanced'` loads immediately with Consent Mode signals denied.
- **Bootstrap** — `consentModeHelper.consentBootstrapScript(opts)` from `@owlmeans/consent`: declares
  `consent/default` and applies a stored decision in the same turn. It runs in both modes.
- **Kind** — `'gtm'` (container, `gtm.js`) for `GTM-`; `'gtag'` (`gtag/js` + `js` + `config`) for
  `G-`, `GT-`, `AW-`, `DC-`.
- **Disclosure** — `ConsentService` entries describing who receives data, derived from the id prefix
  for `CookiePolicy`'s `services`.

## Usage

### 1. Stamp the head script from HTML

Stamp it first in `<head>`, from the HTML build — never from the application bundle. A Vite app does
it with a `transformIndexHtml` plugin:

```typescript
import type { Plugin } from 'vite'
import { googleTagHelper } from '@owlmeans/web-gtm'

export const googleTagPlugin = (id: string): Plugin => ({
  name: 'google-tag',
  transformIndexHtml: html => html.replace(
    '<!-- google-tag -->',
    `<script>${googleTagHelper.googleTagHeadScript({ id })}</script>`
  ),
})
```

An invalid or empty id yields the consent bootstrap alone, so the call is safe to make
unconditionally. The output escapes `</` and `<!--`, so it can be placed inline as-is.

### 2. Keep the consent options in parity

`GoogleTagOptions` extends `ConsentOptions`. Pass the same `categories`, `storageKey` and `linker`
here as to `CookieConsent`, or the snippet and the dialog disagree about what was asked.

```typescript
import { googleTagHelper } from '@owlmeans/web-gtm'

const head = googleTagHelper.googleTagHeadScript({
  id: 'GTM-ABC1234',
  categories: appCategories,
  linker: { domains: ['owlmeans.com', 'owlmeans.pl'] },
})

// a site that has decided to load before consent, with signals denied
const eager = googleTagHelper.googleTagHeadScript({ id: 'G-ABCD1234', mode: 'advanced' })
```

### 3. Validate the id where it is stored

```typescript
import { googleTagHelper } from '@owlmeans/web-gtm'

if (!googleTagHelper.isGoogleTagId(form.googleTag)) {
  throw new Error('invalid-google-tag')
}
googleTagHelper.googleTagKind('GTM-ABC1234')   // 'gtm'
googleTagHelper.googleTagKind('AW-123456789')  // 'gtag'
googleTagHelper.googleTagKind('UA-1234-1')     // null — Universal Analytics is retired
```

### 4. Allow the tag in the CSP

```typescript
import { GOOGLE_TAG_CSP_SOURCES, GOOGLE_TAG_FRAME_SOURCES } from '@owlmeans/web-gtm'

const csp = [
  `script-src 'self' ${scriptHash} ${GOOGLE_TAG_CSP_SOURCES.join(' ')}`,
  `connect-src 'self' ${GOOGLE_TAG_CSP_SOURCES.join(' ')}`,
  `img-src 'self' data: ${GOOGLE_TAG_CSP_SOURCES.join(' ')}`,
  `frame-src ${GOOGLE_TAG_FRAME_SOURCES.join(' ')}`,
].join('; ')
```

### 5. Disclose the tag on the cookie policy

```tsx
import { CookiePolicy } from '@owlmeans/web-consent'
import { googleTagHelper } from '@owlmeans/web-gtm'

<CookiePolicy services={googleTagHelper.googleTagServices(googleTag)} privacyHref="/legal/privacy" />
```

### 6. Load from script when the HTML is not yours

For a single-page app that cannot edit its own head. It calls `consentStore.init(opts)` first,
refuses to load twice, gates the same way in `'basic'` mode, and does nothing without a `document`.

```typescript
import { googleTagHelper } from '@owlmeans/web-gtm'

googleTagHelper.loadGtm({ id: 'GTM-ABC1234', categories: appCategories })
```

## API

### `googleTagHelper` (`GoogleTagHelper`, built by `createGoogleTagHelper()`)

| Member | Returns | Purpose |
|---|---|---|
| `googleTagHeadScript(opts: GoogleTagOptions)` | `string` | Bootstrap, then `ads_data_redaction` on and `url_passthrough` off, then the loader for the id's kind (gated in `'basic'`); HTML-inline-safe. **The default for new code** |
| `gtmHeadScript(opts: GtmOptions)` | `string` | Older container-only form: bootstrap then `gtm.js`; gated the same way; does not escape `</` |
| `gtmNoscriptFrame(opts: GtmOptions)` | `string` | Hidden `<noscript>` iframe for `<body>`; `''` in `'basic'` mode |
| `loadGtm(opts: GtmOptions)` | `void` | Script-side container load (fallback) |
| `isGoogleTagId(id)` | `boolean` | Strict id check: `GTM-` + 4–12, or `G-`/`GT-`/`AW-`/`DC-` + 4–16 upper-case letters and digits |
| `googleTagKind(id)` | `'gtm' \| 'gtag' \| null` | Which loader an id takes |
| `googleTagServices(id)` | `ConsentService[]` | Cookie-policy disclosure read off the prefix |

`googleTagServices` returns: `G-` → Google Analytics (analytics; `_ga`, `_ga_<id>`); `AW-` → Google
Ads (marketing; `_gcl_au`, `_gcl_aw`); `DC-` → Floodlight (marketing; `_gcl_au`, `_gcl_dc`); `GTM-`
and `GT-` → one analytics and one advertising entry; an invalid id → `[]`.

### Constants

| Symbol | Value |
|---|---|
| `GOOGLE_TAG_DEFAULT_MODE` | `'basic'` |
| `GOOGLE_TAG_CSP_SOURCES` | frozen list for `script-src`, `connect-src`, `img-src`: `*.googletagmanager.com`, `*.google-analytics.com`, `*.g.doubleclick.net`, `ad.doubleclick.net`, `www.googleadservices.com`, `pagead2.googlesyndication.com`, `*.google.com` (all `https://`) |
| `GOOGLE_TAG_FRAME_SOURCES` | frozen list for `frame-src`: `https://www.googletagmanager.com`, `https://td.doubleclick.net` |

### Types

| Symbol | Shape |
|---|---|
| `GoogleTagOptions` | `ConsentOptions` + `{ id, dataLayerName?, mode? }` |
| `GtmOptions` | `ConsentOptions` + `{ id, dataLayerName?, mode? }` (container id) |
| `GoogleTagMode` | `'basic' \| 'advanced'` |
| `GoogleTagKind` | `'gtm' \| 'gtag'` |
| `GoogleTagHelper` | the helper interface above |

### Deprecated wrappers

`gtmHeadScript`, `gtmNoscriptFrame`, `isGoogleTagId`, `googleTagHeadScript`, `googleTagServices` —
top-level functions delegating to `googleTagHelper`. Use the helper members.

## Common pitfalls

- Loading the tag from the bundle (or with `loadGtm` where the head is editable) lets it run before
  the consent defaults exist; stamp the head script from HTML.
- `dataLayerName`: Consent Mode always speaks on `window.dataLayer`, so a tag on another queue never
  hears a consent command. Leave it unset on a consent-gated page.
- Code written before `'basic'` became the default and expects the tag to load unconditionally must
  pass `mode: 'advanced'` explicitly.
- In `'basic'` mode a page counts as "tagged" in Tag Manager only after a consenting visitor loaded
  it; a URL that redirects before the loader runs stays "not tagged".
- `isGoogleTagId` rejects lower case and `UA-` ids — normalise in the form, and validate where the
  id is stored, not only where it is emitted.
- Under a hash-based CSP, Tag Manager Custom HTML tags and Custom JavaScript variables cannot run;
  build containers from Google's built-in tag templates.
- Never build the snippet or the noscript frame by hand — the helpers JSON- or URL-encode the id and
  queue name.

## Related packages

- [`@owlmeans/consent`](../consent) — the bootstrap, `consentGateScript`, `trackingGranted` and `consentStore`
- [`@owlmeans/web-consent`](../web-consent) — the dialog and `CookiePolicy` that consume `googleTagServices`
- [`@owlmeans/web-log`](../web-log) — consent-gated analytics events onto `dataLayer`
- [`@owlmeans/astro`](../astro) — composes these head strings for an Astro layout

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.51
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
