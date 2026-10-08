---
name: web-inquiry
description: How to use @owlmeans/web-inquiry — the lightweight browser SDK of the OwlMeans customer inquiry widget. makeInquiryClient injects the widget runtime (<crm>/inquiry.js) once per page, checks its version, and opens the contact dialog from code (open), from triggers that keep their href as a fallback (bind) or from a floating button (button); every open is reported once as the analytics event inquiry_dialog_open through @owlmeans/log, which web-log's gtmAnalyticsPlugin forwards to a tag manager under consent. Auto-invoked when adding a contact/feedback dialog, a "Contact us" or "Get a quote" trigger to a page, importing makeInquiryClient or InquiryLoadError, or wiring the inquiry open event into GTM.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-inquiry

**Layer:** Web (depends on `@owlmeans/common-inquiry` and `@owlmeans/log`; no React, no widget code)
**Install:** `"@owlmeans/web-inquiry": "^0.1.18-rc.0"` in `dependencies`

The host half of the inquiry widget. The dialog itself — React, styles, reCAPTCHA, the upload — is
a bundle the CRM serves; this package only loads it, opens it and reports the opens. A page pays
for the widget on the first interaction, never at load.

## Use it

```ts
import { makeInquiryClient } from '@owlmeans/web-inquiry'

const inquiry = makeInquiryClient({
  url: `${platformWeb}/crm`,           // the CRM base; a trailing slash is dropped
  language: () => i18n.language,      // a string, or a function read at every open
})

inquiry.bind('[data-inquiry="quote"]', quoteConfig, { source: 'pricing-card' })   // returns unbind
await inquiry.open(viableConfig, { tab: 'payment', source: 'menu' })
const fab = await inquiry.button(viableConfig, { position: 'bottom-right' })     // InquiryHandle
```

One client per page and CRM is the usual shape. More are safe: the script is injected once per
URL, and each open is routed to the client that claimed its widget id (the latest claimant takes
the opens of an unclaimed widget). The last client to act sets the runtime's language.

| Option | Meaning |
|---|---|
| `url` | the CRM base, e.g. `https://platform.owlmeans.com/crm` |
| `language` | the widget's language — string or function; default: the runtime's own choice |
| `analytics` | the open event's name; default `INQUIRY_OPEN_EVENT`; `false` reports nothing |
| `onOpen(event)` | called once per open, after the analytics event |
| `timeoutMs` | how long `load` waits; default `INQUIRY_LOAD_TIMEOUT` (10 000) |

## Loading

`load()` (and every `open`, `button` or bound click before it) injects
`<script src="<url>/inquiry.js?v=<INQUIRY_RUNTIME_VERSION>" async data-owlmeans-inquiry>` — unless
the page already holds that script, which a second copy of the package would have injected — and
waits for `window.__owlmeansInquiry`. It resolves when the runtime's `version` equals
`INQUIRY_RUNTIME_VERSION` and then calls `runtime.configure({ url, language, onOpen })`.

It rejects with an `InquiryLoadError` whose `failure` says why: `network` (the script failed, or
loaded without installing the runtime), `timeout`, `version` (another runtime version) or
`environment` (no document). A failed load removes the script it injected, so the next call
retries.

## Triggers keep their links

`bind(target, config, opts?)` takes an element or a selector (every element it matches now). A
click is taken over and opens the dialog; if the widget cannot load, an anchor follows its own
`href` (never `#…` or `javascript:`). A modified click on an anchor — ctrl/cmd/shift/alt or a
non-primary button — is left to the browser, so "open in a new tab" still reaches the page behind
the link. Keep a real `href` on every trigger: it is the fallback and what a crawler sees.

## Analytics

Each open, whatever opened it, is reported once:

```ts
logger('inquiry').info('Inquiry dialog opened',
  { inquiry_widget, inquiry_tab, inquiry_source },
  { analytics: 'inquiry_dialog_open', console: false })
```

The SDK reports from the runtime's `onOpen` only — `open()` itself emits nothing — so an open from
code, a bound trigger or the floating button is counted exactly once. `inquiry_source` is the
trigger's `source` (the floating button's defaults to `fab`) and is sent even when undefined, so a
tag manager's data layer does not keep the previous open's value.

To send it to GTM, the host registers the consent-gated plugin once at startup:

```ts
import { addLogPlugin } from '@owlmeans/log'
import { gtmAnalyticsPlugin } from '@owlmeans/web-log'
import { INQUIRY_OPEN_EVENT } from '@owlmeans/web-inquiry'

addLogPlugin(gtmAnalyticsPlugin({ allow: [INQUIRY_OPEN_EVENT] }))
```

Without analytics consent the event is dropped, never queued (`web-log`). In the container, a
Custom Event trigger on `inquiry_dialog_open` forwards it to a GA4 event tag.

## Re-exports

For a host that depends on this package alone: `INQUIRY_OPEN_EVENT` and the types
`InquiryWidgetConfig`, `InquiryTab`, `LocalizedText`, `InquiryOpenOptions`, `InquiryButtonOptions`,
`InquiryOpenEvent`, `InquiryHandle`, `InquiryRuntime` from `@owlmeans/common-inquiry`.

## Testing

The SDK runs against a minimal fake `window`/`document` (attributes, listeners, `head.appendChild`,
`querySelectorAll`, timers, `location.assign`) and a fake runtime that calls `onOpen` once per open;
the loader is page-wide state, so each spec uses a CRM URL of its own.

## Related

- `common-inquiry` — the config, the runtime contract, limits and schemas
- `web-log`, `log` — the analytics routing the open event takes
