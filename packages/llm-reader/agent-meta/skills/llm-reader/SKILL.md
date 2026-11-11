---
name: llm-reader
description: How to use @owlmeans/llm-reader — fetch web pages directly or through HTTP/SOCKS proxies (a list or a key→proxy callback), parse them (metadata with its evidence, main content as Markdown, links, pictures with the context they are used in, a ref-addressed DOM), and have a model read them in text mode or as a DOM-exploring @owlmeans/agent agent — describe (the default Markdown description), classify, extract, pick links, classify and caption images — and write the page's design system as a DESIGN.md — of a live site or of a local html/css bundle (an uploaded prototype). Auto-invoked when importing createLlmReader, appendLlmReaderService, createProxyPlugin, createLocalBundlePlugin, createPageFetcher, makePageModel or makeReaderModels.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/llm-reader

**Layer:** Server (Node / Bun — it opens sockets and runs a local proxy bridge)
**Install:** `"@owlmeans/llm-reader": "^0.1.22-rc.0"` in `dependencies`, plus the `@langchain/core`,
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
```

## Key exports

| Export | Description |
|---|---|
| `createLlmReader(options)` · `appendLlmReaderService(ctx, options, alias?)` · `makeLlmReaderService` | The reader: `fetch`, `page`, `describe`, `classify`, `extract`, `links`, `images`, `design`, `using(models)`, `close`. A target is a URL, a `FetchedResource` or a `PageModel`; read options are `key` (the proxy key), `render`, `signal`. |
| `makeReaderModels(exec, { executions, roles?, spectator? })` | Reader models bound to an execution: one helper per `ReaderTask` (role `reader` unless `roles` maps it) — every task then reads in DOM mode by default. A bare `LlmModel` passed as `models` reads in text mode only. |
| `createPageFetcher(options)` · `ReaderFetchPlugin` | The fetcher: a middleware chain, guarded manual redirects, byte caps, charset decoding. |
| `createProxyPlugin(options)` · `ProxyPlugin.lease(request)` | The integrated proxy plugin — see the `fetching` part. |
| `createAddressGuard(options)` | Refuses non-public targets; the reader, the bridge and the renderer all check through it. |
| `createLocalBundlePlugin({ root, origin? })` · `LocalBundle` | A local directory served under a synthetic origin (`https://bundle.local`), confined to its root — see the `fetching` part. |
| `createSocksBridge(options)` · `createFetchTransport()` | The local HTTP-proxy bridge in front of SOCKS proxies, and the runtime transport (Bun fetch / Node undici). |
| `makePageModel(source)` | A parsed page: `meta`, `content`, `outline`, `links`, `images`, `signals`, `stylesheets`, `styles`, `dom`, all lazy and computed once. |
| `makePageAnalyst(page, options)` · `makeDesignAnalyst(page, options)` | The model-backed reading of one page, and its design write-up. |
| `renderDesignMd(draft, facts)` | The deterministic DESIGN.md renderer. |
| `PageRenderer` · `RenderedPage` · `StyleSample` | The renderer seam `@owlmeans/llm-reader-playwright` fills. |
| `PageType`, `ImageRole`, `ImageKind`, `PageRegion`, `LinkKind`, `ReaderMode`, `ReaderTask`, `ProxyStrategy`, `DESIGN_SECTIONS` | The vocabularies. |
| `LlmReaderError` › `ReaderFetchError` › `ReaderProxyError`, `ReaderRefusedError`, `ReaderContentError`, `ReaderConfigError`, `ReaderAnalysisError` | `ResilientError` family; a `ReaderProxyError` carries the masked proxy id, never its credentials. |

## Rules

- **Private networks are refused by default.** Loopback, private, CGNAT, link-local (cloud
  metadata), benchmarking, multicast, reserved and their IPv6 embeddings — on every redirect hop, in
  the bridge for SOCKS targets it resolves, and on every request a rendered page makes. An intranet
  reader opts in with `allowPrivateNetwork: true`, a test site with `allowHosts: ['127.0.0.1']`.
  Through a proxy the proxy resolves names, so only literal addresses and local names are checked
  there; a direct Bun request can still be DNS-rebound.
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
| [fetching](parts/fetching.md) | fetching through proxies (list, callback, strategies, failover), the SOCKS bridge, the address guard, Bun vs Node, a local bundle (an uploaded html/css prototype), or a proxy that is bypassed or failing |
| [analysis](parts/analysis.md) | describing, classifying or extracting from a page, text vs DOM mode, links by intent, pictures with their context, vision captions |
| [design](parts/design.md) | the design facts, the DESIGN.md format the reader emits, or a design write-up that looks wrong |
| [testing](parts/testing.md) | running or adding tests of this package |

## Depends On

- `@owlmeans/llm` (models, executions) · `@owlmeans/agent` (the DOM-mode agent) · `@owlmeans/llm-common` · `@owlmeans/context` · `@owlmeans/error` · `@owlmeans/log`
- `defuddle` + `linkedom` (article extraction, DOM) · `turndown` (structural Markdown) · `css-tree` + `culori` (design facts) · `socks` (the bridge) · `undici` (Node transport) · `ajv`

## Related

- [[llm]] — models, executions, web search · [[agent]] — the tool loop DOM mode runs on
- [[llm-reader-playwright]] — rendering, computed styles, screenshots
