---
name: web-gtm
description: How to use @owlmeans/web-gtm — the Google tag head snippet for every Google id (Tag Manager GTM-, GA4 G-, Google tag GT-, Ads AW-, Floodlight DC-) that declares Consent Mode defaults before any loader runs, the id validator, the CSP host lists, the cookie-policy disclosure for a tag, the noscript frame, and the script-side loader for a host that cannot edit its own HTML. Auto-invoked when adding a Google tag or tag manager to a page, importing googleTagHeadScript, isGoogleTagId, GOOGLE_TAG_CSP_SOURCES, googleTagServices, gtmHeadScript, gtmNoscriptFrame or loadGtm, or debugging why a tag ignores a stored consent decision or is blocked by CSP.
user-invocable: false
---

# @owlmeans/web-gtm

**Layer:** Web
**Install:** `"@owlmeans/web-gtm": "^0.1.18-rc.25"` in `dependencies`

The tag half of the consent set. It emits **strings and data**, not components, and it holds no
state — the decision lives in `@owlmeans/consent`, which this package reads through
`consentBootstrapScript` and `consentStore`.

## The one idea: order

A Google tag — the Tag Manager container or gtag.js alike — decides what it may do from the
consent state present **when it loads**. A React bundle cannot get there first: by the time an
island mounts, the tag has been running for hundreds of milliseconds and has already decided. A
site whose defaults arrive after the loader is not configured differently — it is *unconfigured
for the window that matters*, and nothing in the page reports it.

So every head snippet here emits the consent bootstrap first and the loader after it, as ONE
inline script. Everything else in this package exists to serve that.

## Key Exports

| Export | Description |
|--------|-------------|
| `googleTagHeadScript(opts)` | The inline `<head>` script for any Google id: consent bootstrap, ads redaction, then the loader the prefix calls for. **The default for new code** |
| `isGoogleTagId(id)` / `googleTagKind(id)` | Whether an id is loadable, and whether it takes `gtm` (container) or `gtag` (gtag.js); `null` for anything else |
| `GoogleTagOptions` / `GoogleTagKind` | `ConsentOptions` plus `id` and optional `dataLayerName`; `'gtm' \| 'gtag'` |
| `GOOGLE_TAG_CSP_SOURCES` | The hosts GA4, Tag Manager and Google Ads need in `script-src`, `connect-src` and `img-src` (7, frozen) |
| `GOOGLE_TAG_FRAME_SOURCES` | The hosts they frame, for `frame-src`: `https://www.googletagmanager.com`, `https://td.doubleclick.net` |
| `googleTagServices(id)` | The `ConsentService[]` a cookie policy discloses for that tag — pass to `CookiePolicy`'s `services` |
| `gtmHeadScript(opts)` | The container-only snippet: consent defaults, stored decision, then `gtm.js` |
| `gtmNoscriptFrame(opts)` | The hidden `<noscript>` iframe, for the top of `<body>` |
| `loadGtm(opts)` | Script-side container load, for a host that cannot emit into its own head |
| `GtmOptions` | `ConsentOptions` plus `id` (e.g. `GTM-XXXXXXX`) and optional `dataLayerName` |

## Ids

`isGoogleTagId` accepts exactly `GTM-` + 4–12, or `G-` / `GT-` / `AW-` / `DC-` + 4–16, upper-case
letters and digits. It is strict on purpose: the id is typed into a settings form and ends up in
an inline script and a script URL, and a value it accepts cannot carry a quote, a tag or a second
query parameter — so **validate with it where the id is stored**, not only where it is emitted.
Lower case is rejected rather than folded; normalise in the form if you want to be forgiving.
`UA-` (Universal Analytics, retired) is rejected: it would promise measurement that never comes.

| Prefix | Kind | Loader |
|---|---|---|
| `GTM-` | `gtm` | `gtm.js` — Google's container IIFE |
| `G-` GA4, `GT-` Google tag, `AW-` Google Ads, `DC-` Floodlight | `gtag` | `gtag/js`, then `js` and `config` |

## `googleTagHeadScript` — what it emits

1. `consentBootstrapScript(opts)` — `consent/default` (everything denied except
   `security_storage`) and, for a returning visitor, `consent/update` from the stored record.
2. `set ads_data_redaction true` and `set url_passthrough false` — both have to precede the tag's
   `config`. Redaction strips ad-click ids and goes cookieless while `ad_storage` is denied.
3. The loader. For `gtag`: a queue function (published as `window.gtag` only when nothing else
   owns it, so app code can send events), `js`, `config`, and the gtag.js `<script async>`
   element created from the inline script — one inline script rather than Google's two elements,
   so a build stamps one thing. The element carries id `owl-gtag-<id>`, so running the snippet
   twice configures the tag once instead of double-counting page views.

An **invalid id yields the consent bootstrap alone** — a mistyped tag must never cost a page its
consent defaults. So a host may stamp `googleTagHeadScript({ id: configured })` unconditionally,
or stamp `consentBootstrapScript()` when no tag is configured; both are correct.

**The output is safe to place inline in HTML as-is.** JSON encoding keeps configured values inside
their string literals, but the HTML parser ends a script element at the first `</script` wherever
it sits, so every `</` and `<!--` in the output is backslash-escaped (`<\/`, `<\!--` — JavaScript
reads them unchanged). `gtmHeadScript` predates this and does not escape; prefer
`googleTagHeadScript` wherever category keys or a storage key come from configuration.

## Stamping it

```typescript
import { googleTagHeadScript } from '@owlmeans/web-gtm'

const head = googleTagHeadScript({ id: 'G-XXXXXXXXXX' })   // inline <script> content, first in <head>
```

The snippet is stamped **from HTML**, never from the application bundle:

- a Vite app — a `transformIndexHtml` plugin substituting a marker, so the snippet cannot drift
  from the package;
- an Astro site — `owlHeadScripts()` from `@owlmeans/astro`, `set:html` in the base layout;
- a **generated Viable app** — its Rollup build writes `index.html` and puts
  `googleTagHeadScript({ id })` in the `<head>` when the project owner has set a Google tag
  (`BRANDING_GOOGLE_TAG`), and `consentBootstrapScript()` otherwise. The tag is attached in
  **preview and production** alike; the consent default is first in both.

The snippet **reads the stored decision**, so the same `ConsentOptions` (categories, `storageKey`)
must be passed here and to the dialog: two category sets in one page mean the snippet and the
component disagree about what was asked.

## Content Security Policy

A page served with a CSP must allow the tag's hosts, or the loader is blocked and nothing on the
page says so.

- `GOOGLE_TAG_CSP_SOURCES` goes into `script-src`, `connect-src` and `img-src` — one list for all
  three, folded from Google's CSP guide (developers.google.com/tag-platform/security/guides/csp):
  `*.googletagmanager.com`, `*.google-analytics.com`, `*.g.doubleclick.net`, `ad.doubleclick.net`,
  `www.googleadservices.com`, `pagead2.googlesyndication.com`, `*.google.com`. Each is
  `https://` + optional `*.` + a dotted host, the only shape the Viable publisher's source filter
  admits, and few enough to fit its per-slot cap. Google's country domains (`google.<TLD>`) cannot
  be expressed in that shape; what is lost is a remarketing ping, never the tag.
- `GOOGLE_TAG_FRAME_SOURCES` goes into `frame-src`.
- The inline head script itself is covered by the document's own script hash — the Viable
  publisher derives `'sha256-…'` from the document it sends — so nothing else is needed for it.
- **Tag Manager Custom HTML tags do not run under a hash-based CSP**: they inject inline scripts
  no hash names, and `'unsafe-inline'` is not an option. Custom JavaScript variables need
  `'unsafe-eval'` and fail the same way. Build a container for such a page from Google's
  **built-in tag templates** (GA4, Google Ads, Floodlight, Conversion Linker) and Community
  Gallery templates, which load from the allowed hosts.

## Disclosing it

`googleTagServices(id)` returns what the cookie policy lists under each category, read off the
prefix — the page knows nothing more:

| Id | Entries |
|---|---|
| `G-` | Google Analytics — `analytics`; `_ga`, `_ga_<id without G->` |
| `AW-` | Google Ads — `marketing`; `_gcl_au`, `_gcl_aw` |
| `DC-` | Floodlight — `marketing`; `_gcl_au`, `_gcl_dc` |
| `GTM-`, `GT-` | one `analytics` AND one `marketing` entry, worded as "configured in the container" / "for it at Google" — the policy may not claim less than the tag can do |
| invalid | `[]` — it loads nothing, so it discloses nothing |

Pass them to `CookiePolicy` (`services`) wherever the tag is stamped; a generated Viable app's
cookie page does so when a Google tag is set. The strings are English data, not translation keys.

## Gotchas

- **Consent Mode speaks on `window.dataLayer`.** The bootstrap and the dialog's later
  `consent/update` both push there, so a tag given another `dataLayerName` never hears a consent
  command. Leave `dataLayerName` unset on any consent-gated page; it exists for a page running a
  second, separately-consented container. `googleTagHeadScript` falls back to `dataLayer` when the
  name is not a plain identifier.
- **Ids and queue names are injected as data, never interpolated raw.** `gtmHeadScript` and
  `googleTagHeadScript` JSON-encode them; `gtmNoscriptFrame` URL-encodes the id so it cannot break
  out of the attribute. Never build either string by hand.
- **`loadGtm` is the fallback, not the default.** It is for a single-page app whose HTML is not
  yours to edit. It still pushes the defaults first (through `consentStore.init`) and refuses to
  load a second time — it marks its own `<script>` element with an id derived from the container —
  but it runs after the bundle, which is exactly the window the head snippet closes.
- **A second `consent/default` after a tag has loaded can WIDEN what was already narrowed**, so the
  bootstrap is idempotent through a window flag. A page may therefore carry the call twice — once
  inline, once from the bundle that mounts the dialog — without harm. Do not defeat the flag.
- `loadGtm` returns immediately when there is no `document`, so it is safe to call from code that
  also runs during server rendering.

## Depends On

- `@owlmeans/consent` — `consentBootstrapScript`, `consentStore`, `ConsentOptions`,
  `ConsentService`, the category keys and the Consent Mode signal mapping

## Related

- `consent` — categories, the storage record and its migration, Consent Mode v2 signalling, and the
  ordering rule this package implements
- `web-consent` — the dialog and the cookie-policy page (`services`) that produce and disclose the
  decision
- `astro` — `owlHeadScripts()`, which composes the head strings for an Astro layout
