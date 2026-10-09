# @owlmeans/web-inquiry

The lightweight browser SDK of the OwlMeans customer inquiry widget. It carries no widget code and
no React: it injects the widget runtime served by the CRM (`<crm>/inquiry.js`) once per page, waits
for the runtime of the version it was built for, and opens the dialog from a link, a button, a
menu entry or a floating button. Every dialog open is reported once as an analytics event.

## Installation

```bash
bun add @owlmeans/web-inquiry@^0.1.18-rc.0 @owlmeans/common-inquiry@^0.1.18-rc.0
```

## Usage

```ts
import { makeInquiryClient, type InquiryWidgetConfig } from '@owlmeans/web-inquiry'

const inquiry = makeInquiryClient({
  url: 'https://platform.owlmeans.com/crm',        // the CRM base, no trailing slash needed
  language: () => document.documentElement.lang,   // read at every open
})

const quote: InquiryWidgetConfig = {
  id: 'owlmeans-quote',
  tabs: [{ alias: 'quote', title: 'Get a quote' }],   // one tab: no tab strip
  legal: { terms: '/legal/terms', privacy: '/legal/privacy' },
}

// A trigger keeps its href: when the widget cannot load, the click follows it.
const unbind = inquiry.bind('[data-inquiry="quote"]', quote, { source: 'pricing-card' })

await inquiry.open(quote, { source: 'menu' })        // from code
const fab = await inquiry.button(quote)              // a floating button, bottom-right
fab.unmount()
```

Nothing is fetched until the first `load`, `open`, `button` or bound click — a page that must not
contact a third party before an interaction stays clean.

## Analytics

Each open is logged once through `@owlmeans/log` as an analytics-only call:

```ts
logger('inquiry').info('Inquiry dialog opened',
  { inquiry_widget, inquiry_tab, inquiry_source },
  { analytics: 'inquiry_dialog_open', console: false })
```

The event reaches a tag manager when the host registers the consent-gated plugin of
`@owlmeans/web-log` — without analytics consent it is dropped:

```ts
import { addLogPlugin } from '@owlmeans/log'
import { gtmAnalyticsPlugin } from '@owlmeans/web-log'
import { INQUIRY_OPEN_EVENT } from '@owlmeans/web-inquiry'

addLogPlugin(gtmAnalyticsPlugin({ allow: [INQUIRY_OPEN_EVENT] }))
// → window.dataLayer.push({ event: 'inquiry_dialog_open', inquiry_widget, inquiry_tab, inquiry_source })
```

In the tag manager, a Custom Event trigger on `inquiry_dialog_open` forwards it to GA4.
`analytics: 'name'` renames the event; `analytics: false` reports nothing (`onOpen` still runs).

## Related

- [`@owlmeans/common-inquiry`](../common-inquiry): the runtime contract, config, limits and schemas
- [`@owlmeans/web-log`](../web-log): the consent-gated analytics plugins

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
