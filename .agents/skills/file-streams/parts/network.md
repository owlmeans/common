---
name: network
description: What the HTTP client may reach — the connect-time network policy, redirects and sensitive headers, the HTTP and SOCKS proxy plugins and their pinning, why the client is node:http over its own socket under Bun, and the Google Drive and Docs resolver.
metadata:
  purposes: config, ops
  mentions: createNetworkPolicy, allowCidrs, allowPrivate, createProxyRouter, createHttpProxyPlugin, createSocksProxyPlugin, trustProxyDns, createGoogleDriveResolver, googleDriveResolver, ResolverError, NetworkPolicyError
---

# @owlmeans/file-streams — Network policy, proxies and Google Drive

## Network policy and proxies

- Loopback, private, link-local, CGNAT, multicast, reserved and documentation ranges are refused,
  and the IPv4 inside a mapped, NAT64, 6to4 or Teredo address is checked too; internal names
  (`localhost`, `.local`, `.internal`, `.svc`, `.cluster.local`, `.home.arpa`) are refused before DNS.
- The check is pinned to the connect: a direct socket goes to the address just resolved and
  checked, a proxy tunnel carries that address (TLS keeps the host name for SNI and certificates).
  Every redirect hop is checked again; https → http is refused; `Authorization`, `Cookie`,
  `Proxy-Authorization` and `sensitiveHeaders` never cross origins.
- A local stand-in or an in-cluster origin needs `network: { allowCidrs: [...] }` (or
  `allowPrivate`). S3 traffic through the SDK is not policed — its endpoint is operator config.
- Built-in plugins: `http`/`https` endpoints (CONNECT for https targets, absolute-form forward for
  plain http — which a proxy resolves itself, so pinning holds only through CONNECT:
  `createHttpProxyPlugin({ httpTargets: 'connect' })`), and `socks4`/`socks4a`/`socks5`/`socks5h`.
  Remote-DNS endpoints (`socks5h`, `socks4a`) still pre-check the name locally and are refused when
  it does not resolve unless `trustProxyDns`.
- Bun's own `fetch({ proxy })` speaks only http/https proxies and undici dispatchers are unreliable
  under Bun, so the client is `node:http(s)` over a socket it connects itself — Bun 1.4.2 honours
  the `createConnection` option, an Agent's `createConnection`, the `lookup` option and TLS over an
  existing socket.

## Google Drive

Share links (`/file/d/<id>/…`, `open?id=`, `uc?id=`) become `drive.usercontent.google.com/download`;
the "can't scan this file for viruses" page is followed through its own `download-form` (action must
be a Google origin; hidden `confirm`/`uuid` carried), then the legacy `confirm=` link, then a
`download_warning` cookie. Docs, Sheets, Slides and Drawings links become export URLs (docx, xlsx,
pptx, png by default; csv/tsv keep the `gid`). Folders, quota pages, sign-in redirects and forms
posting elsewhere fail as `ResolverError('google-drive:<reason>')`. The page flow is the one gdown
documents; it is reverse-engineered, so `FILE_STREAMS_LIVE_DRIVE_URL` exercises it against Google.

## External docs

- https://bun.com/docs/runtime/networking/fetch — Bun `fetch({ proxy })` accepts http/https proxy URLs only (no SOCKS) (Bun 1.4)
- https://undici.nodejs.org/api/Socks5ProxyAgent — undici's SOCKS5 agent is experimental; dispatchers are not relied on under Bun
- https://docs.rs/modde-sources/latest/src/modde_sources/gdrive/mod.rs.html — the usercontent download host and the virus-scan form flow (`confirm`, `uuid`) public Drive downloads take; no official Google documentation exists for it
