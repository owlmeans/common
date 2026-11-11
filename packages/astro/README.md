# @owlmeans/astro

Consent + head tag wiring for Astro sites. Astro renders HTML first and hydrates islands second, so
the parts that must run before hydration — a stored consent decision, the cross-domain consent
adoption, a tag loader with its consent defaults — cannot come from a component. This package returns them as plain strings a layout
stamps with `set:html`, plus a legal-page test and a locale conversion. An Astro site (owlmeans.com)
uses it in its base layout. It imports nothing from Astro, knows no tag vendor and renders no UI: a
tag arrives already rendered as a `HeadTag` from its own package (the provider packages live in
OwlMeans connect), the consent dialog is `@owlmeans/web-consent` mounted as an island, and a
non-Astro web app composes the same pieces from `@owlmeans/consent` and the tag package directly.

## Installation

```bash
bun add @owlmeans/astro@^0.2.0-alpha.1
```

## Concepts

- **Head scripts** — `HeadScripts` `{ head, noscript, adopt }`: inline `<head>` script content,
  `<noscript>` content for the top of `<body>`, and the standalone cross-domain adopt fragment.
- **Head tag** — `HeadTag` `{ head, noscript }`: a tag rendered by its own package from the SAME
  consent options. Its `head` carries the tag's consent bootstrap (its vendor's defaults, the linker
  fragment, the stored decision) first and the loader after it, so it replaces the plain bootstrap;
  `noscript` is its script-less fallback, or `''`.
- **Neutral bootstrap** — with no tag, `head` is `@owlmeans/consent`'s
  `consentTrackingHelper.consentBootstrapScript(consent)`: the linker fragment and a stored decision
  written onto the category globals. It declares no vendor's signals.
- **Ordering** — `head` runs before anything else that reads the consent state. It is stamped above
  every other script in `<head>`, `adopt` excepted.
- **Adopt fragment** — `adopt` is `consentLinkHelper.consentLinkerScript(consent)`; non-empty only
  when `consent.linker` is set, with or without a tag. A tag's `head` built with the same options
  embeds the same fragment; running it twice has no double effect.
- **Legal page** — a page under `/legal` (optionally locale-prefixed) carries no tracking.
- **Locale** — `Astro.currentLocale` is `undefined` on a default-locale page; `owlLocale` replaces it
  with an explicit fallback.

## Usage

### Stamp the head in a layout

```astro
---
import { astroHelper } from '@owlmeans/astro'
import { tagHelper } from 'your-tag-package'   // any package that renders a HeadTag

const locale = astroHelper.owlLocale(Astro.currentLocale, 'pl')
const isLegalPage = astroHelper.isLegalPath(Astro.url.pathname)
const consent = { linker: { domains: ['owlmeans.com', 'owlmeans.pl'], language: {} } }
const tags = astroHelper.owlHeadScripts({ consent, tag: tagHelper.headTag({ ...consent, id: SITE.tagId }) })
---
<html lang={locale}>
  <head>
    {tags.adopt !== '' && <script is:inline set:html={tags.adopt} />}
    {!isLegalPage && <script is:inline set:html={tags.head} />}
  </head>
  <body>
    {!isLegalPage && tags.noscript !== '' && <noscript set:html={tags.noscript} />}
    <slot />
  </body>
</html>
```

The tag package validates its own id and throws on one it cannot load, so a mistyped id fails the
build where the layout renders it.

### Head scripts without a tag

With no `tag` the result is consent's neutral bootstrap (the stored decision on the category
globals), with an empty `noscript`:

```typescript
import { astroHelper } from '@owlmeans/astro'

const { head, noscript, adopt } = astroHelper.owlHeadScripts()
// head: neutral consent bootstrap; noscript: ''; adopt: ''
```

A page that loads no tag from its head but wants a vendor's consent defaults in place anyway (a tag
a later script adds) passes that vendor package's signal-only head as `tag` — for Google, connect's
`googleTagHelper.consentHeadTag(consent)`.

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
| `astroHelper.owlHeadScripts(opts?)` | member | `HeadScriptsOptions → HeadScripts`; with a `tag`, its `head` and `noscript` as rendered |
| `astroHelper.isLegalPath(pathname, segment = 'legal')` | member | matches `/<segment>` or `/<xx>/<segment>`, followed by `/` or end |
| `astroHelper.owlLocale(currentLocale, fallback = 'en')` | member | `currentLocale` unless `undefined` or `''` |
| `HeadScripts` | type | `{ head, noscript, adopt }` |
| `HeadScriptsOptions` | type | `{ tag?: HeadTag, consent?: ConsentOptions }` |
| `HeadTag` | type | `{ head, noscript }` — a tag rendered by its own package |
| `AstroHelper` | type | the helper interface |
| `ConsentOptions`, `ConsentCategory` | type re-exports | from `@owlmeans/consent` |
| `owlHeadScripts`, `isLegalPath`, `owlLocale` | deprecated functions | `compat:factory-refactor` wrappers — call the `astroHelper` members |

## Common pitfalls

- Stamp `adopt` first and `head` next, above every other script — including a locale-redirect
  script, which must not race the linker for the URL.
- Build the tag with the SAME `consent` options passed to `owlHeadScripts` and to the consent
  island; otherwise the tag's bootstrap, the adopt fragment and the dialog disagree about
  categories, storage key and linked domains.
- Render `noscript` from the returned value; a hand-written fallback loads the tag for visitors who
  never consented.
- Skip `head` and `noscript` on legal pages, but keep stamping `adopt` there — adopting a
  cross-domain choice is not tracking.
- A tag gated on consent appears as tagged in its vendor's coverage report only after a consenting
  visit; never redirect before `head` runs from a URL that already names its locale.
- The tag-less `head` is the neutral consent bootstrap as `@owlmeans/consent` emits it; keep configured
  category keys and storage keys free of `</script`.
- Never feed `Astro.currentLocale` straight to a component; pass it through `owlLocale`.

The `astro` skill covers the stamping order, the head-tag contract, adopt placement and legal-page
rules; the `consent` skill covers the underlying consent model.

## Related packages

- [`@owlmeans/consent`](../consent) — consent categories, storage, the consent bootstrap and the cross-domain linker
- [`@owlmeans/web-consent`](../web-consent) — the consent dialog and cookie-policy page, mounted as an island

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.1
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
