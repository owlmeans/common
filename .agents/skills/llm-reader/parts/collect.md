---
name: collect
description: Cloning what a link points at into local files — collect (page bundles with bundle.json, streamed files, ReaderSource expansion), the CollectSink port and its limits, the built-in public S3 source, the seam a link-expanding plugin (a Drive folder) implements, offline reading of a collected bundle, and the bounded crawl.
metadata:
  purposes: data, agent
  mentions: collect, createCollector, Collector, CollectSink, createDirectoryCollectSink, CollectOptions, CollectLimits, DEFAULT_COLLECT_LIMITS, CollectResult, CollectItem, CollectKind, CollectRole, CollectStatus, BundleManifest, BUNDLE_MANIFEST, BUNDLE_EXTERNAL_DIR, ReaderSource, ReaderSourceContext, SourceEntry, SourceAnswer, createS3Source, createS3UrlHelper, S3SourceOptions, S3Location, crawl, makeCrawler, CrawlOptions, CrawlResult, ReaderLimitError, ROBOTS_AGENT
---

# @owlmeans/llm-reader — Collect and crawl

## Collect

`reader.collect(url, { sink, limits?, prefix?, key?, signal?, render?, timeout? })` (or
`createCollector({ fetcher, render?, sources?, limits? }).collect`) turns ONE link into files on a
`CollectSink`, as if the person had uploaded them. What the link is decides what it becomes
(`CollectResult.kind`):

| The link | Becomes |
|---|---|
| a URL a `ReaderSource` `matches` (before any request), or whose answer it `recognizes` | `source` — every `SourceEntry` downloaded like a file, at the entry's own relative path |
| an HTML answer (`text/html`, `application/xhtml+xml`, or an untyped body starting with `<html`) | `bundle` — the page with what it loads, rewritten, plus `bundle.json` |
| anything else | `file` — streamed as served, named by `Content-Disposition` (`filename*` first; only its last path part), else the URL, else `download.<ext>` |

- **Every request goes through the reader's fetcher**: its plugins, the address guard on every hop
  and the transport — the injected pinned `fetch` when there is one (the `fetching` part). Files use
  `FetchRequest.stream: true`: the body is never held whole; only pages and stylesheets are read
  into memory.
- **Limits** (`DEFAULT_COLLECT_LIMITS`): `maxFiles` 100 (the manifest excluded), `maxFileBytes`
  12 MiB, `maxTotalBytes` 100 MiB, `maxAssets` 150 and `maxAssetBytes` 30 MiB per page. A file is
  admitted against the count and its declared size before it is fetched; a stream that runs past a
  cap errors with `ReaderLimitError` and the sink must drop it. Over-limit items are `skipped` with
  the limit as `reason` — never thrown. `collect` throws only for an abort or a bad `prefix`; a
  refused or failing link is a result whose one item says so (`refused` / `failed`, `status-404`).
- **Paths** are relative POSIX, every segment made storable (control, bidi and `<>:"|?*\` become
  `_`, 120 chars, its extension kept), `..` and absolute paths impossible; remote names are kept
  otherwise. `prefix` (`links/01-site`) is put in front of every path, item and manifest entry.
- `CollectResult`: `{ url, finalUrl, kind, source?, entry?, manifest?, items, files, bytes }`;
  every `CollectItem` is `{ url, role, status, path?, bytes?, mime?, reason? }`.

## The sink

`CollectSink.write(path, stream: ReadableStream<Uint8Array>, { url, role, mime?, size?, name? }) →
{ bytes }` — store one file and resolve when it is fully written; a stream that errors must leave
nothing behind. `createDirectoryCollectSink(root)` writes beside the target and renames into place,
refusing a path (or a linked directory) that would leave the root. A consumer's sink can pipe into
an upload intake (`Readable.fromWeb(stream)` for file-streams/server-upload).

## Page bundles

- The page HTML — for an app shell (and under `render: true`) with a renderer, the rendered DOM
  snapshot (`RenderRequest.snapshot`: CSSOM-only rules written into `<style>`). The page's own
  `<base href>` decides how its references resolve, then is removed.
- **Removed**: `<script>`, `on*` attributes, `srcdoc`, `javascript:`/`vbscript:` URLs (control
  characters and whitespace ignored, as browsers do), `data:` documents in frames, `<base>`, meta
  refresh / CSP / content-type, `modulepreload` and script preloads. `<meta charset="utf-8">` is
  declared — the output is UTF-8 whatever the page was.
- **Kept and rewritten** to relative local paths: `link rel=stylesheet` (and `preload as=style|font|image`),
  icons, `img src/srcset/data-src/data-srcset`, `picture > source`, `video poster`, `input type=image`,
  SVG `image href`, `url()`s of `<style>` and `style=""`; stylesheets with their `@import` chains
  (4 deep; cycles allowed) and every `url()` (fonts, pictures). Same-origin files keep their URL path
  (`/` → `index.html`, `/pricing` → `pricing.html`); cross-origin ones go under
  `external/<host[_port]>/<path>`; a query becomes an 8-hex hash in the name (`css2-1a2b3c4d.css`);
  a missing extension comes from the answer's type. Links, form actions, frames and media become
  absolute. What was not kept stays an absolute URL; an asset answered as HTML or a script is not kept.
- **`bundle.json`** (`BundleManifest`, version 1): `url`, `finalUrl`, `entry`, `rendered`,
  `collectedAt`, `files` (every written file's absolute URL → path relative to the manifest, the
  page under both its URLs) and `skipped` (`{ url, status, reason }`). `collector.bundle({ url, html,
  entry? }, options)` bundles HTML already in hand (an uploaded `index.html` whose fonts live on a CDN).
- **Offline**: `createLocalBundlePlugin({ root })` on a root holding `bundle.json` also answers the
  manifest's URLs and any path under the collected page's own origin that exists in the root — so
  `reader.page(originalUrl)`, its stylesheets and its external fonts read from disk, and the
  Playwright renderer renders it with no live request for them.

## Sources

```ts
interface ReaderSource {
  readonly name: string
  matches: (url: string) => boolean                                  // from the URL alone
  recognizes?: (answer: SourceAnswer) => Promise<boolean>            // from the link's answer: { url, finalUrl, status, headers, contentType, peek(maxBytes = 4096) }
  expand: (url: string, context: ReaderSourceContext) => Promise<SourceEntry[]>   // throw when it cannot
}
// context: { fetch(url, { headers?, signal?, maxBytes? = 8 MiB }) → Response (guarded, any status, body unread), limits, key?, signal? }
// SourceEntry: { path, url, name?, size?, mime? } — path relative POSIX, kept as the source names it
```

`LlmReaderOptions.sources` are consulted in order before the built-in S3 source (`s3: false` drops
it, `s3: S3SourceOptions` configures it). A source lists; the collector downloads each entry through
the same fetcher. Google Drive links are the connect source `@owlmeans/llm-reader-google-drive`
(folders listed keyless, files turned into direct downloads); a pinned fetch handed to such a reader
must be built with `createPinnedFetch({ resolvers: [] })` — file-streams' own Drive resolver would
rewrite the folder view and break the listing. The collector
admits it by `size`, and reports an entry path that could leave the folder as `refused`
(`unsafe-path`). Return at most `limits.maxFiles + 1` entries so the cut is reported.

## The S3 source

`createS3Source({ endpoint?, pathStyle?, endpoints?, pageSize?, maxPages? })` — anonymous GET and
ListObjectsV2 only, never an AWS SDK. `createS3UrlHelper` reads `s3://bucket/key` (AWS by default,
virtual-hosted; path-style for dotted buckets; `endpoint` for another store), AWS virtual-hosted
`bucket.s3[.-]region.amazonaws.com/key` (dualstack, legacy `s3-region`), AWS path-style
`s3[.-]region.amazonaws.com/bucket/key`, listing links (`?list-type=2&prefix=…` — the prefix is the
key) and the configured `endpoints` (path-style). Website endpoints and presigned URLs
(`X-Amz-Signature`, `Signature`) are not S3 links — a presigned one is a plain file.

- Any other S3-compatible endpoint is **recognised from its answer**: a 200 `ListBucketResult`, or —
  for a folder-shaped link (trailing `/`, a listing query) — a 403/404 S3 `<Error>` document or
  `x-amz-*`/`x-minio-*`/`x-rustfs-*` headers. Never by `Server` (a CDN in front answers `cloudflare`);
  a 200 object is never claimed.
- A key ending in `/`, an empty key or a listing link is a prefix: every page of ListObjectsV2
  (continuation tokens, `maxPages` 50), folder markers skipped, paths relative to the prefix's
  folder. Any other key is an object — unless listing `key/` returns children; a refused listing of
  an object's prefix still downloads the object. A refused prefix listing fails the link:
  `llm-reader:fetch:s3:listing-403:AccessDenied`.
- XML is read by pattern over the fixed S3 schema with the five predefined entities — no parser, no
  entity expansion.

## Crawl

`reader.crawl(url, { intent?, maxPages = 10, depth = 2, sameOrigin = true, linksPerPage = 20,
concurrency = 2, delay = 500, robots = true, describe?, key?, signal?, render? })` →
`{ url, pages: CrawledPage[] ({ url, depth, from?, page, description? }), skipped: { url, reason }[] }`.
Breadth-first, level by level, through `reader.page` (and `describe` on request). URLs are
normalized (no fragment, credentials or `utm_*`/`fbclid`/`gclid`…), read once (a redirect onto a
read page is a `duplicate`); asset URLs, other origins and non-2xx pages are skipped.

- **robots.txt** (RFC 9309), fetched once per origin through the fetcher: the group whose
  user-agent the token `OwlMeansReader` (`ROBOTS_AGENT`) contains — longest wins, `*` only when
  none does — longest matching rule, Allow on a tie, `*` and `$` patterns; 4xx or binary allows
  everything, 5xx or unreachable disallows everything; `Crawl-delay` up to 10 s raises `delay`.
- **Pacing**: at least `delay` ms between two requests to one host.
- **Which links**: with an intent and models, the model's `links({ intent })` pick; otherwise a
  keyword ranking (intent words in link text and path, content/nav links first, login/legal/tag
  pages and pagination last).
