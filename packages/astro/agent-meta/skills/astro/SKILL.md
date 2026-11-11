---
name: astro
description: "How to use @owlmeans/astro — consent + head tag wiring for Astro sites: the head/noscript/adopt strings a layout stamps before hydration (owlHeadScripts with a HeadTag rendered by a tag package), the legal-page test that suppresses tracking, and the locale conversion that keeps a default-locale page out of English. Auto-invoked when writing an Astro layout, stamping a consent snippet or a tag into a static site, or importing astroHelper (owlHeadScripts, isLegalPath, owlLocale)."
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/astro

**Layer:** Web (Astro)
**Install:** `"@owlmeans/astro": "^0.2.0-alpha.1"` in `dependencies`

## Why it exists

Astro's model is HTML first and islands second — the opposite of every other consumer of the
OwlMeans browser packages. The parts that must run **before** hydration (a stored consent decision,
a tag loader with its vendor's consent defaults) therefore cannot come from a component at all: by the time an island mounts, a tag has been
running for hundreds of milliseconds and has already decided what it may do. This package turns
those parts into plain strings a layout stamps with `set:html`, plus the two small conversions
between Astro's vocabulary and this framework's.

**Nothing here imports Astro, and nothing here knows a tag vendor.** An Astro import would make the
package unusable outside one; a vendor would make common depend on a provider. A tag arrives already
rendered, as a `HeadTag`, from its own package — the provider packages live in OwlMeans connect.

## Key Exports

| Export | Description |
|--------|-------------|
| `astroHelper.owlHeadScripts(opts?)` | `{ head, noscript, adopt }` — everything a page puts in its head, in the one order that works |
| `HeadScriptsOptions` | `{ tag?: HeadTag, consent?: ConsentOptions }` |
| `HeadTag` | `{ head, noscript }` — a tag rendered by its package from the SAME consent options |
| `HeadScripts` | The result: `head` is inline `<script>` content, `noscript` is `<body>` content, `adopt` is the standalone cross-domain-consent fragment |
| `astroHelper.isLegalPath(pathname, segment?)` | Whether this page must carry no tracking at all |
| `astroHelper.owlLocale(currentLocale, fallback?)` | `Astro.currentLocale` as this framework's locale |
| `ConsentOptions` / `ConsentCategory` (re-exports) | The consent options from `@owlmeans/consent` |

## Stamping the head

```astro
---
import { astroHelper } from '@owlmeans/astro'
import { tagHelper } from '<tag package>'   // renders a HeadTag; throws on an id it cannot load

const isLegalPage = astroHelper.isLegalPath(Astro.url.pathname)
const consent = { linker: SITE.consentLinker }
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

The contract:

- **Without a tag, `head` is consent's neutral bootstrap** —
  `consentTrackingHelper.consentBootstrapScript(consent)`: the linker fragment and a stored decision
  written onto the category globals, declaring no vendor's signals — and `noscript` is `''`. A page
  that wants a vendor's signal defaults in place for a tag it adds later passes that vendor's
  signal-only head as `tag` (connect's `googleTagHelper.consentHeadTag(consent)`).
- **With a tag, `head` and `noscript` are the tag's, returned untouched.** The tag's `head` REPLACES
  the plain bootstrap, so its package must emit its consent bootstrap (its defaults, the linker
  fragment, the stored decision) first and its loader after it, as one inline script — which is why
  the tag is built from the SAME `consent` options passed here. The site also registers the same
  vendor's signal provider where its consent island runs, so later decisions reach the tag.
  `noscript` is whatever script-less form the tag has, or `''` (a consent-gated tag has none: a
  browser without JavaScript cannot have granted anything).
- **Stamp `head` above everything else in `<head>`** except `adopt`. It is generated rather than
  hand-written precisely because the ORDER is the whole point; moving it below another script
  re-opens the window this package exists to close.
- **The tag package validates its id.** It throws on an id it cannot load, so a mistyped id fails the
  build where the layout renders it, instead of shipping every page with no tag.
- Render `noscript` from the returned object; a hand-written fallback loads the tag for visitors who
  never consented.
- **Coverage of a consent-gated tag.** A tag that loads only on a consenting visit marks a page as
  covered in its vendor's report only after a consenting visitor opens it. A client-side redirect
  that runs before `tags.head` leaves the URL it redirected AWAY from uncovered — never auto-redirect
  from a URL that already names its locale, and keep the query string on every hop. Pin the tag's
  gating mode explicitly on a site whose cookie policy forbids tags before opt-in, rather than relying
  on its package default.
- The tag-less `head` is the bootstrap exactly as `@owlmeans/consent` emits it; keep configured
  category keys and storage keys free of `</script` (a tag package escapes its own output).

## Cross-domain consent: `adopt`, stamped first

`consent.linker` (`ConsentLinkerOptions` — see the `consent` skill's plugin-seam section) turns on
sharing a decision between first-party domains through a decorated link:

```astro
const consent = { linker: { domains: SITE.consentDomains, language: {} } }
const tags = astroHelper.owlHeadScripts({ consent, tag: tagHelper.headTag({ ...consent, id: SITE.tagId }) })
```

`language: {}` makes every link to a listed domain also carry the page's `<html lang>`. A site that
also RECEIVES a language (a platform link back to the site) passes `language: { supported: [...] }`,
and `tags.adopt` then writes it before anything else runs — but only while that site holds a cookie
decision (stored, or carried by the same link).
Give the consent island the same object (`linker={SITE.consentLinker}`) so head and island agree.

**The geo gate is the island's alone.** `geo={{ cloudflare: true }}` on `<CookieConsent client:load />`
asks only visitors located in a consent country (the `consent` skill); the head strings need nothing
for it — the inline bootstrap and gate already skip an automatic decision past its age. It must be
plain data, because an island prop is serialized: a locator plugin of the site's own needs a small
wrapper island that registers it before rendering `CookieConsent`. Legal pages, which mount no
island, never locate anyone.

`tags.adopt` is the STANDALONE adopt-and-strip fragment (`consentLinkHelper.consentLinkerScript`) —
built from `consent` whenever `consent.linker` is set, empty string otherwise, with or without a tag.
Stamp it **first**, above `tags.head` and above everything else in `<head>` (the locale-redirect
script included — its own `?lc=1` handling must not race the linker for the URL).

**Stamp it on every page, legal ones included.** A `head` built with the same consent options —
the plain bootstrap or a tag's — already carries the SAME fragment (first in the neutral bootstrap,
right after the defaults in a tag's), so the two runs on such a
page are harmless: the second finds the parameter already gone and does nothing. `adopt` on its own
is what a legal page needs, since it stamps no `head` at all (see below): adopting a cross-domain
cookie-consent CHOICE sets no tracking cookie and signals nothing to any tag, so it is not the
tracking this rule exists to keep off a legal page.

## Legal pages carry no tracking

A legal page is where a visitor goes to READ what is being collected; collecting there while they
read is the one thing it must not do.

```typescript
astroHelper.isLegalPath('/legal')            // true
astroHelper.isLegalPath('/pl/legal/terms')   // true — with or without a locale prefix
astroHelper.isLegalPath('/legalese')         // false — a page that merely starts with the word is not one
astroHelper.isLegalPath('/about/legal')      // false — the segment must be at the top level
astroHelper.isLegalPath('/policies/privacy', 'policies')   // true — the segment is configurable
```

On a legal page skip stamping `head` and `noscript` (or call `owlHeadScripts` without a `tag` and
stamp the bare bootstrap). `tags.adopt` is unaffected — see above — and is stamped there too.

## Locale

**`Astro.currentLocale` is `undefined` on a default-locale page, not the default locale.** Feeding
it straight to a component renders English for everyone landing on `/` — including the sites where
`/` is not English.

```typescript
const locale = astroHelper.owlLocale(Astro.currentLocale, 'pl')
```

An empty string is treated the same as `undefined`; a real locale passes through untouched.

## Depends On

- `@owlmeans/consent` — `consentTrackingHelper.consentBootstrapScript`, `consentLinkHelper.consentLinkerScript`,
  the category model and the storage contract

Rendering the dialog itself is separate — that is `@owlmeans/web-consent`, mounted as an island, or
the site's own component over the same store. A tag is the site's own dependency on its tag package.

## Related

- `consent` — the categories, the storage record and its migration, and why the ordering rule exists
- `web-consent` — the dialog, the re-open button and the cookie-policy page
