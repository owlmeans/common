---
node: oidc
scope: "packages/server-oidc-provider/**, packages/server-oidc-rp/**, packages/web-oidc-rp/**, packages/mui-oidc-rp/**, packages/oidc/**"
updated: 2026-08
---

# OIDC (third-party pins + isolation)

Upgrades consult the `oidc-versions` skill. Viable-side usage: [[auth]].

## Facts

- Exact pins (deliberate-bump policy): `oidc-provider` 9.11.1 (server-oidc-provider); `jose` 6.2.5
  (server-oidc-provider, server-oidc-rp); `openid-client` 6.8.4 (server-oidc-rp);
  `oidc-client-ts` 3.5.0 (web-oidc-rp, mui-oidc-rp); `@types/oidc-provider` 9.5.0 (dev).

## Invariants

- Isolation principle: no upstream OIDC library type appears in any `@owlmeans/*` public export —
  all public contracts use OwlMeans-owned types; the boundary lives in each package's
  `src/service.ts` (canonical example: `packages/server-oidc-rp/src/types.ts`). New OIDC service
  methods must be typed with OwlMeans-owned interfaces, never raw `Configuration` /
  `TokenEndpointResponse`.
- After any common OIDC change, verify downstream (`viable`, `viable-agent`, `internal`):
  `bun install && build && test`; check their root `overrides` for stale third-party pins.

## Gotchas

- oidc-provider v9: `oidc.use()` post-`next()` no longer runs after a matched route — CSP header
  rewrites and debug logging must live at the Fastify layer (`onSend` scoped to the OIDC base
  path).
- jose v6: `importPKCS8` returns a non-extractable `CryptoKey` by default — always
  `jose.importPKCS8(pem, alg, { extractable: true })` or `exportJWK` throws.
