---
name: web-gtm
description: How to use @owlmeans/web-gtm — the Google Tag Manager head snippet that declares Consent Mode defaults before the container loads, the noscript frame, and the script-side loader for a host that cannot edit its own HTML. Auto-invoked when adding a tag manager to a page, importing gtmHeadScript, gtmNoscriptFrame or loadGtm, or debugging why a tag ignores a stored consent decision.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-gtm

**Layer:** Web
**Install:** `"@owlmeans/web-gtm": "^0.1.18-rc.5"` in `dependencies`

The tag-manager half of the consent set. It emits **strings**, not components, and it holds no
state — the decision lives in `@owlmeans/consent`, which this package reads through
`consentBootstrapScript` and `consentStore`.

## The one idea: order

Google Tag Manager decides what a tag may do from the consent state present **when the container
loads**. A React bundle cannot get there first: by the time an island mounts, `gtm.js` has been
running for hundreds of milliseconds and has already decided. A site whose defaults arrive after
the container is not configured differently — it is *unconfigured for the window that matters*, and
nothing in the page reports it.

So `gtmHeadScript` emits the consent bootstrap and then the container, in that order, as one
inline script. Everything else in this package exists to serve that.

## Key Exports

| Export | Description |
|--------|-------------|
| `gtmHeadScript(opts)` | The inline `<head>` snippet: consent defaults, stored decision, then the container |
| `gtmNoscriptFrame(opts)` | The hidden `<noscript>` iframe, for the top of `<body>` |
| `loadGtm(opts)` | Script-side container load, for a host that cannot emit into its own head |
| `GtmOptions` | `ConsentOptions` plus `id` (e.g. `GTM-XXXXXXX`) and optional `dataLayerName` |

## Stamping it

```typescript
import { gtmHeadScript, gtmNoscriptFrame } from '@owlmeans/web-gtm'

const opts = { id: 'GTM-XXXXXXX' }
const head = gtmHeadScript(opts)      // inline <script> content for <head>, first
const frame = gtmNoscriptFrame(opts)  // <noscript> content for the top of <body>
```

The snippet is stamped **from HTML**, never from the application bundle. How each surface does it:

- a Vite app — a `transformIndexHtml` plugin substituting the two markers, so the snippet cannot
  drift from the package;
- an Astro site — `owlHeadScripts()` from `@owlmeans/astro`, `set:html` in the base layout.

A surface that runs no container of its own stamps only `consentBootstrapScript()` from
`@owlmeans/consent` — that is the case for the bundler-generated `index.html` of a generated
application, which carries the consent bootstrap and no tag manager. The bootstrap and this
snippet are separate stampings: adding a container means adding `gtmHeadScript` /
`gtmNoscriptFrame` beside it.

`gtmHeadScript` also **reads the stored decision** and pushes `consent/update` before the
container, so a returning visitor's tags are not denied for the first paint of every page. That
read is why the same `ConsentOptions` (categories, `storageKey`) must be passed here and to the
dialog: two different category sets in one page mean the snippet and the component disagree about
what was asked.

## Gotchas

- **The container id and queue name are injected as data, never interpolated raw.** Both come from
  configuration, and configuration reaches these functions as a string. `gtmHeadScript` JSON-encodes
  them, so a quote inside an id is escaped rather than closing the literal and turning the rest into
  executable script; `gtmNoscriptFrame` URL-encodes the id so it cannot break out of the attribute.
  Never build either string by hand.
- **`dataLayerName` is for a page running more than one container.** It is passed through to the
  container the way Google's own snippet does (`&l=` when it is not `dataLayer`); leave it unset
  otherwise, or tags looking at the default queue see nothing.
- **`loadGtm` is the fallback, not the default.** It is for a single-page app whose HTML is not
  yours to edit. It still pushes the defaults first (through `consentStore.init`) and refuses to
  load a second time — it marks its own `<script>` element with an id derived from the container —
  but it runs after the bundle, which is exactly the window the head snippet closes. Prefer the
  head snippet wherever the document can be edited.
- **A second `consent/default` after a tag has loaded can WIDEN what was already narrowed**, so the
  bootstrap is idempotent through a window flag. A page may therefore carry the call twice — once
  inline, once from the bundle that mounts the dialog — without harm. Do not defeat the flag.
- `loadGtm` returns immediately when there is no `document`, so it is safe to call from code that
  also runs during server rendering.

## Depends On

- `@owlmeans/consent` — `consentBootstrapScript`, `consentStore`, `ConsentOptions`, the category
  model and the Consent Mode signal mapping

## Related

- `consent` — categories, the storage record and its migration, Consent Mode v2 signalling, and the
  ordering rule this package implements
- `web-consent` — the dialog and the cookie-policy page that produce the decision
- `astro` — `owlHeadScripts()`, which composes both strings for an Astro layout
