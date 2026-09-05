---
name: astro
description: "How to use @owlmeans/astro — the Astro-side wiring for the OwlMeans browser packages: the head/noscript strings a layout stamps before hydration, the legal-page test that suppresses tracking, and the locale conversion that keeps a default-locale page out of English. Auto-invoked when writing an Astro layout, stamping a tag-manager or consent snippet into a static site, or importing owlHeadScripts, isLegalPath or owlLocale."
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/astro

**Layer:** Web (Astro)
**Install:** `"@owlmeans/astro": "^0.1.18-rc.5"` in `dependencies`

## Why it exists

Astro's model is HTML first and islands second — the opposite of every other consumer of the
OwlMeans browser packages. The parts that must run **before** hydration (the consent defaults, the
tag container) therefore cannot come from a component at all: by the time an island mounts, the
container has been running for hundreds of milliseconds and has already decided what each tag may
do. This package turns those parts into plain strings a layout stamps with `set:html`, plus the two
small conversions between Astro's vocabulary and this framework's.

**Nothing here imports Astro.** That is deliberate — an Astro import would make the package
unusable outside one, and everything it needs is a value the caller already holds.

## Key Exports

| Export | Description |
|--------|-------------|
| `owlHeadScripts(opts?)` | `{ head, noscript }` — everything a page puts in its head, in the one order that works |
| `HeadScripts` | That result shape: `head` is inline `<script>` content, `noscript` is `<body>` content |
| `isLegalPath(pathname, segment?)` | Whether this page must carry no tracking at all |
| `owlLocale(currentLocale, fallback?)` | `Astro.currentLocale` as this framework's locale |
| `GtmOptions` (re-export) | The container options from `@owlmeans/web-gtm` |
| `ConsentOptions` / `ConsentCategory` (re-exports) | The consent options from `@owlmeans/consent` |

## Stamping the head

`owlHeadScripts` composes the consent bootstrap and the tag-manager container in the one order that
makes Consent Mode mean anything — defaults first, container second:

```astro
---
import { owlHeadScripts, isLegalPath } from '@owlmeans/astro'

const isLegalPage = isLegalPath(Astro.url.pathname)
const tags = owlHeadScripts(isLegalPage ? {} : { gtm: { id: SITE.gtmId } })
---
<html lang={locale}>
  <head>
    <script is:inline set:html={tags.head} />
  </head>
  <body>
    {tags.noscript && <noscript set:html={tags.noscript} />}
    <slot />
  </body>
</html>
```

Two rules the shape enforces:

- **Stamp `head` above everything else in `<head>`.** It is generated rather than hand-written
  precisely because the ORDER is the whole point; moving it below another script re-opens the
  window this package exists to close.
- **Pass no `gtm` and it is still the consent defaults.** A site with no tag manager at all still
  wants them on the queue: a stored decision has to reach whatever the page loads later, and a page
  that declared nothing is a page where a later tag sees no state. `noscript` comes back empty in
  that case, so the `<noscript>` element renders only when there is a container to frame.

`consent` options are merged into the container snippet, so a site with its own category set or
storage key passes them here as well as to the dialog — otherwise the inline snippet and the
component disagree about what is being asked.

## Legal pages carry no tracking

A legal page is where a visitor goes to READ what is being collected; collecting there while they
read is the one thing it must not do.

```typescript
isLegalPath('/legal')            // true
isLegalPath('/pl/legal/terms')   // true — with or without a locale prefix
isLegalPath('/legalese')         // false — a page that merely starts with the word is not one
isLegalPath('/about/legal')      // false — the segment must be at the top level
isLegalPath('/policies/privacy', 'policies')   // true — the segment is configurable
```

Feed the result back into `owlHeadScripts`: drop the `gtm` option on a legal page and the page
still declares its consent defaults while loading no container.

## Locale

**`Astro.currentLocale` is `undefined` on a default-locale page, not the default locale.** Feeding
it straight to a component renders English for everyone landing on `/` — including the sites where
`/` is not English.

```typescript
const locale = owlLocale(Astro.currentLocale, 'pl')
```

An empty string is treated the same as `undefined`; a real locale passes through untouched.

## Depends On

- `@owlmeans/consent` — `consentBootstrapScript`, the category model and the storage contract
- `@owlmeans/web-gtm` — `gtmHeadScript`, `gtmNoscriptFrame`

Both are ordinary dependencies, so an Astro site installs this one package and gets the whole head
story. Rendering the dialog itself is separate — that is `@owlmeans/web-consent`, mounted as an
island, or the site's own component over the same store.

## Related

- `consent` — the categories, the storage record and its migration, and why the ordering rule exists
- `web-gtm` — what the container snippet actually emits and how an id is made inert
- `web-consent` — the dialog, the re-open button and the cookie-policy page
