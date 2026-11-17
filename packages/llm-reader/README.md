# @owlmeans/llm-reader

Read the web with an LLM: fetch pages directly, through HTTP and SOCKS proxies or through an
injected pinned `fetch`, parse them, and have a model describe, classify and extract from them — as
text or by exploring their DOM — list their pictures with the context they are used in, and write
their design system as a DESIGN.md. Clone what a link points at into local files (a page with its
CSS, fonts and pictures, a file, an S3 prefix, a provider's folder), and crawl a site in a bounded
way. Server-side only (Node or Bun).

## Concepts

- **Fetcher** — a plugin chain, redirects followed with every hop guarded, byte caps, charset
  decoding; private, loopback and metadata addresses refused by default
- **Proxy plugin** — a list of proxies or a callback that receives the request key and returns the
  proxy (with credentials); round-robin, random or sticky; cooldown and failover; SOCKS4/4a/5/5h
  through a built-in local bridge, so it works on Bun and Node alike
- **Page model** — metadata with its evidence (JSON-LD, Open Graph, markup), main content as
  Markdown, links and pictures with their context, page-type signals, a ref-addressed DOM
- **Analyst** — `describe` (the default Markdown description), `classify`, `extract`, links by
  intent, picture roles and vision captions — in DOM mode by default (an `@owlmeans/agent` agent
  with DOM tools), or in text mode (one call over the page text) on request or with a bare model
- **Design** — stylesheets parsed and weighted by the DOM (computed styles too, with
  `@owlmeans/llm-reader-playwright`), turned into a DESIGN.md (Google Labs format)
- **Collect** — one link into files on a sink: a page as a bundle (stylesheets with `@import`
  chains, CSS fonts and pictures, `img`/`srcset`/icons, references rewritten, scripts removed,
  `bundle.json`), a file streamed under caps, or the files a source expands it to — public S3 built
  in, others (a Google Drive folder) as `ReaderSource` plugins
- **Crawl** — a bounded breadth-first walk: same origin, robots.txt, pacing, links ranked by intent
- **Pinned traffic** — hand the reader a pinned `fetch` (`@owlmeans/file-streams/fetch`) and every
  request it makes, a rendered page's sub-requests included, goes through it

## Installation

```bash
bun add @owlmeans/llm-reader@^0.2.1
bun add @langchain/core @langchain/langgraph @langchain/langgraph-checkpoint @langchain/openai @langchain/anthropic
```

The LangChain packages are peers: the DOM-mode agent loads them lazily, but they must be installed.

## Usage

```typescript
import { createLlmReader, createProxyPlugin, makeReaderModels, ReaderMode } from '@owlmeans/llm-reader'

const reader = createLlmReader({
  plugins: [createProxyPlugin({
    proxies: ['socks5h://user:pass@proxy-1:1080', 'http://user:pass@proxy-2:3128'],
    resolve: async key => key.startsWith('eu:') ? 'http://user:pass@eu-proxy:3128' : undefined,
  })],
  models: makeReaderModels(exec, { executions }),   // or one LlmModel, for text mode only
})

const { markdown } = await reader.describe('https://example.com/story', { key: 'eu:tenant-42' })

const { data, evidence } = await reader.extract<{ author: string, published: string }>(url, {
  instruction: 'Who wrote this article and when was it published?',
  schema: { type: 'object', properties: { author: { type: 'string' }, published: { type: 'string' } }, required: ['author', 'published'] },
})                                                                    // DOM mode: the default with an execution

const kindFast = await reader.classify(url, { mode: ReaderMode.Text }) // one cheaper call over the page text

const kind = await reader.classify(url)                               // landing, article, listing, app, …
const stories = await reader.links(url, { intent: 'links to articles' })
const pictures = await reader.images(url, { vision: true })           // role, usage, region, vision caption…
const { markdown: designMd } = await reader.design(url)               // DESIGN.md
await reader.close()
```

In a context: `appendLlmReaderService(context, options)`, then `context.reader().using(models)`.

### A local prototype

```typescript
import { createLlmReader, createLocalBundlePlugin } from '@owlmeans/llm-reader'

const bundle = createLocalBundlePlugin({ root: '/uploads/prototype' })   // home.html, css/, img/
const local = createLlmReader({ plugins: [bundle], models })             // the bundle plugin first
const home = bundle.urlOf('home.html')                                    // https://bundle.local/home.html
const page = await local.page(home)                                       // blocks, links, pictures — no model
const { markdown } = await local.design(home)                             // DESIGN.md of the prototype
```

Files are served from the root under the synthetic origin with their content types; `..`, encoded
separators, absolute paths and symbolic links that leave the root are refused. Any other URL — a
prototype's external font or picture — still goes through the fetcher, its proxies and the address
guard. With `@owlmeans/llm-reader-playwright` a bundle page renders from disk too.

### Collect a link, crawl a site

```typescript
import { createDirectoryCollectSink, createLlmReader, createLocalBundlePlugin } from '@owlmeans/llm-reader'
import { createPinnedFetch } from '@owlmeans/file-streams/fetch'

const reader = createLlmReader({ fetch: createPinnedFetch({ resolvers: [] }), sources: [driveSource], renderer })
const sink = createDirectoryCollectSink('/tmp/links')                     // or your own CollectSink
const site = await reader.collect('https://example.com/', { sink, prefix: '01-site', limits: { maxFiles: 50 } })
site.kind                                                                 // 'bundle' — index.html, css/, external/<host>/…, bundle.json
await reader.collect('s3://public-bucket/brand/', { sink, prefix: '02-brand' })   // every object under the prefix
await reader.collect('https://example.com/report.pdf', { sink })          // one file, its Content-Disposition name

const offline = createLlmReader({ plugins: [createLocalBundlePlugin({ root: '/tmp/links/01-site' })] })
await offline.page('https://example.com/')                                // answered from disk through bundle.json

const { pages } = await reader.crawl('https://docs.example.com/', { intent: 'pricing and limits', maxPages: 8, depth: 2 })
```

`driveSource` is `createGoogleDriveSource()` from `@owlmeans/llm-reader-google-drive`; the pinned
fetch of such a reader is built with `resolvers: []`, since file-streams' own Drive resolver would
rewrite folder pages.

## Configuration

`createLlmReader(options)` takes the fetcher's options plus the reader's own:

| Option | Default | Purpose |
|---|---|---|
| `models` | — | `makeReaderModels(exec, { executions, roles?, spectator? })` (text and DOM mode) or one `LlmModel` (text mode only). Without it the reader still fetches, parses, collects and crawls. |
| `renderer` | — | A `PageRenderer` (`@owlmeans/llm-reader-playwright`): app shells and design pages are rendered. |
| `fetcher` | built from these options | A ready `PageFetcher`. |
| `plugins` | `[]` | Fetch plugins, outermost first: a local bundle first, then the proxy plugin, then a rendering plugin. |
| `fetch` | — | A WHATWG-compatible `fetch` every request goes through (the pinned one of `@owlmeans/file-streams/fetch`); proxy leases are then refused. |
| `allowPrivateNetwork` / `allowHosts` | `false` / `[]` | Let private targets, or named hosts and their subdomains, through the address guard. |
| `guard` · `transport` | built in | Replace the address guard, or the runtime transport. |
| `userAgent` · `timeout` · `maxRedirects` · `maxBytes` · `acceptStatus` | `OwlMeansReader` UA · 30 s · 5 · 10 MB page / 2 MB stylesheet / 8 MB image · any status | Request behaviour. |
| `budget` · `maxTurns` | 60 000 chars · 12 | Text-mode page budget; DOM-agent turns. |
| `maxStylesheets` | 10 | Linked stylesheets a design analysis reads. |
| `sources` | `[]` | `ReaderSource` plugins `collect` consults, in order, before the built-in S3 source. |
| `s3` | `{}` | `S3SourceOptions` (`endpoint`, `pathStyle`, `endpoints`, `pageSize`, `maxPages`), or `false` to drop the S3 source. |
| `limits` | `DEFAULT_COLLECT_LIMITS` | Collect limits under every collect's own: `maxFiles` 100, `maxFileBytes` 12 MiB, `maxTotalBytes` 100 MiB, `maxAssets` 150, `maxAssetBytes` 30 MiB. |

`crawl` takes `intent`, `maxPages` (10), `depth` (2), `sameOrigin` (`true`), `linksPerPage` (20),
`concurrency` (2), `delay` (500 ms), `robots` (`true`), `describe`, `key`, `signal`, `render`.

## Security and limits

- **Address guard** — loopback, private, CGNAT, link-local (cloud metadata), documentation,
  benchmarking, multicast and reserved addresses, their IPv6 forms, local names (`localhost`,
  `.local`, `.internal`, `.home.arpa`), other schemes and credentials in URLs are refused
  (`ReaderRefusedError`) on every redirect hop, in the SOCKS bridge and on every request a rendered
  page makes. Through a proxy only literal addresses and local names can be checked; a direct
  request resolves the name first. Inject a pinned `fetch` to close the DNS-rebinding window.
- **`NO_PROXY` fails closed** — a request Bun would send direct despite an explicit proxy is refused
  (`ReaderProxyError('no-proxy-bypass:…')`).
- **Proxy credentials** never appear in errors or logs: proxies are reported by a masked id.
- **Collected content never runs** — a bundle keeps no script, inline handler, `javascript:` URL,
  `<base>` or meta refresh; paths are confined and made storable; items over a limit are skipped and
  reported, never thrown; a stream past a cap leaves nothing in the sink.
- **robots.txt** (RFC 9309, token `OwlMeansReader`) is honoured by `crawl`, with at least `delay`
  between two requests to one host (`Crawl-delay` up to 10 s raises it).
- **S3** is read anonymously (GET and ListObjectsV2 only); its XML is read by pattern, with no entity
  expansion.
- **Model answers are checked against the page** (URLs, image ids, evidence quotes), and pictures
  go only to a model declared to see (`ModelConfig.vision`).

## API

| Export | Purpose |
|---|---|
| `createLlmReader(options)` | The reader: `fetch`, `page`, `describe`, `classify`, `extract`, `links`, `images`, `design`, `collect`, `crawl`, `using(models)`, `close`. |
| `appendLlmReaderService(ctx, options?, alias?)` · `makeLlmReaderService(options?, alias?)` · `LLM_READER_SERVICE` | The reader as a context service: `context.reader()`. |
| `makeReaderModels(exec, { executions, roles?, spectator? })` · `DEFAULT_READER_ROLE` | Models per `ReaderTask`, one helper execution each (role `reader` unless mapped). |
| `createPageFetcher(options?)` | The fetcher on its own. |
| `createAddressGuard(options?)` | The private-address guard: `check(url, resolve)`, `checkAddress`, `isNonPublic`. |
| `createFetchTransport({ fetch? })` | The runtime transport (Bun fetch, Node undici), or an injected `fetch`. |
| `createProxyPlugin(options?)` | The proxy plugin; `lease(request)` hands a proxy to other clients (a browser). |
| `createSocksBridge(options?)` | The local HTTP-proxy bridge in front of SOCKS proxies. |
| `createLocalBundlePlugin({ root, origin? })` · `DEFAULT_BUNDLE_ORIGIN` · `BUNDLE_CONTENT_TYPES` | A local directory served under a synthetic origin (default `https://bundle.local`), confined to its root; `urlOf(path)`, `read(url)`, `serves(url)`, `manifest`; with a `bundle.json` it answers the collected page's original URLs too. |
| `createCollector({ fetcher, render?, sources?, limits? })` | `collect(url, options)` and `bundle({ url, html, entry? }, options)` on their own. |
| `createDirectoryCollectSink(root)` | A `CollectSink` writing into a directory (atomic per file, confined). |
| `createS3Source(options?)` · `createS3UrlHelper(options?)` · `S3_SOURCE` · `DEFAULT_S3_ENDPOINT` | The built-in public-S3 source (anonymous ListObjectsV2 + GET) and its URL reading. |
| `makeCrawler(reader, { models })` | The crawler `reader.crawl` uses. |
| `createRenderStep({ renderer, fetcher, plugins?, fetch? })` | Rendering as the reader does it: a bundle from disk, else through the lease and the guard. |
| `makePageModel({ url, html, fetched?, rendered? })` | Parse HTML you already have. |
| `makePageAnalyst(page, options)` · `makeDesignAnalyst(page, options)` | The model-backed reading of one page, and its design analysis. |
| `renderDesignMd(draft, facts)` · `DESIGN_SECTIONS` | Render a DESIGN.md from a token draft; its section order. |
| `PageType`, `ImageRole`, `ImageKind`, `PageRegion`, `LinkKind`, `ReaderMode`, `ReaderTask`, `ProxyStrategy`, `CollectKind`, `CollectRole`, `CollectStatus` | Enums. |
| `DEFAULT_COLLECT_LIMITS`, `DEFAULT_COLLECT_FILE_TIMEOUT_MS`, `BUNDLE_MANIFEST`, `BUNDLE_MANIFEST_VERSION`, `BUNDLE_EXTERNAL_DIR` | Collect defaults and the bundle layout. |
| `DEFAULT_CRAWL_MAX_PAGES`, `DEFAULT_CRAWL_DEPTH`, `DEFAULT_CRAWL_LINKS_PER_PAGE`, `DEFAULT_CRAWL_CONCURRENCY`, `DEFAULT_CRAWL_DELAY_MS`, `ROBOTS_AGENT` | Crawl defaults and the robots.txt token. |
| `BRIDGE_ERROR_HEADER`, `BRIDGE_REFUSED_HEADER` | Headers the SOCKS bridge marks its own answers with. |
| `LlmReaderError`, `ReaderFetchError`, `ReaderProxyError`, `ReaderRefusedError`, `ReaderContentError`, `ReaderConfigError`, `ReaderLimitError`, `ReaderAnalysisError` | The `ResilientError` family (`llm-reader:<kind>:…`). |

Types: the reader (`LlmReader`, `LlmReaderOptions`, `ReadOptions`, `ReaderTarget`, `LlmReaderService`,
`WithLlmReaderService`), fetching (`PageFetcher`, `PageFetcherOptions`, `FetchRequest`, `FetchedResource`,
`FetchPurpose`, `ReaderFetchPlugin`, `ReaderFetchContext`, `FetchFunction`, `FetchInit`,
`FetchTransport`, `FetchTransportOptions`, `TransportRequest`, `Undici`, `AddressGuard`,
`AddressGuardOptions`), proxies (`ProxyPlugin`, `ProxyPluginOptions`, `ProxySpec`, `ProxyProtocol`,
`ProxyLease`, `ProxyOutcome`, `ProxyResolver`, `ProxyRequestInfo`, `HttpProxyEndpoint`, `SocksBridge`,
`SocksBridgeOptions`), bundles (`LocalBundle`, `LocalBundlePlugin`, `LocalBundleOptions`,
`LocalBundleFile`, `BundleManifest`, `BundleSkip`), rendering (`PageRenderer`, `RenderRequest`,
`RenderedPage`, `RenderedBlock`, `StyleSample`, `RenderStep`, `RenderStepOptions`, `RenderReadOptions`),
the page (`PageModel`, `PageSource`, `PageMeta`, `MetaValue`, `MetaSource`, `PageContent`, `PageHeading`,
`PageLink`, `PageImage`, `ImageCandidate`, `PageSignals`, `DomIndex`, `DomNodeView`), analysis
(`ReaderModels`, `ReaderModelsOptions`, `AnalystOptions`, `PageAnalyst`, `ModeOptions`, `DescribeOptions`,
`PageDescription`, `DescribeDraft`, `PageClassification`, `ExtractOptions`, `ExtractResult`, `Evidence`,
`LinksOptions`, `SelectedLink`, `ImagesOptions`, `DomTask`, `DomAnswer`), design (`DesignAnalyst`,
`DesignAnalystOptions`, `DesignOptions`, `DesignReport`, `DesignFacts`, `DesignTokens`, `DesignDraft`,
`DesignProse`, `ColorFact`, `TypeFact`, `ScaleFact`, `ComponentFact`, `BlockFact`), collect
(`Collector`, `CollectorOptions`, `CollectSink`, `CollectFileInfo`, `CollectWritten`, `CollectLimits`,
`CollectOptions`, `CollectItem`, `CollectResult`, `BundleInput`, `ReaderSource`, `ReaderSourceContext`,
`SourceAnswer`, `SourceFetchInit`, `SourceEntry`), crawl (`Crawler`, `CrawlerOptions`, `CrawlOptions`,
`CrawlResult`, `CrawledPage`, `CrawlSkip`) and S3 (`S3SourceOptions`, `S3Location`, `S3AddressingStyle`,
`S3UrlHelper`, `S3Listing`, `S3ListedObject`, `S3ErrorDocument`, `S3XmlHelper`).

The package has one entry point (`@owlmeans/llm-reader`); there are no subpath exports.

## Common pitfalls

- A model-backed task on a reader without models throws `ReaderConfigError('no-models')`;
  `ReaderMode.Dom` with a bare `LlmModel` throws `ReaderConfigError('dom-mode-needs-an-execution')`.
- `images({ vision: true })` with a model whose config does not declare `vision` is refused
  (`no-vision-model`) before any call.
- Put `createLocalBundlePlugin` first in `plugins`; a request under its origin never reaches a proxy.
- An injected `fetch` refuses proxy leases (`injected-fetch-proxy`) — configure proxies on the fetch.
- A 404 page is still a page: check `FetchedResource.status`, or pass `acceptStatus`.
- Call `close()` — the SOCKS bridge listener and a launched browser stay up until then.

## Tests

```bash
bun run build && bun test ./tests
```

Offline specs run against real local servers (a fixture site, a collect site with a cross-origin
font CDN, an S3 stand-in, an HTTP proxy, a SOCKS server) and a local bundle fixture
(`tests/fixtures/bundle`). Live specs are gated: `ANTHROPIC_SECRET` or `OPENAI_SECRET` (analysis),
`LLM_READER_LIVE_WEB=1` (the public web), `LLM_READER_LIVE_S3=1` (the public S3 fixture bucket),
`LLM_READER_PROXIES` (real proxies) in the repo root `.env`.

## Depends On

- `@owlmeans/llm`, `@owlmeans/agent`, `@owlmeans/llm-common`, `@owlmeans/context`, `@owlmeans/error`, `@owlmeans/log`
- `defuddle`, `linkedom`, `turndown`, `css-tree`, `culori`, `socks`, `undici`, `ajv`

## Related packages

- [`@owlmeans/llm-reader-playwright`](../llm-reader-playwright) — a Playwright renderer: script-run pages, computed styles, screenshots, offline bundles
- [`@owlmeans/llm-reader-google-drive`](https://github.com/owlmeans/connect/tree/main/packages/llm-reader-google-drive) (OwlMeans connect) — the Google Drive `ReaderSource` for `collect`
- [`@owlmeans/file-streams`](../file-streams) — `@owlmeans/file-streams/fetch`: the pinned `fetch` a reader takes
- [`@owlmeans/web-research`](../web-research) — resumable research pipelines that clone, crawl and read design through a reader
- [`@owlmeans/llm`](../llm) — models, executions and web search · [`@owlmeans/agent`](../agent) — the tool loop DOM mode runs on

The `llm-reader` skill covers the same package for agents.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.1
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
