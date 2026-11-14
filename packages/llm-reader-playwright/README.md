# @owlmeans/llm-reader-playwright

A Playwright renderer for `@owlmeans/llm-reader`: pages run their scripts before they are read, and
the design analysis gets computed styles, custom properties, block geometry and a screenshot.

## Installation

```bash
bun add @owlmeans/llm-reader-playwright@^0.2.0-alpha.0 playwright
bunx playwright install chromium
```

## Usage

```typescript
import { createLlmReader, createLocalBundlePlugin, createProxyPlugin } from '@owlmeans/llm-reader'
import { createPlaywrightRenderer, makePlaywrightFetchPlugin } from '@owlmeans/llm-reader-playwright'

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
import { createPinnedFetch } from '@owlmeans/file-streams/fetch'
createLlmReader({ renderer, fetch: createPinnedFetch(), models })
```

The browser goes through the reader's proxy lease (SOCKS proxies through the reader's bridge), and
every request a page makes passes the reader's address guard; refused ones are listed in
`RenderedPage.blocked`. Given the reader's injected `fetch`, every guarded GET/HEAD is fulfilled
through it (`route.fulfill`), other methods are refused. `collect` asks for a `snapshot`: rules a
script put only into the CSSOM are written into `<style>` elements before the DOM is serialized.

## API

| Export | Purpose |
|---|---|
| `createPlaywrightRenderer(options)` | `render({ url, lease?, guard?, styles?, screenshot?, bundle?, fetch?, snapshot? })` → `RenderedPage`; `close()`. Options: `browser`, `launch`, `viewport`, `timeout`, `waitUntil`, `settle`, `userAgent`, `bundles` (local bundles routed from disk under their synthetic origins and manifest URLs; every other request still guarded), `fetch` (fulfil guarded sub-requests through it), `maxFulfilBytes`. |
| `makePlaywrightFetchPlugin(renderer, { when? })` | A reader fetch plugin that renders page requests. |

## Tests

```bash
bun test ./tests
```

Gated on an installed Chromium; the design spec also on `ANTHROPIC_SECRET` or `OPENAI_SECRET`.
`collect.spec.ts` renders a collected bundle with its servers stopped, snapshots an app shell, and
fulfils through file-streams' pinned fetch (reached by a test-only relative import).

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
