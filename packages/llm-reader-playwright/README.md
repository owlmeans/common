# @owlmeans/llm-reader-playwright

A Playwright renderer for `@owlmeans/llm-reader`: pages run their scripts before they are read, and
the design analysis gets computed styles, custom properties, block geometry and a screenshot. Every
request a rendered page makes passes the reader's address guard, goes through the reader's proxy
lease, and — given the reader's pinned `fetch` — is fetched through it rather than re-resolved by the
browser. Local bundles (an uploaded prototype, a collected page) render from disk.

## Installation

```bash
bun add @owlmeans/llm-reader-playwright@^0.2.4-rc.1 playwright
bunx playwright install chromium
```

`playwright` is a peer: the renderer uses the browsers installed beside it.

## Usage

```typescript
import { createLlmReader, createLocalBundlePlugin, createProxyPlugin } from '@owlmeans/llm-reader'
import { createPlaywrightRenderer, makePlaywrightFetchPlugin } from '@owlmeans/llm-reader-playwright'
import { createPinnedFetch } from '@owlmeans/file-streams/fetch'

const renderer = createPlaywrightRenderer()
const reader = createLlmReader({ renderer, plugins: [createProxyPlugin({ proxies })], models })

await reader.design('https://app.example.com')    // rendered, then measured
await reader.page('https://spa.example.com')       // an app shell is re-read rendered

// Or render every page fetch:
createLlmReader({ plugins: [createProxyPlugin({ proxies }), makePlaywrightFetchPlugin(renderer)] })

// A local prototype (an uploaded home.html with its css and pictures), rendered from disk:
const bundle = createLocalBundlePlugin({ root: '/uploads/prototype' })
await createLlmReader({ renderer, plugins: [bundle], models }).design(bundle.urlOf('home.html'))

// A bundle `collect` wrote renders offline: its bundle.json answers the original external URLs from disk.
// With a pinned fetch, live sub-requests are fetched through it instead of Chromium re-resolving the host:
createLlmReader({ renderer, fetch: createPinnedFetch(), models })

await reader.close()                               // closes the browser the renderer launched
```

The browser goes through the reader's proxy lease (SOCKS proxies through the reader's bridge), and
every request a page makes passes the reader's address guard; refused ones are listed in
`RenderedPage.blocked`. Given the reader's injected `fetch`, every guarded GET/HEAD is fulfilled
through it (`route.fulfill`), other methods are refused. `collect` asks for a `snapshot`: rules a
script put only into the CSSOM are written into `<style>` elements before the DOM is serialized.

## Configuration

| Option | Default | Purpose |
|---|---|---|
| `browser` | Chromium, launched headless on first use | A `Browser`, or a function returning one; a browser passed in is never closed by the renderer. |
| `launch` | — | Playwright `LaunchOptions` for the browser the renderer launches. |
| `viewport` | `DEFAULT_VIEWPORT` (1280×800) | The viewport pages render and are screenshot in. |
| `timeout` | `DEFAULT_RENDER_TIMEOUT_MS` (30 s) | Navigation deadline; a render request's own `timeout` wins. |
| `waitUntil` · `settle` | `load` · `DEFAULT_SETTLE_MS` (3 s) | When navigation counts as done, then how long the page may keep loading before it is read. |
| `userAgent` | Playwright's | The browser's user agent. |
| `bundles` | `[]` | Local bundles (`createLocalBundlePlugin`) whose origins and manifest URLs are answered from disk. |
| `fetch` | — | A pinned `fetch` guarded sub-requests are fulfilled through; a render request's own `fetch` wins. |
| `maxFulfilBytes` | `DEFAULT_MAX_FULFIL_BYTES` (16 MiB) | The largest sub-request answer fulfilled through `fetch`; a larger one is aborted. |

## Security and limits

- One browser context per page, closed after it: downloads off, service workers blocked.
- Every sub-request is checked by the reader's address guard; a refused one is aborted
  (`blockedbyclient`) and listed in `RenderedPage.blocked`.
- With a pinned `fetch`, only GET and HEAD are carried; any other method is refused. Redirects go
  back to the browser, so each hop is guarded again.
- Bundle files are served from disk under their synthetic origin — never resolved, never proxied.
- Through a proxy lease the injected `fetch` is not used: the proxy carries the requests.

## API

| Export | Purpose |
|---|---|
| `createPlaywrightRenderer(options?)` | A `PlaywrightRenderer` (`PageRenderer`): `render({ url, lease?, guard?, styles?, screenshot?, signal?, timeout?, bundle?, fetch?, snapshot? })` → `RenderedPage`; `close()` shuts down a browser it launched. |
| `makePlaywrightFetchPlugin(renderer, { when? })` | A reader fetch plugin that renders page requests (every `purpose: 'page'` request, or those `when` picks); put it after the proxy plugin. |
| `DEFAULT_VIEWPORT`, `DEFAULT_RENDER_TIMEOUT_MS`, `DEFAULT_SETTLE_MS`, `DEFAULT_MAX_FULFIL_BYTES`, `SCREENSHOT_QUALITY`, `PROBE_ELEMENTS` | Defaults: 1280×800, 30 s, 3 s, 16 MiB, JPEG quality 70, at most 4000 elements sampled. |
| `PlaywrightRendererOptions`, `PlaywrightRenderer`, `PlaywrightFetchPluginOptions`, `ProbeResult` | Types. |

The package has one entry point; there are no subpath exports.

## Common pitfalls

- The fetch plugin hands the renderer no per-request `bundle` or `fetch`: configure `bundles` and
  `fetch` on the renderer when the plugin renders such pages.
- Chromium sends loopback targets direct, around a proxy, unless launched with
  `--proxy-bypass-list=<-loopback>`.
- Chromium's own local-network rules may stop an `https` bundle page from reaching a loopback host
  the guard allowed.

## Tests

```bash
bun test ./tests
```

Gated on an installed Chromium; the design spec also on `ANTHROPIC_SECRET` or `OPENAI_SECRET`.
`collect.spec.ts` renders a collected bundle with its servers stopped, snapshots an app shell, and
fulfils through file-streams' pinned fetch (reached by a test-only relative import).

## Related packages

- [`@owlmeans/llm-reader`](../llm-reader) — the reader, its `PageRenderer` seam, proxies, guard and `collect`
- [`@owlmeans/file-streams`](../file-streams) — `@owlmeans/file-streams/fetch`: the pinned `fetch` a reader hands the renderer
- [`@owlmeans/web-research`](../web-research) — its design pipeline renders a bundle offline with a borrowed renderer

The `llm-reader-playwright` skill covers the same package for agents.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.4-rc.1
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
