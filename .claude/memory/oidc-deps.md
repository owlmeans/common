---
name: oidc-deps
description: Pinned versions of OIDC/OAuth third-party libraries, isolation principle, two critical gotchas, and the fact that downstream repos symlink common packages.
metadata:
  type: project
---

All four OIDC/OAuth dependencies are pinned to **exact versions** (project policy decided 2026-06-04):

| Library | Owning package(s) | Exact pin |
|---------|------------------|-----------|
| `oidc-provider` | `@owlmeans/server-oidc-provider` | `9.8.4` |
| `jose` | `server-oidc-provider`, `server-oidc-rp` | `6.2.3` |
| `openid-client` | `@owlmeans/server-oidc-rp` | `6.8.4` |
| `oidc-client-ts` | `web-oidc-rp`, `mui-oidc-rp` | `3.5.0` |
| `@types/oidc-provider` | server-oidc-provider (dev) | `9.5.0` |

**Why:** migrated from v8.5.2 / v5.9.6 to fix incompatible old majors. Exact pins because every bump should be deliberate — future upgrades consult the [[oidc-versions]] skill.

## Two critical gotchas (from the v8→v9 + v5→v6 migration)

1. **oidc-provider v9: `oidc.use()` post-`next()` no longer runs after a matched route.** CSP header rewrites and debug logging must live at the Fastify layer (`onSend` hook scoped to the OIDC base path), not inside `oidc.use()`.
2. **jose v6: `importPKCS8` returns a non-extractable `CryptoKey` by default.** Must pass `{ extractable: true }` or `exportJWK` throws. Always use: `jose.importPKCS8(pem, alg, { extractable: true })`.

## Isolation principle

No upstream OIDC library type appears in any `@owlmeans/*` public export. All public contracts use OwlMeans-owned types; the boundary is in each package's `src/service.ts`. Canonical example: `packages/server-oidc-rp/src/types.ts` owns `OidcTokenSet`, `OidcGrantChecks`, `OidcServerMetadata`, `OidcIntrospectionResponse`, `OidcClientDescriptor`.

**Why:** a future library swap is confined to one file, without touching downstream consumers.
**How to apply:** when adding new methods to OIDC services, define the parameter/return type in terms of OwlMeans-owned interfaces; never expose a raw `Configuration`, `TokenEndpointResponse`, etc.

## Downstream repos are symlinked

`viable`, `viable-agent`, and `internal` all use bun hoisted linker and **symlink** `@owlmeans/*` packages directly from `common/packages/*`. Rebuilding common propagates automatically; no publish needed.

Verify downstream after any common OIDC change: `bun install && <build> && <test>` in each repo. Check their root `package.json` `overrides` for stale third-party pins to remove.
