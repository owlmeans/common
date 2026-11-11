---
name: fetching
description: Fetching pages through the reader's fetcher — the integrated proxy plugin (list, key→proxy callback, strategies, cooldown, failover), the local SOCKS bridge, the Bun and Node transports, NO_PROXY fail-closed, the address guard, and local bundles served under a synthetic origin.
metadata:
  purposes: server-api, config
  mentions: createPageFetcher, createProxyPlugin, createLocalBundlePlugin, LocalBundle, LocalBundlePlugin, DEFAULT_BUNDLE_ORIGIN, ProxyResolver, ProxyLease, ProxyStrategy, createSocksBridge, createFetchTransport, createAddressGuard, BRIDGE_ERROR_HEADER, BRIDGE_REFUSED_HEADER, NO_PROXY, ReaderProxyError, ReaderRefusedError
---

# @owlmeans/llm-reader — Fetching and proxies

## The fetcher

`createPageFetcher({ plugins, userAgent, timeout, maxBytes, maxRedirects, acceptStatus,
allowPrivateNetwork, allowHosts, transport?, guard? })`. Plugins wrap the whole fetch, outermost
first, so a page keeps one proxy across its redirects; the terminal step follows redirects itself
(guarding each hop), caps the body while streaming (10 MB page, 2 MB stylesheet, 8 MB image), and
decodes it by the declared charset, a `<meta charset>`/BOM sniff, or UTF-8 — legacy encodings
(windows-1251, shift_jis, gbk) decode on both runtimes. A page purpose refuses binary content
(`ReaderContentError`); any status comes back unless `acceptStatus` says otherwise — a 404 page is
still a page. The default user agent names the package honestly.

## The proxy plugin

```ts
createProxyPlugin({
  proxies: ['socks5h://user:pass@host:1080', 'http://user:pass@host:3128', 'host:8000:user:pass'],
  resolve: async (key, { url, host, attempt, failed }) => key.startsWith('eu-') ? euProxyFor(key) : undefined,
  strategy: ProxyStrategy.Sticky,     // RoundRobin (default) | Random | Sticky
  attempts: 3, cooldown: 60_000, rotateOn: [407, 429, 502, 503],
  onOutcome: (proxyId, outcome, key) => pool.report(proxyId, outcome),
})
```

- `resolve(key, info)` runs first for every request: a `ProxySpec` or URL (credentials included) is
  used, `'direct'` sends it without a proxy, `undefined` defers to the list. The key is the caller's
  (`fetch/read(url, { key })` — a tenant, a session) or the target host; `info.failed` names the proxy
  that just failed on a retry.
- Strategies pick among proxies not cooling down; `Sticky` is rendezvous hashing, so a key keeps its
  proxy while that proxy is healthy.
- A proxy failure — refused or dropped connection, a 407, a bridge-marked answer, a `rotateOn`
  status — cools the proxy down and retries on another, up to `attempts`. When every exit answered a
  `rotateOn` status the last page comes back (the target said so); a proxy that never carried the
  request surfaces as `ReaderProxyError` with the masked id (`socks5://user:***@host:1080`).
- `lease(request)` gives anything else (a browser) the proxy and an HTTP endpoint to reach it:
  `endpoint()` is the upstream itself for an HTTP(S) proxy, the bridge for SOCKS. Leases are cached
  per proxy and key.

## Transports

| Runtime | HTTP(S) proxy | SOCKS proxy |
|---|---|---|
| Bun (`process.versions.bun`) | native `fetch({ proxy })`, `keepalive: false` for bridged plain HTTP (Bun reuses a plain-HTTP proxy connection across credentials, and the bridge routes by credentials) | the bridge |
| Node | npm `undici` (lazy import — Bun shadows `undici` with its own shim) `ProxyAgent` + `undici.fetch`; `proxyTunnel: true` toward the bridge only — an upstream keeps absolute-form for plain HTTP | the bridge |

- **`NO_PROXY` fails closed.** Bun reads `NO_PROXY` once at startup and then sends a matching request
  DIRECT even when an explicit `proxy` is given — a silent leak of the server's own address. The
  transport matches the startup value and the live one, and refuses such a request with
  `ReaderProxyError('no-proxy-bypass:…')`.
- On Bun a 407 or 502 answer to CONNECT resolves as an ordinary `Response`; the fetcher reads it as a
  proxy failure (407, or the bridge's `x-owlmeans-proxy-error` header), never as the page.

## Local bundles

`createLocalBundlePlugin({ root, origin = 'https://bundle.local' })` serves a directory — an
uploaded `home.html` with its css and pictures — under a synthetic origin, so every reader task
works on it unchanged: `reader.page(bundle.urlOf('home.html'))`, `describe`, `extract`, `images`,
`design`. Put it FIRST in `plugins`: a request under its origin is answered from disk (no proxy,
no DNS, no guard — the origin is never resolved), every other one goes on down the chain to the
proxy plugin, the address guard and the network, so a prototype's external fonts or pictures are
still guarded.

- **Confined to the root.** `urlOf(path)` refuses an absolute path, a drive letter and `..`; `read`
  refuses a decoded segment that is `.`/`..` or holds `/`, `\` or NUL (the URL parser already folds a
  plain `..` back inside); a symbolic link is followed only while its real path stays under the
  root's real path — `ReaderRefusedError('bundle-escape:…')` otherwise.
- **Answered like the network.** A content type by extension (`BUNDLE_CONTENT_TYPES`, else
  `application/octet-stream`), text decoded by `<meta charset>`/BOM sniff or UTF-8, the same byte
  caps and the same refusals (a picture as a page, a page as a picture); a missing file is a 404
  page, a directory answers with its `index.html`.
- **Rendered pages.** For a bundle URL `reader.page(url, { render: true })` and `design` skip the
  lease and the guard check of the page itself and hand the renderer `RenderRequest.bundle`;
  `@owlmeans/llm-reader-playwright` routes the origin to the bundle (`page.route`) while every
  other request of the page still goes through the guard.

## The SOCKS bridge

One `node:net` listener on 127.0.0.1, unref'd, started on first SOCKS use. Each SOCKS upstream gets
a route with random credentials; a client is routed by the `Proxy-Authorization` it presents
(compared in constant time) and challenged with a 407 when it presents none — which is what makes
Chromium send them. It serves CONNECT tunnels and absolute-form GETs (one request per connection,
`Connection: close`; a request with a body is refused). Upstreams connect with the `socks` package:
`socks4` / `socks5` resolve the target here and the guard checks the address dialled, `socks4a` /
`socks5h` hand the name to the proxy. Its own failures answer 502 with `x-owlmeans-proxy-error`
(a proxy failure), a guard refusal 403 with `x-owlmeans-refused` (a `ReaderRefusedError`).

## External docs

- https://bun.com/docs/guides/http/proxy — `fetch({ proxy })` takes http/https proxies with credentials (object form with proxy headers since 1.3.4); no SOCKS. Probed on 1.4.2: `socks*` proxies are rejected, a 407/502 answer to CONNECT resolves as a Response, `NO_PROXY` read at startup bypasses an explicit proxy (2026-11)
- https://undici.nodejs.org/api/ProxyAgent — `ProxyAgent({ uri, headers, proxyTunnel })`, credentials from the URI; use it with the same package's `fetch` (2026-11)
- https://github.com/JoshGlazebrook/socks — `SocksClient.createConnection` for SOCKS4/4a/5 CONNECT with user/password (2026-11)
