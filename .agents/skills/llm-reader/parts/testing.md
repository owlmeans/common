---
name: testing
description: The reader's specs — real local servers (fixture site, HTTP proxy, SOCKS server), offline fetch/proxy/bridge/page/image/design specs, the Node-runtime spec, and the gated live analysis, public-web and real-proxy specs.
metadata:
  purposes: test
  mentions: ANTHROPIC_SECRET, OPENAI_SECRET, LLM_READER_LIVE_WEB, LLM_READER_PROXIES, servers.ts, context.ts, node-transport.spec.ts, analyst.live.spec.ts, web.live.spec.ts, proxy.live.spec.ts
---

# @owlmeans/llm-reader — Tests

`bun test ./tests` in the package (category C: live providers and the public web are gated). Build
first — `node-transport.spec.ts` runs the built package.

- `tests/servers.ts` starts REAL servers, not mocks: the fixture site on 127.0.0.1 (an article, a
  landing page, a topic index, an app shell, a stylesheet, redirects, charset and limit cases, every
  image a generated solid-blue PNG), an HTTP forward proxy (CONNECT and absolute-form, Basic auth with
  a 407 challenge, hit log) and a SOCKS4/4a/5 server (user/password, hit log). Specs allow
  `127.0.0.1` through the address guard explicitly.
- Offline: `fetch.spec` (redirects, charset, limits, the guard), `proxy.spec` (credentials,
  strategies, the key callback, failover and cooldown, masking, leases), `bridge.spec` (every SOCKS
  variant, absolute-form, the 407 challenge, marked failures), `page.spec` and `images.spec` (metadata
  evidence, content method, signals, links, the DOM index, every picture-context case), `design.spec`
  (facts from the fixture stylesheet; `renderDesignMd` checked by the official linter), `modes.spec`
  (a bare-model reader reads in text mode; explicit DOM mode without an execution is refused).
- `node-transport.spec` spawns real Node (skipped when `node` is Bun's shim or `build/` is missing)
  and proves the undici path and the bridge there.
- Gated: `analyst.live.spec` (gates `anthropic` or `openai` — Anthropic `claude-haiku-5-5` when its
  key is set, it also reads pictures), in DOM mode unless a test asks for text: describe, classify of
  all four fixtures, author and date (text mode, and DOM mode by default), links by intent, image roles
  and a vision caption, a linted DESIGN.md.
  `web.live.spec` (`LLM_READER_LIVE_WEB=1`): a public page direct, HTTPS through the HTTP proxy and
  through SOCKS (`socks5h` and `socks5`), and a real article described. `proxy.live.spec`
  (`LLM_READER_PROXIES`): every listed real proxy carries an HTTPS request.
- Every test states its own timeout.
