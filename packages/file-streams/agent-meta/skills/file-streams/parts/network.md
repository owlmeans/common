---
name: network
description: What the HTTP client may reach — the connect-time network policy, redirects (followed or returned) and sensitive headers, the pinned WHATWG fetch on the ./fetch subpath, the proxy router and the HTTP and SOCKS proxy plugins and their pinning, why the client is node:http over its own socket under Bun, and the Google Drive and Docs resolver.
metadata:
  purposes: config, ops
  mentions: createPinnedFetch, PinnedFetch, PinnedFetchOptions, HttpRedirectMode, anyStatus, createNetworkPolicy, allowCidrs, allowPrivate, createProxyRouter, createHttpProxyPlugin, createSocksProxyPlugin, parseProxyEndpoint, trustProxyDns, createGoogleDriveResolver, googleDriveResolver, ResolverError, NetworkPolicyError
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/file-streams — Network policy, proxies and Google Drive

## Network policy

- Before any DNS, `assertUrl` checks the scheme (`schemes`, default `https:`/`http:`), credentials
  in the URL (`allowUrlCredentials`), `allowHosts`/`denyHosts` (`x.com`, `*.x.com`), `ports` and an
  https → http hop (`allowDowngrade`).
- Loopback, private, link-local, CGNAT, benchmarking, multicast, reserved and documentation ranges
  are refused, and the IPv4 inside a mapped, NAT64, 6to4, Teredo or IPv4-compatible address is
  checked too; internal names (`localhost`, `.localhost`, `.local`, `.internal`, `.svc`,
  `.cluster.local`, `.home.arpa`, `.lan`, `.intranet`) are refused before DNS unless `allowPrivate`
  or an `allowHosts` pattern names them. Every resolved address must pass — one refused address
  refuses the name (`blocked-address`). `allowCidrs` wins over `denyCidrs`, which wins over
  `allowPrivate`. A custom `resolver` (DoH, split horizon, a test seam) must answer every address.
- The check is pinned to the connect: a direct socket goes to an address just resolved and checked
  (each in turn until one connects), a proxy tunnel carries that address (TLS keeps the host name
  for SNI and certificates, TLS 1.2+, extra `ca` only — verification is never off). Every redirect
  hop is checked again; https → http is refused; `Authorization`, `Cookie`, `Proxy-Authorization`
  and `sensitiveHeaders` never cross origins.
- `redirect: 'manual'` returns a 3xx with its `Location` (and body) instead of following it — for a
  caller that checks every hop itself; a resolver's own flow (Drive's virus-scan page and its hops)
  still follows inside the client under the policy, because it carries its cookie across them.
  `anyStatus: true` returns every status instead of `HttpError('status:<code>')`; a forward proxy's
  407 still throws `ProxyError('auth-failed')`. `HttpResponse.decoded` says the body was
  transport-decoded and its `Content-Length` no longer applies; a gzip file is never decoded.
- A local stand-in or an in-cluster origin needs `network: { allowCidrs: [...] }` (or
  `allowPrivate`). S3 traffic through the SDK is not policed — its endpoint is operator config.
- Bun's own `fetch({ proxy })` speaks only http/https proxies and undici dispatchers are unreliable
  under Bun, so the client is `node:http(s)` over a socket it connects itself — Bun 1.4.2 honours
  the `createConnection` option, an Agent's `createConnection`, the `lookup` option and TLS over an
  existing socket.

## Proxies

- `createProxyRouter({ proxies, credentials?, strategy?, bypass?, plugins?, retries?, cooldownMs? })`
  — or the same object as `createHttpClient({ proxies })`. `proxies` is a list of endpoints or URLs
  (`parseProxyEndpoint` reads `socks5h://user:pass@host:1080`; default ports 8080/443/1080) or a
  provider `({ key, url }) => endpoint | url | null` (null goes direct). `credentials(endpoint,
  request)` fills an endpoint that carries none. A request's `proxyKey` is the key.
- Strategies: `round-robin` (default), `random`, `failover` (the first warm one), `by-key` (a key
  hashes to one proxy; without a key, round-robin). A failed connect cools the proxy down
  (`cooldownMs`, 30 s) and tries another (`retries`, 1); when every proxy is cooling, all are used.
  `bypass` hosts go direct.
- Built-in plugins: `http`/`https` endpoints (CONNECT for https targets, absolute-form forward for
  plain http — which a proxy resolves itself, so pinning holds only through CONNECT:
  `createHttpProxyPlugin({ httpTargets: 'connect' })`), and `socks4`/`socks4a`/`socks5`/`socks5h`.
  Custom `plugins` are tried first; an unknown type is `ProxyError('no-plugin')`.
- Remote-DNS endpoints (`socks5h`, `socks4a`, or a plugin built with `remoteDns: true`) receive the
  name, not the checked address, so the proxy resolves it again: they still pre-check the name
  locally and are refused when it does not resolve unless `trustProxyDns`.
- Proxy credentials never reach the log: an endpoint is logged as its `id` or `<type>://host:port`.

## The pinned fetch

`createPinnedFetch` (on `@owlmeans/file-streams/fetch`) is `fetch` over this client: it asks with
`redirect: 'manual'` (unless the caller follows) and `anyStatus`, so the caller sees what a browser's
fetch would, while every connection — every redirect hop the caller takes, every resolver step —
goes to an address the policy resolved and checked a moment before. That closes the DNS-rebinding
window a guard-then-`fetch` pair leaves open: llm-reader injects it as its transport and hands it to
the Playwright renderer, which fulfils a page's sub-requests through it. Its module graph carries no
AWS SDK, so a consumer that only reads the web does not load one (`tests/fetch.spec.ts` walks the
built graph).

- `createPinnedFetch({ network, proxies, resolvers, timeouts, userAgent, headers, client? })` — the
  client's options, or a ready `client`. Any status is a `Response` with `url` and `redirected` set;
  `redirect: 'manual'` returns the 3xx, `'error'` rejects `HttpError('redirect')`; an abort ends a
  request waiting for its head and a body in flight.
- Only GET and HEAD (another method, or a body, rejects `HttpError('method:…' | 'body')`);
  `Accept-Encoding` is always identity, hop-by-hop, `host` and `content-length` request headers are
  dropped; a transport-decoded body loses its `Content-Encoding`/`Content-Length`; a 204/205/304
  answer has a null body.
- A policy refusal rejects with `NetworkPolicyError`, whose `refused === true` tells a consumer
  (llm-reader maps it to `ReaderRefusedError('pinned:…')`) a refusal from a network failure.

## Google Drive

Share links (`/file/d/<id>/…`, `open?id=`, `uc?id=`, `resourcekey` kept) become
`drive.usercontent.google.com/download`; the "can't scan this file for viruses" page is followed
through its own `download-form` (the action must be one of the resolver's Google origins; every
hidden input carried), then the legacy `confirm=` link, then a `download_warning` cookie — at most
3 steps, 256 KiB of a page read. Docs, Sheets, Slides and Drawings links become export URLs (docx,
xlsx, pptx, png by default, `exports` changes them; csv/tsv keep the `gid`). Folders, quota pages,
sign-in redirects and forms posting elsewhere fail as `ResolverError('google-drive:<reason>')`
(`folder`, `quota`, `not-public`, `foreign-form`, `export-too-large`, `unrecognized`). A range
request resolves first, then asks the bytes' own URL for the range; `raw: true` skips resolvers. The
page flow is the one gdown documents; it is reverse-engineered, so `FILE_STREAMS_LIVE_DRIVE_URL`
exercises it against Google.

## External docs

- https://bun.com/docs/runtime/networking/fetch — Bun `fetch({ proxy })` accepts http/https proxy URLs only (no SOCKS) (Bun 1.4)
- https://undici.nodejs.org/api/Socks5ProxyAgent — undici's SOCKS5 agent is experimental; dispatchers are not relied on under Bun
- https://docs.rs/modde-sources/latest/src/modde_sources/gdrive/mod.rs.html — the usercontent download host and the virus-scan form flow (`confirm`, `uuid`) public Drive downloads take; no official Google documentation exists for it
