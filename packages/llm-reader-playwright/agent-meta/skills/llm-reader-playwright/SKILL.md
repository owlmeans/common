---
name: llm-reader-playwright
description: How to use @owlmeans/llm-reader-playwright — a Playwright PageRenderer for @owlmeans/llm-reader that runs a page's scripts, samples computed styles by role, reads custom properties and block geometry, takes a screenshot, routes the browser through the reader's proxy lease (SOCKS through the bridge) and guards every request it makes, serves local bundles (uploaded html/css prototypes) under their synthetic origin; and a fetch plugin that renders inside the reader's chain. Auto-invoked when importing createPlaywrightRenderer or makePlaywrightFetchPlugin.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/llm-reader-playwright

**Layer:** Server (drives a browser)
**Install:** `"@owlmeans/llm-reader-playwright": "^0.1.22-rc.0"` in `dependencies`, plus the
`playwright` **peer** — the consumer's installed browsers are used (`bunx playwright install chromium`)

```ts
import { createLlmReader, createLocalBundlePlugin, createProxyPlugin } from '@owlmeans/llm-reader'
import { createPlaywrightRenderer } from '@owlmeans/llm-reader-playwright'

const renderer = createPlaywrightRenderer()
const reader = createLlmReader({ renderer, plugins: [createProxyPlugin({ proxies })], models })
await reader.design('https://app.example.com')   // rendered: computed styles + screenshot feed the DESIGN.md
await reader.page('https://spa.example.com')       // an app shell is re-read rendered automatically

const bundle = createLocalBundlePlugin({ root: '/uploads/prototype' })
const local = createLlmReader({ renderer, plugins: [bundle], models })
await local.design(bundle.urlOf('home.html'))      // the prototype rendered from disk: styles + screenshot
```

## Key exports

| Export | Description |
|---|---|
| `createPlaywrightRenderer({ browser?, launch?, viewport, timeout, waitUntil, settle, userAgent, bundles? })` | A `PageRenderer`: `render({ url, lease?, guard?, styles?, screenshot?, signal?, timeout?, bundle? })` → `RenderedPage` (HTML after scripts, final URL, status, `styles`, `variables`, `blocks`, JPEG `screenshot`, `blocked`); `close()` shuts down a browser it launched. |
| `makePlaywrightFetchPlugin(renderer, { when? })` | A reader fetch plugin that renders page requests (all, or those `when` picks). Place it after the proxy plugin so it renders through the chosen lease. |
| `PlaywrightRendererOptions`, `ProbeResult`, `DEFAULT_VIEWPORT`, `DEFAULT_RENDER_TIMEOUT_MS`, `DEFAULT_SETTLE_MS` | Options and defaults (1280×800, 30 s navigation, 3 s to go network-idle). |

## Rules

- **One browser context per page**, closed after: viewport set, downloads off, service workers blocked.
- **Proxy**: the context's proxy is the lease's `endpoint()` — the upstream HTTP(S) proxy, or the
  reader's SOCKS bridge, which answers a 407 challenge so Chromium sends the route credentials
  (Chromium has no SOCKS authentication of its own). Chromium sends loopback targets direct unless
  launched with `--proxy-bypass-list=<-loopback>`.
- **Guard**: every request of the page goes through the reader's address guard (a direct render
  resolves names, a proxied one checks literal addresses); refused ones are aborted and listed in
  `RenderedPage.blocked`.
- **Local bundles**: a request under the origin of a bundle in `bundles` (or the render request's
  `bundle`, which the reader sets for a bundle URL) is fulfilled from the bundle (`page.route`) —
  never resolved, never proxied; a missing file is a 404, a refused path is aborted and listed in
  `blocked`. Everything else the page loads still goes through the guard, so a prototype that pulls
  a picture from a private address is refused as any page would be. Chromium's own local-network
  rules may still stop an `https` bundle page from reaching a loopback host the guard allowed.
- **Probe**: computed styles of visible elements, by role (body, heading-1…6, link, button, input,
  card, nav, header, footer, text), each property's dominant value weighted by on-screen area;
  `:root` custom properties from readable stylesheets; blocks at least 80 px tall.

## Depends On

- `@owlmeans/llm-reader` (the seam, the guard, leases) · `@owlmeans/error` · `@owlmeans/log` · peer `playwright`

## External docs

- https://playwright.dev/docs/api/class-browser#browser-new-context-option-proxy — per-context `proxy: { server, username, password, bypass }`; HTTP proxy authentication only (2026-11)
- https://playwright.dev/docs/api/class-browsercontext#browser-context-route — one `route('**/*')` handler per context answers every request: `route.fulfill({ status, contentType, body })` for a bundle file (no DNS, no proxy), `continue()` / `abort('blockedbyclient')` after the guard. Observed with Playwright 1.64's Chromium: an `https` page's `http://<IP>` sub-requests are not upgraded and do reach the route; a loopback one the guard allows can still be stopped by Chromium's local-network rules (2026-11)

## Related

- [[llm-reader]] — the reader, its proxies and its design analysis
