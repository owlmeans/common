---
name: llm-reader
description: How to use @owlmeans/llm-reader — fetch web pages directly, through HTTP/SOCKS proxies, or through an injected pinned fetch (file-streams); parse them (metadata with evidence, Markdown content, links, pictures in context, a ref-addressed DOM); have a model describe, classify, extract, pick links, caption images and write a DESIGN.md — of a live site or a local html/css bundle; clone a link into local files (a page bundle with its CSS, fonts and pictures and bundle.json, a streamed file, a public S3 prefix, a ReaderSource plugin's folder) and crawl a site in a bounded, robots-honouring way. Auto-invoked when importing createLlmReader, appendLlmReaderService, createProxyPlugin, createLocalBundlePlugin, createPageFetcher, createCollector, createDirectoryCollectSink, createS3Source, makeCrawler, makePageModel or makeReaderModels, or implementing a ReaderSource, a PageRenderer or a ReaderFetchPlugin.
user-invocable: false
---

# @owlmeans/llm-reader

**Layer:** Server (Node / Bun — sockets and a local proxy bridge)
**Install:** `"@owlmeans/llm-reader": "^0.2.3"` in `dependencies`, plus the `@langchain/core`,
`@langchain/langgraph`, `@langchain/langgraph-checkpoint`, `@langchain/openai` and
`@langchain/anthropic` **peers**
**Plugins:** `@owlmeans/llm-reader-playwright` (rendering) · `@owlmeans/llm-reader-google-drive`
(connect, Drive links) · `@owlmeans/file-streams/fetch` (the pinned `fetch`)

A reader is one fetcher (its plugins, proxies and address guard), an optional renderer, and the
models its analyses run on. Fetching, parsing, `collect` and a keyword-ranked `crawl` need no model;
every model-backed task does.

```ts
import {
  appendLlmReaderService, createDirectoryCollectSink, createProxyPlugin, makeReaderModels, ReaderMode,
} from '@owlmeans/llm-reader'

appendLlmReaderService(context, { plugins: [createProxyPlugin({ proxies: ['socks5h://u:p@host:1080'] })] })
const reader = context.reader().using(makeReaderModels(exec, { executions: context.executions() }))

const page = await reader.describe('https://example.com/story', { key: 'tenant-42' })
page.markdown              // the Markdown description — title, facts, summary, structure, links, images, content
await reader.extract(url, { schema, instruction: 'Who wrote it and when?' })   // DOM mode by default
await reader.classify(url, { mode: ReaderMode.Text })                             // one cheaper call over the text
await reader.images(url, { vision: true })     // every picture, its role and usage in context
await reader.design(url)                       // { markdown: DESIGN.md, tokens, facts, warnings }
await reader.collect(url, { sink: createDirectoryCollectSink(dir), prefix: 'links/01-site' })  // page bundle, file or S3 prefix
await reader.crawl(url, { intent: 'pricing', maxPages: 8 })      // bounded same-origin walk
await reader.close()                           // stops the SOCKS bridge and the renderer
```

## Key exports

| Export | Description |
|---|---|
| `createLlmReader(options)` · `appendLlmReaderService(ctx, options, alias?)` · `makeLlmReaderService` · `LLM_READER_SERVICE` | The reader: `fetch`, `page`, `describe`, `classify`, `extract`, `links`, `images`, `design`, `collect`, `crawl`, `using(models)`, `close`. A target is a URL, a `FetchedResource` or a `PageModel`; read options are `key` (the proxy key), `render`, `signal`. `LlmReaderOptions` = the fetcher's options plus `models`, `renderer`, `fetcher`, `budget`, `maxTurns`, `maxStylesheets`, `sources`, `s3`, `limits`. |
| `makeReaderModels(exec, { executions, roles?, spectator? })` · `DEFAULT_READER_ROLE` | One helper execution per `ReaderTask` (role `reader` unless `roles` maps it) — every task then reads in DOM mode by default. A bare `LlmModel` passed as `models` reads in text mode only. |
| `createPageFetcher(options)` · `ReaderFetchPlugin` · `FetchFunction` · `createFetchTransport({ fetch? })` | The fetcher: a plugin chain, guarded manual redirects, byte caps, charset decoding, `stream: true` bodies; `fetch` (an injected pinned fetch) replaces the transport — see the `fetching` part. |
| `createProxyPlugin(options)` · `ProxyPlugin.lease(request)` · `createSocksBridge(options)` | Proxies (list, key callback, strategies, failover) and the local HTTP bridge in front of SOCKS — see the `fetching` part. |
| `createAddressGuard({ allowPrivateNetwork?, allowHosts? })` | Refuses non-public targets; the fetcher, the bridge and the renderer all check through it. |
| `createLocalBundlePlugin({ root, origin? })` · `DEFAULT_BUNDLE_ORIGIN` · `BUNDLE_CONTENT_TYPES` | A local directory served under `https://bundle.local`, confined to its root; a collected bundle's `bundle.json` URLs too. |
| `createCollector({ fetcher, render?, sources?, limits? })` · `CollectSink` · `createDirectoryCollectSink(root)` | `collect(url, options)` / `bundle({ url, html, entry? }, options)` → `CollectResult` — see the `collect` part. |
| `ReaderSource` · `createS3Source(options?)` · `createS3UrlHelper(options?)` · `S3_SOURCE` · `DEFAULT_S3_ENDPOINT` | The link-expanding seam and the built-in S3 source. |
| `makeCrawler(reader, { models })` · `CrawlOptions` · `CrawlResult` | The crawl behind `reader.crawl`. |
| `createRenderStep(options)` · `PageRenderer` · `RenderRequest` · `RenderedPage` · `StyleSample` | The renderer seam, and rendering as the reader does it (bundle from disk, else lease + guard). |
| `makePageModel({ url, html, fetched?, rendered? })` | A parsed page: `meta`, `content`, `outline`, `links`, `images`, `signals`, `stylesheets`, `styles`, `dom`, `document`, all lazy and computed once. |
| `makePageAnalyst(page, options)` · `makeDesignAnalyst(page, options)` · `renderDesignMd(draft, facts)` | The model-backed reading of one page, its design write-up, and the deterministic DESIGN.md renderer. |
| `PageType`, `ImageRole`, `ImageKind`, `PageRegion`, `LinkKind`, `ReaderMode`, `ReaderTask`, `ProxyStrategy`, `CollectKind`, `CollectRole`, `CollectStatus`, `DESIGN_SECTIONS` | The vocabularies. |
| `DEFAULT_COLLECT_LIMITS`, `DEFAULT_COLLECT_FILE_TIMEOUT_MS`, `BUNDLE_MANIFEST`, `BUNDLE_MANIFEST_VERSION`, `BUNDLE_EXTERNAL_DIR`, `BRIDGE_ERROR_HEADER`, `BRIDGE_REFUSED_HEADER`, `ROBOTS_AGENT`, `DEFAULT_CRAWL_*` | Defaults and names. |
| `LlmReaderError` › `ReaderFetchError` › `ReaderProxyError`, `ReaderRefusedError`, `ReaderContentError`, `ReaderConfigError`, `ReaderLimitError`, `ReaderAnalysisError` | `ResilientError` family, messages `llm-reader:<kind>:…`; a `ReaderProxyError` carries the masked proxy id, never its credentials. |

## Rules

- **Private networks are refused by default.** Loopback, private, CGNAT, link-local (cloud
  metadata), benchmarking, multicast, reserved and their IPv6 embeddings — on every redirect hop, in
  the bridge for SOCKS targets it resolves, and on every request a rendered page makes. An intranet
  reader opts in with `allowPrivateNetwork: true`, a test site with `allowHosts: ['127.0.0.1']`.
  Through a proxy the proxy resolves names, so only literal addresses and local names are checked
  there; a direct Bun request can still be DNS-rebound — inject a pinned fetch
  (`@owlmeans/file-streams/fetch`) and every request, the renderer's sub-requests included, is
  connected to the address its policy checked.
- **Collected content never runs.** A bundle keeps no script, handler, `javascript:` URL, `<base>`
  or meta refresh; every item over a limit is skipped and reported, never thrown, and a stream past
  a cap leaves nothing in the sink.
- **One page, one egress.** The proxy key defaults to the target host; a page's stylesheets and
  pictures are fetched under the page's key, and a rendered page goes through the lease the fetch
  would have used.
- **The page is never handed to a mutating extractor.** Defuddle edits the document it reads, so it
  gets its own parse, and runs with `useAsync: false` — its site extractors would otherwise call
  third-party APIs outside the fetcher, proxy and guard.
- **DOM mode is the default** for every model-backed task when the reader has an execution; text
  mode (`mode: ReaderMode.Text`) is one cheaper call, and the only mode of a bare-model reader.
- **Pictures go only to a model that sees.** `design` attaches the screenshot only when the design
  model's `capabilities().vision` is true, and `images({ vision: true })` on a model without it is a
  `ReaderConfigError('no-vision-model')` before any call — `ModelConfig.vision` is the consumer's
  declaration.
- **Model answers are checked against the page.** Key links and selected links must be URLs the page
  has, image ids must exist, DOM-mode evidence quotes must appear in the cited node.
- **The model never writes Markdown structure or YAML the package can render.** `describe` and
  `design` ask for fields; the package renders the document.

## Pitfalls

- Model-backed tasks without models throw `ReaderConfigError('no-models')`; `images()` without
  models returns the inventory without roles.
- Put `createLocalBundlePlugin` FIRST in `plugins`, a rendering fetch plugin after the proxy plugin.
- An injected `fetch` refuses a proxy lease (`ReaderConfigError('injected-fetch-proxy')`):
  proxies belong on the fetch.
- Call `close()`: the SOCKS bridge and a launched browser live until then.

## Extending

- **A fetch plugin** — `ReaderFetchPlugin { name, attach?({ guard }), fetch?(request, next), close? }`;
  plugins wrap the whole fetch, outermost first. Never let a request bypass `next` to the network
  without `guard.check(url, resolve)`.
- **A renderer** — `PageRenderer.render(RenderRequest)` honours every field (`guard` on each
  sub-request, `lease.endpoint()`, `bundle` from disk, `fetch`, `snapshot`) and lists refusals in
  `blocked`; `@owlmeans/llm-reader-playwright` is the reference.
- **A source** — implement `ReaderSource` (the `collect` part) and pass it in `sources`; there is
  no source registry. `@owlmeans/llm-reader-google-drive` is the reference outside this package.
- A change lands with a spec over a real local server (the `testing` part).

## Depends On

- `@owlmeans/llm` (models, executions) · `@owlmeans/agent` (the DOM-mode agent) · `@owlmeans/llm-common` · `@owlmeans/context` · `@owlmeans/error` · `@owlmeans/log`
- `defuddle` + `linkedom` (article extraction, DOM) · `turndown` (structural Markdown) · `css-tree` + `culori` (design facts) · `socks` (the bridge) · `undici` (Node transport) · `ajv`

## Related

- [[llm]] — models, executions, web search · [[agent]] — the tool loop DOM mode runs on
- [[llm-reader-playwright]] (`@owlmeans/llm-reader-playwright`) — rendering, computed styles, screenshots, offline bundles, pinned sub-requests
- [[llm-reader-google-drive]] (`@owlmeans/llm-reader-google-drive`, OwlMeans connect) — the Google Drive `ReaderSource`
- [[file-streams]] (`@owlmeans/file-streams`) — the pinned `fetch` (`@owlmeans/file-streams/fetch`) a consumer injects
- [[web-research]] (`@owlmeans/web-research`) — research pipelines that clone, crawl and read design through a reader

## Parts

| Part | Load it when |
|---|---|
| [fetching](parts/fetching.md) | fetching through proxies (list, callback, strategies, failover) or an injected pinned fetch, streamed bodies, the SOCKS bridge, the address guard, Bun vs Node, a local bundle (an uploaded html/css prototype or a collected one), or a proxy that is bypassed or failing |
| [analysis](parts/analysis.md) | describing, classifying or extracting from a page, text vs DOM mode, links by intent, pictures with their context, vision captions |
| [collect](parts/collect.md) | cloning a link into files (page bundles, `bundle.json`, files, limits, sinks), writing a `ReaderSource` plugin, public S3 links, reading a collected bundle offline, or crawling a site |
| [design](parts/design.md) | the design facts, the DESIGN.md format the reader emits, or a design write-up that looks wrong |
| [testing](parts/testing.md) | running or adding tests of this package |
