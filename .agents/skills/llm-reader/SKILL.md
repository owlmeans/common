---
name: llm-reader
description: How to use @owlmeans/llm-reader — fetch web pages directly, through HTTP/SOCKS proxies, or through an injected pinned fetch (file-streams); parse them (metadata with evidence, Markdown content, links, pictures in context, a ref-addressed DOM); have a model describe, classify, extract, pick links, caption images and write a DESIGN.md — of a live site or a local html/css bundle; clone a link into local files (a page bundle with its CSS, fonts and pictures and bundle.json, a streamed file, a public S3 prefix, a ReaderSource plugin's folder) and crawl a site in a bounded, robots-honouring way. Auto-invoked when importing createLlmReader, appendLlmReaderService, createProxyPlugin, createLocalBundlePlugin, createPageFetcher, createCollector, createDirectoryCollectSink, createS3Source, makeCrawler, makePageModel or makeReaderModels, or implementing a ReaderSource.
user-invocable: false
---

# @owlmeans/llm-reader

**Layer:** Server (Node / Bun — it opens sockets and runs a local proxy bridge)
**Install:** `"@owlmeans/llm-reader": "^0.2.0-alpha.0"` in `dependencies`, plus the `@langchain/core`,
`@langchain/langgraph`, `@langchain/langgraph-checkpoint`, `@langchain/openai` and
`@langchain/anthropic` **peers**
**Browser rendering:** `@owlmeans/llm-reader-playwright` (a separate, optional package)

A reader is one fetcher (its plugins, proxies and address guard), an optional renderer, and the
models its analyses run on. Fetching and parsing need no model; every model-backed task does.

```ts
import { appendLlmReaderService, createProxyPlugin, makeReaderModels } from '@owlmeans/llm-reader'

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
```

## Key exports

| Export | Description |
|---|---|
| `createLlmReader(options)` · `appendLlmReaderService(ctx, options, alias?)` · `makeLlmReaderService` | The reader: `fetch`, `page`, `describe`, `classify`, `extract`, `links`, `images`, `design`, `collect`, `crawl`, `using(models)`, `close`. A target is a URL, a `FetchedResource` or a `PageModel`; read options are `key` (the proxy key), `render`, `signal`. Options add `fetch` (an injected pinned fetch), `sources`, `s3`, `limits`. |
| `makeReaderModels(exec, { executions, roles?, spectator? })` | Reader models bound to an execution: one helper per `ReaderTask` (role `reader` unless `roles` maps it) — every task then reads in DOM mode by default. A bare `LlmModel` passed as `models` reads in text mode only. |
| `createPageFetcher(options)` · `ReaderFetchPlugin` | The fetcher: a middleware chain, guarded manual redirects, byte caps, charset decoding, `stream: true` bodies; `fetch` replaces the transport. |
| `FetchFunction` · `createFetchTransport({ fetch? })` | The injected-fetch seam — see the `fetching` part. |
| `createCollector({ fetcher, render?, sources?, limits? })` · `CollectSink` · `createDirectoryCollectSink(root)` | `collect(url, options)` / `bundle({ url, html, entry? }, options)` → `CollectResult` — see the `collect` part. |
| `ReaderSource` · `createS3Source(options?)` · `createS3UrlHelper(options?)` | The link-expanding seam (a Drive folder plugin implements it) and the built-in public-S3 source. |
| `makeCrawler(reader, { models })` · `CrawlOptions` · `CrawlResult` | The bounded crawl behind `reader.crawl`. |
| `createRenderStep(options)` · `RenderStep` | Rendering as the reader does it (bundle from disk, else lease + guard, the injected fetch handed on). |
| `createProxyPlugin(options)` · `ProxyPlugin.lease(request)` | The integrated proxy plugin — see the `fetching` part. |
| `createAddressGuard(options)` | Refuses non-public targets; the reader, the bridge and the renderer all check through it. |
| `createLocalBundlePlugin({ root, origin? })` · `LocalBundle` · `BundleManifest` | A local directory served under a synthetic origin (`https://bundle.local`), confined to its root; a collected bundle's `bundle.json` URLs too — see the `fetching` part. |
| `createSocksBridge(options)` · `createFetchTransport()` | The local HTTP-proxy bridge in front of SOCKS proxies, and the runtime transport (Bun fetch / Node undici). |
| `makePageModel(source)` | A parsed page: `meta`, `content`, `outline`, `links`, `images`, `signals`, `stylesheets`, `styles`, `dom`, all lazy and computed once. |
| `makePageAnalyst(page, options)` · `makeDesignAnalyst(page, options)` | The model-backed reading of one page, and its design write-up. |
| `renderDesignMd(draft, facts)` | The deterministic DESIGN.md renderer. |
| `PageRenderer` · `RenderedPage` · `StyleSample` | The renderer seam `@owlmeans/llm-reader-playwright` fills. |
| `PageType`, `ImageRole`, `ImageKind`, `PageRegion`, `LinkKind`, `ReaderMode`, `ReaderTask`, `ProxyStrategy`, `CollectKind`, `CollectRole`, `CollectStatus`, `DESIGN_SECTIONS` | The vocabularies. |
| `DEFAULT_COLLECT_LIMITS`, `BUNDLE_MANIFEST`, `BUNDLE_EXTERNAL_DIR`, `S3_SOURCE`, `ROBOTS_AGENT`, `DEFAULT_CRAWL_*` | Defaults and names. |
| `LlmReaderError` › `ReaderFetchError` › `ReaderProxyError`, `ReaderRefusedError`, `ReaderContentError`, `ReaderConfigError`, `ReaderLimitError`, `ReaderAnalysisError` | `ResilientError` family; a `ReaderProxyError` carries the masked proxy id, never its credentials. |

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
- **Pictures go only to a model that sees.** A picture is a checked `mediaHelper.image` part
  (`@owlmeans/llm`); `design` attaches the screenshot only when the design model's
  `capabilities().vision` is true, and `images({ vision: true })` on a model without it is a
  `ReaderConfigError('no-vision-model')` before any call — `ModelConfig.vision` is the consumer's
  declaration.
- **Model answers are checked against the page.** Key links and selected links must be URLs the page
  has, image ids must exist, DOM-mode evidence quotes must appear in the cited node.
- **The model never writes Markdown structure or YAML the package can render.** `describe` and
  `design` ask for fields; the package renders the document.

## Parts

| Part | Load it when |
|---|---|
| [fetching](parts/fetching.md) | fetching through proxies (list, callback, strategies, failover) or an injected pinned fetch, streamed bodies, the SOCKS bridge, the address guard, Bun vs Node, a local bundle (an uploaded html/css prototype or a collected one), or a proxy that is bypassed or failing |
| [analysis](parts/analysis.md) | describing, classifying or extracting from a page, text vs DOM mode, links by intent, pictures with their context, vision captions |
| [collect](parts/collect.md) | cloning a link into files (page bundles, `bundle.json`, files, limits, sinks), writing a `ReaderSource` plugin, public S3 links, reading a collected bundle offline, or crawling a site |
| [design](parts/design.md) | the design facts, the DESIGN.md format the reader emits, or a design write-up that looks wrong |
| [testing](parts/testing.md) | running or adding tests of this package |

## Depends On

- `@owlmeans/llm` (models, executions) · `@owlmeans/agent` (the DOM-mode agent) · `@owlmeans/llm-common` · `@owlmeans/context` · `@owlmeans/error` · `@owlmeans/log`
- `defuddle` + `linkedom` (article extraction, DOM) · `turndown` (structural Markdown) · `css-tree` + `culori` (design facts) · `socks` (the bridge) · `undici` (Node transport) · `ajv`

## Related

- [[llm]] — models, executions, web search · [[agent]] — the tool loop DOM mode runs on
- [[llm-reader-playwright]] — rendering, computed styles, screenshots, offline bundles, pinned sub-requests
- [[file-streams]] — the pinned `fetch` (`@owlmeans/file-streams/fetch`) a consumer injects
