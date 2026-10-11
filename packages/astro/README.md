# @owlmeans/astro

Astro-side wiring for the OwlMeans browser packages. Astro renders HTML first and hydrates islands
second, so the parts that must run before hydration — the Consent Mode defaults, the cross-domain
consent adoption, the Google tag loader — cannot come from a component. This package returns them as
plain strings a layout stamps with `set:html`, plus a legal-page test and a locale conversion. An
Astro site (owlmeans.com) uses it in its base layout. It imports nothing from Astro and renders no
UI: the consent dialog is `@owlmeans/web-consent` mounted as an island, and a non-Astro web app
composes the same pieces from `@owlmeans/consent` and `@owlmeans/web-gtm` directly.

## Installation

```bash
bun add @owlmeans/astro@^0.1.18-rc.37
```

## Concepts

- **Head scripts** — `HeadScripts` `{ head, noscript, adopt }`: inline `<head>` script content,
  `<noscript>` content for the top of `<body>`, and the standalone cross-domain adopt fragment.
- **Ordering** — `head` declares `consent/default` first, then the ads-redaction flags, then the tag
  loader. It is stamped above every other script in `<head>`.
- **Gated mode** — `owlHeadScripts` never forces `gtm.mode`, so it inherits `@owlmeans/web-gtm`'s
  default `'basic'`: the loader waits for a consenting decision and `noscript` stays empty.
  `'advanced'` loads unconditionally and, for a `GTM-` container, fills `noscript`.
- **Adopt fragment** — `adopt` is `consentLinkHelper.consentLinkerScript(consent)`; non-empty only
  when `consent.linker` is set. `head` embeds the same fragment when a tag is configured; running it
  twice has no double effect.
- **Legal page** — a page under `/legal` (optionally locale-prefixed) carries no tracking.
- **Locale** — `Astro.currentLocale` is `undefined` on a default-locale page; `owlLocale` replaces it
  with an explicit fallback.

## Usage

### Stamp the head in a layout

```astro
---
import { astroHelper } from '@owlmeans/astro'

const locale = astroHelper.owlLocale(Astro.currentLocale, 'pl')
const isLegalPage = astroHelper.isLegalPath(Astro.url.pathname)
const consent = { linker: { domains: ['owlmeans.com', 'owlmeans.pl'], language: {} } }
const tags = astroHelper.owlHeadScripts(isLegalPage ? { consent } : { gtm: { id: SITE.gtmId }, consent })
---
<html lang={locale}>
  <head>
    {tags.adopt !== '' && <script is:inline set:html={tags.adopt} />}
    <script is:inline set:html={tags.head} />
  </head>
  <body>
    {tags.noscript && <noscript set:html={tags.noscript} />}
    <slot />
  </body>
</html>
```

### Head scripts without a tag

With no `gtm` the result is still the consent defaults (and the stored decision), with an empty
`noscript`:

```typescript
import { astroHelper } from '@owlmeans/astro'

const { head, noscript, adopt } = astroHelper.owlHeadScripts()
// head: consent bootstrap only; noscript: ''; adopt: ''
```

### Legal paths and locale

```typescript
import { astroHelper } from '@owlmeans/astro'

astroHelper.isLegalPath('/legal')                         // true
astroHelper.isLegalPath('/pl/legal/terms')                // true
astroHelper.isLegalPath('/legalese')                      // false
astroHelper.isLegalPath('/policies/privacy', 'policies')  // true — configurable segment

astroHelper.owlLocale(undefined, 'pl')   // 'pl'
astroHelper.owlLocale('', 'pl')          // 'pl'
astroHelper.owlLocale('uk', 'pl')        // 'uk'
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `astroHelper`, `createAstroHelper()` | helper | the three members below |
| `astroHelper.owlHeadScripts(opts?)` | member | `HeadScriptsOptions → HeadScripts`; throws `Error` when `gtm.id` is not a loadable Google tag id |
| `astroHelper.isLegalPath(pathname, segment = 'legal')` | member | matches `/<segment>` or `/<xx>/<segment>`, followed by `/` or end |
| `astroHelper.owlLocale(currentLocale, fallback = 'en')` | member | `currentLocale` unless `undefined` or `''` |
| `HeadScripts` | type | `{ head, noscript, adopt }` |
| `HeadScriptsOptions` | type | `{ gtm?: GoogleTagOptions, consent?: ConsentOptions }` |
| `AstroHelper` | type | the helper interface |
| `GoogleTagOptions`, `GtmOptions` | type re-exports | from `@owlmeans/web-gtm` |
| `ConsentOptions`, `ConsentCategory` | type re-exports | from `@owlmeans/consent` |
| `owlHeadScripts`, `isLegalPath`, `owlLocale` | deprecated functions | `compat:factory-refactor` wrappers — call the `astroHelper` members |

`gtm.id` accepts `GTM-`, `G-`, `GT-`, `AW-` and `DC-` ids. A gtag.js id (`G-` etc.) loads `gtag/js`
and never yields a `noscript` frame. Configured values are escaped so the result is safe to stamp
inline.

## Common pitfalls

- Stamp `adopt` first and `head` next, above every other script — including a locale-redirect
  script, which must not race the linker for the URL.
- Render `noscript` from the returned value; a hand-written `ns.html` frame loads the container for
  visitors who never consented.
- Pass the same `consent` options to `owlHeadScripts` and to the consent island, or the inline
  snippet and the dialog disagree about categories, storage key and linked domains.
- Drop `gtm` on legal pages, but keep stamping `adopt` there — adopting a cross-domain choice is not
  tracking.
- In `'basic'` mode a page appears as tagged in the tag manager's coverage report only after a
  consenting visit; never redirect before `head` runs from a URL that already names its locale.
- Never feed `Astro.currentLocale` straight to a component; pass it through `owlLocale`.

The `astro` skill covers the stamping order, gated mode, adopt placement and legal-page rules; the
`consent` skill covers the underlying consent model.

## Related packages

- [`@owlmeans/consent`](../consent) — consent categories, storage, Consent Mode bootstrap and the cross-domain linker
- [`@owlmeans/web-gtm`](../web-gtm) — the Google tag head script, id validation and the `noscript` frame
- [`@owlmeans/web-consent`](../web-consent) — the consent dialog and cookie-policy page, mounted as an island

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.52
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
