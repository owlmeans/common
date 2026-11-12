# @owlmeans/llm-reader

Read the web with an LLM: fetch pages directly or through HTTP and SOCKS proxies, parse them, and
have a model describe, classify and extract from them — as text or by exploring their DOM — list
their pictures with the context they are used in, and write their design system as a DESIGN.md.

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

Pictures are sent only to a model that sees: `design` attaches the screenshot when the design
model's `ModelConfig.vision` is set, and `images({ vision: true })` refuses a model without it.

## API

| Export | Purpose |
|---|---|
| `createLlmReader(options)` | `fetch`, `page`, `describe`, `classify`, `extract`, `links`, `images`, `design`, `using`, `close`. |
| `appendLlmReaderService(ctx, options, alias?)` | Registers the reader as `context.reader()`. |
| `makeReaderModels(exec, { executions, roles?, spectator? })` | Models per reader task, refined from an execution. |
| `createPageFetcher(options)` | The fetcher on its own. |
| `createProxyPlugin(options)` | The proxy plugin; `lease(request)` hands a proxy to other clients. |
| `createLocalBundlePlugin({ root, origin? })` | A local directory served under a synthetic origin (default `https://bundle.local`), confined to its root; `urlOf(path)`, `read(url)`, `serves(url)`. |
| `createAddressGuard(options)` | The private-address guard. |
| `makePageModel({ url, html })` | Parse HTML you already have. |
| `renderDesignMd(draft, facts)` | Render a DESIGN.md from a token draft. |

## Tests

```bash
bun run build && bun test ./tests
```

Offline specs run against real local servers (a fixture site, an HTTP proxy, a SOCKS server) and a
local bundle fixture (`tests/fixtures/bundle`).
Live specs are gated: `ANTHROPIC_SECRET` or `OPENAI_SECRET` (analysis), `LLM_READER_LIVE_WEB=1`
(the public web), `LLM_READER_PROXIES` (real proxies) in the repo root `.env`.

## Depends On

- `@owlmeans/llm`, `@owlmeans/agent`, `@owlmeans/llm-common`, `@owlmeans/context`, `@owlmeans/error`, `@owlmeans/log`
- `defuddle`, `linkedom`, `turndown`, `css-tree`, `culori`, `socks`, `undici`, `ajv`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.2
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
