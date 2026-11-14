---
name: testing
description: The reader's specs — real local servers (fixture site, collect site with a font CDN, S3 stand-in, HTTP proxy, SOCKS server), offline fetch/proxy/bridge/page/image/design/collect/S3/crawl/pinned specs, the Node-runtime spec, and the gated live analysis, public-web, S3 and real-proxy specs.
metadata:
  purposes: test
  mentions: ANTHROPIC_SECRET, OPENAI_SECRET, LLM_READER_LIVE_WEB, LLM_READER_LIVE_S3, LLM_READER_PROXIES, collect.spec.ts, s3.spec.ts, crawl.spec.ts, pinned.spec.ts, servers.ts, context.ts, bundle.spec.ts, node-transport.spec.ts, analyst.live.spec.ts, web.live.spec.ts, proxy.live.spec.ts
---

# @owlmeans/llm-reader — Tests

`bun test ./tests` in the package (category C: live providers and the public web are gated). Build
first — `node-transport.spec.ts` runs the built package.

- `tests/servers.ts` starts REAL servers, not mocks: the fixture site on 127.0.0.1 (an article, a
  landing page, a topic index, an app shell, a stylesheet, redirects, charset and limit cases, every
  image a generated solid-blue PNG), an HTTP forward proxy (CONNECT and absolute-form, Basic auth with
  a 407 challenge, hit log) and a SOCKS4/4a/5 server (user/password, hit log); `startCollectSite(cdn)`
  (a page with an `@import` cycle, CSS fonts and pictures, every picture reference, scripts and
  handlers to strip, `Content-Disposition` files, a streamed file, an app shell, crawl pages and a
  robots.txt with an `OwlMeansReader` group), `startCdn(host?)` (a Google-Fonts-like cross-origin
  stylesheet with `@import` and `@font-face`; on `127.0.0.2` it is a host the pinned fetch refuses
  while the guard allows it) and `startS3({ markers? })` (path-style ListObjectsV2 two keys a page,
  object GET, NoSuchKey/AccessDenied documents, a `locked` bucket; `markers: false` drops every
  `x-amz-*` header, as a CDN in front does). Specs allow `127.0.0.1` through the address guard
  explicitly.
- Offline: `fetch.spec` (redirects, charset, limits, the guard), `proxy.spec` (credentials,
  strategies, the key callback, failover and cooldown, masking, leases), `bridge.spec` (every SOCKS
  variant, absolute-form, the 407 challenge, marked failures), `page.spec` and `images.spec` (metadata
  evidence, content method, signals, links, the DOM index, every picture-context case), `design.spec`
  (facts from the fixture stylesheet; `renderDesignMd` checked by the official linter), `modes.spec`
  (a bare-model reader reads in text mode; explicit DOM mode without an execution is refused),
  `bundle.spec` (the `tests/fixtures/bundle` prototype — content types, the directory index, a 404,
  the network's refusals, traversal and encoded separators, symbolic links inside and outside a
  temporary root, non-bundle URLs through the guard, its page model and its design facts and blocks
  with no model), `collect.spec` (the bundle's files, rewriting, stripping, manifest, every limit
  skipped not thrown, mid-stream caps leaving nothing, `Content-Disposition` names, a prefix,
  `bundle()` of HTML in hand, offline reading of a collected bundle with its servers stopped),
  `s3.spec` (every URL style parsed, `s3://` prefixes across pages, generic endpoints recognised by
  headers and by XML alone, objects, children of a key, a refused listing, the file cut, presigned
  URLs), `crawl.spec` (robots precedence, depth/page caps, dedupe, keyword ranking, pacing),
  `pinned.spec` (file-streams' real pinned fetch, imported by relative path: every request through
  it, a guard-allowed host refused at connect, a rebound name refused, S3 through it, no proxy lease).
- `node-transport.spec` spawns real Node (skipped when `node` is Bun's shim or `build/` is missing)
  and proves the undici path and the bridge there.
- Gated: `analyst.live.spec` (gates `anthropic` or `openai` — Anthropic `claude-haiku-5-5` when its
  key is set; both live configs declare `vision: true`, so pictures are read), in DOM mode unless a test asks for text: describe, classify of
  all four fixtures, author and date (text mode, and DOM mode by default), links by intent, image roles
  and a vision caption, a linted DESIGN.md.
  `web.live.spec` (`LLM_READER_LIVE_WEB=1`): a public page direct, HTTPS through the HTTP proxy and
  through SOCKS (`socks5h` and `socks5`), a real article described, and a real Wikipedia page
  collected as a bundle. `s3.spec`'s live test
  (`LLM_READER_LIVE_S3=1`): the public fixture bucket `https://s3-stage.owlmeans.link/vib-common-2-e2e-links`
  (RustFS behind Cloudflare, path-style) — an object, the `public/crmore/` folder link, the listing
  link, and the 403 of the bucket root. `proxy.live.spec`
  (`LLM_READER_PROXIES`): every listed real proxy carries an HTTPS request.
- Every test states its own timeout.
