# @owlmeans/llm-reader

Read the web with an LLM: fetch pages directly or through HTTP and SOCKS proxies, parse them, and
have a model describe, classify and extract from them — as text or by exploring their DOM — list
their pictures with the context they are used in, and write their design system as a DESIGN.md.
Clone what a link points at into local files (a page with its CSS, fonts and pictures, a file, an
S3 prefix, a provider's folder), and crawl a site in a bounded way.

## Overview

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
  in, others (a Drive folder) as `ReaderSource` plugins
- **Crawl** — a bounded breadth-first walk: same origin, robots.txt, pacing, links ranked by intent
- **Pinned traffic** — hand the reader a pinned `fetch` (`@owlmeans/file-streams/fetch`) and every
  request it makes goes through it

## Installation

```bash
bun add @owlmeans/llm-reader@^0.2.0-alpha.0
bun add @langchain/core @langchain/langgraph @langchain/langgraph-checkpoint @langchain/openai @langchain/anthropic
```

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
const pictures = await reader.images(url, { vision: true })           // role, usage, caption, region, caption…
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

const reader = createLlmReader({ fetch: createPinnedFetch(), sources: [driveSource], renderer })
const sink = createDirectoryCollectSink('/tmp/links')                     // or your own CollectSink
const site = await reader.collect('https://example.com/', { sink, prefix: '01-site', limits: { maxFiles: 50 } })
site.kind                                                                 // 'bundle' — index.html, css/, external/<host>/…, bundle.json
await reader.collect('s3://public-bucket/brand/', { sink, prefix: '02-brand' })   // every object under the prefix
await reader.collect('https://example.com/report.pdf', { sink })          // one file, its Content-Disposition name

const offline = createLlmReader({ plugins: [createLocalBundlePlugin({ root: '/tmp/links/01-site' })] })
await offline.page('https://example.com/')                                // answered from disk through bundle.json

const { pages } = await reader.crawl('https://docs.example.com/', { intent: 'pricing and limits', maxPages: 8, depth: 2 })
```

Every request of `collect` — the page, its stylesheets and pictures, files, S3 listings, a source's
own requests — goes through the reader's fetcher: its plugins, the address guard on every hop, and
the injected `fetch` when there is one (the guard is the pre-check; the pinning against DNS
rebinding comes from the fetch). Items over a limit are skipped and listed with a reason; `collect`
throws only for an abort or a bad configuration.

Pictures are sent only to a model that sees: `design` attaches the screenshot when the design
model's `ModelConfig.vision` is set, and `images({ vision: true })` refuses a model without it.

## API

| Export | Purpose |
|---|---|
| `createLlmReader(options)` | `fetch`, `page`, `describe`, `classify`, `extract`, `links`, `images`, `design`, `collect`, `crawl`, `using`, `close`; options `fetch` (an injected, pinned fetch), `sources`, `s3`, `limits`. |
| `appendLlmReaderService(ctx, options, alias?)` | Registers the reader as `context.reader()`. |
| `makeReaderModels(exec, { executions, roles?, spectator? })` | Models per reader task, refined from an execution. |
| `createPageFetcher(options)` | The fetcher on its own. |
| `createProxyPlugin(options)` | The proxy plugin; `lease(request)` hands a proxy to other clients. |
| `createLocalBundlePlugin({ root, origin? })` | A local directory served under a synthetic origin (default `https://bundle.local`), confined to its root; `urlOf(path)`, `read(url)`, `serves(url)`; with a `bundle.json` it answers the collected page's original URLs too. |
| `createCollector({ fetcher, render?, sources?, limits? })` | `collect(url, options)` and `bundle({ url, html, entry? }, options)` on their own. |
| `createDirectoryCollectSink(root)` | A `CollectSink` writing into a directory (atomic per file, confined). |
| `createS3Source(options?)` · `createS3UrlHelper(options?)` | The built-in public-S3 source (anonymous ListObjectsV2 + GET) and its URL reading. |
| `makeCrawler(reader, { models })` | The crawler `reader.crawl` uses. |
| `createAddressGuard(options)` | The private-address guard. |
| `makePageModel({ url, html })` | Parse HTML you already have. |
| `renderDesignMd(draft, facts)` | Render a DESIGN.md from a token draft. |

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
