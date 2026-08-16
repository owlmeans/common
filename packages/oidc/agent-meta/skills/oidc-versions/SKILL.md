---
name: oidc-versions
description: How to manage and upgrade the four OIDC/OAuth third-party dependencies used by OwlMeans OIDC packages. Covers exact-pin policy, official doc anchors, breaking-change checklists for each lib, the OwlMeans isolation principle, and the verification flow across common and downstream repos. Auto-invoked when touching oidc-provider, openid-client, jose, or oidc-client-ts version strings in package.json files.
allowed-tools: Bash(npm view *) Bash(grep *) Bash(bun *)
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# OIDC / OAuth dependency version management — OwlMeans Common

This skill is the sibling of [[versions]] (internal `@owlmeans/*` version sync) and [[shadcn-versions]] (UI lib bumps). Use it whenever upgrading the upstream OIDC/OAuth libraries, and cross-read it before touching any OIDC package implementation.

## The four libraries and their owning packages

| Library | Owner package(s) | Policy | Current pin |
|---------|-----------------|--------|-------------|
| `oidc-provider` | `@owlmeans/server-oidc-provider` | **exact** | `9.11.1` |
| `jose` | `@owlmeans/server-oidc-provider`, `@owlmeans/server-oidc-rp` | **exact** | `6.2.5` |
| `openid-client` | `@owlmeans/server-oidc-rp` | **exact** | `6.8.4` |
| `oidc-client-ts` | `@owlmeans/web-oidc-rp`, `@owlmeans/mui-oidc-rp` | **exact** | `3.5.0` |

`@types/oidc-provider` is a dev dep of `server-oidc-provider` and must track the oidc-provider major: `9.5.0` (v9 ships no bundled types).

All four are authored by panva or authts and follow semantic versioning. **Exact pins** are the project policy — every bump is deliberate and reviewed.

## Checking installed vs latest

```bash
npm view oidc-provider@9 version         # confirm latest v9 patch
npm view jose@6 version                  # confirm latest v6 patch
npm view openid-client@6 version
npm view oidc-client-ts@3 version
npm view @types/oidc-provider version    # no major suffix, uses dist-tags
```

## Official documentation anchors

Consult these before every bump — especially for same-major minors that might add new required fields or change defaults:

- **oidc-provider:** [CHANGELOG](https://github.com/panva/node-oidc-provider/blob/main/CHANGELOG.md) · [Configuration docs](https://github.com/panva/node-oidc-provider/blob/main/docs/README.md)
- **jose:** [CHANGELOG](https://github.com/panva/jose/blob/main/CHANGELOG.md) · [API docs](https://github.com/panva/jose/blob/main/docs/README.md)
- **openid-client:** [CHANGELOG](https://github.com/panva/openid-client/blob/main/CHANGELOG.md) · [Usage guide](https://github.com/panva/openid-client/blob/main/docs/README.md)
- **oidc-client-ts:** [CHANGELOG](https://github.com/authts/oidc-client-ts/blob/main/CHANGELOG.md)

## Breaking-change checklist per library

### oidc-provider (v9.x — current)

Migrated from v8 in this project. Key differences to keep in mind:

- **Provider is a Koa app instance.** `oidc.use()` middleware registered after `api.server.use(base, oidc.callback())` is *downstream* of the Koa router — `await next()` inside such middleware does **not** run after a matched route completes. Move any post-response header manipulation (e.g. CSP rewrites) to a **Fastify `onSend` hook** scoped to the OIDC base path instead.
- **`enableHttpPostMethods`** defaults to `false` (authorization/logout endpoints no longer accept POST by default). Set `enableHttpPostMethods: true` in the Provider config if the interaction flow POSTs.
- **DPoP is on by default.** `features.dPoP.enabled` is `true` without explicit config. Disable if the OIDC clients don't send DPoP proofs.
- **Cookie `sameSite` defaults to `lax`** (was `none`). Review if the interaction UI lives on a different subdomain.
- **JWK `kid` must be unique.** No two keys in `jwks.keys` can share the same `kid`. Generate or assign a deterministic unique `kid` when building the JWKS.
- **`provider.Account` getter removed.** Use `findAccount` callback; do not read `oidc.Account`.
- **Node 22+ required.**
- **ESM-only** (was already ESM in v8).
- HTTP requests now use the **global `fetch()`** (not `got`). `httpOptions` is replaced with a `fetch` config option that mirrors the fetch API.
- **`@types/oidc-provider`** must be `9.x` (`^9.5.0` or exact); the v8 types are incompatible.

### jose (v6.x — current)

Migrated from v5 in this project:

- **WebCrypto is the only crypto backend.** `importPKCS8`, `importSPKI`, `importJWK`, `generateKeyPair` now return `CryptoKey` (not `KeyObject`).
- **`extractable` must be set when you need to call `exportJWK` on an imported key.** In v5 Node `KeyObject` was always extractable. In v6 the `CryptoKey` default is `extractable: false`. The fix:
  ```typescript
  // ✅ v6 — must pass { extractable: true }
  const key = await jose.importPKCS8(pkcs8String, 'RS256', { extractable: true })
  const jwk = await jose.exportJWK(key)   // works
  ```
- **`decodeJwt` unchanged** — still `decodeJwt(jwt): JWTPayload`.
- **Subpath exports removed.** All exports are from the root `'jose'` entry; e.g. `'jose/jwt/verify'` no longer works.
- **CJS `require()` requires Node's `require(esm)` support** (Node 22+, or use dynamic `import()`).

### openid-client (v6.x — no migration needed from v6.1)

v6 introduced a **functional API** (replacing the class-based v5 API). OwlMeans already targets v6 (migrated earlier). Key API surface used:

- `client.discovery(issuerUrl, clientId, secret, authMethod, options)` — returns a `Configuration` object.
- `client.buildAuthorizationUrl(config, params)` — returns a `URL`.
- `client.authorizationCodeGrant(config, url, checks)` — returns `TokenEndpointResponse`.
- `client.clientCredentialsGrant(config)` / `client.refreshTokenGrant(config, refreshToken)`.
- `client.tokenIntrospection(config, token)`.
- `client.allowInsecureRequests` — passed in the `execute` array option of `discovery` when behind HTTP (dev/internal).

Breaking changes within v6.x are documented in the CHANGELOG; check before bumping patch/minor versions.

### oidc-client-ts (v3.x — no migration from v3.1)

Current pin is `3.5.0`. OwlMeans only uses `UserManager` (browser-side, currently a stub). Check the CHANGELOG for breaking changes to `UserManager` constructor or `signinRedirect` between minor versions.

## OwlMeans isolation principle

**No upstream OIDC library type may appear in a package's public `index.ts` exports.** Define OwlMeans-owned interfaces and map at the service boundary.

Canonical example — `@owlmeans/server-oidc-rp` public types:
- `OidcTokenSet` — OwlMeans-owned shape for `access_token`, `refresh_token`, `id_token`, etc.
- `OidcGrantChecks` — owned shape for PKCE checks.
- `OidcServerMetadata` — owned shape for issuer/endpoint metadata.
- `OidcIntrospectionResponse` — owned shape for token introspection.
- `OidcClientDescriptor` — **opaque branded type** (consumers receive and pass it back; never read its internal structure).

The implementation in `src/service.ts` imports and uses the upstream types internally, mapping to/from the owned types at method boundaries. This means a future library swap is confined to a single file.

See [[server-oidc-rp]] for the full public surface.

## Performing a bump

1. **Read the CHANGELOG** for the target version (link above). Enumerate every breaking change against the checklist above.
2. Update the version string in **each owning package's `package.json`** — exact pins only, no caret.
3. Update `@types/oidc-provider` if bumping `oidc-provider` across a major.
4. **Run `bun install`** in the monorepo root to update the lockfile.
5. **Fix any code changes** using the checklist (particularly the `extractable` gotcha for jose and the CSP/debug middleware placement for oidc-provider).
6. Build affected packages: `bun run build` (or `tsc -b`) per package.
7. Run unit tests: `bun test ./tests` per package.

## Downstream verification

Downstream repos that link `@owlmeans/*` packages as local workspace entries (bun hoisted linker) pick up the rebuilt outputs automatically. After rebuilding the affected packages, verify each downstream:

```bash
# per repo: viable, viable-agent, internal
cd <your-project-root>
bun install           # refresh transitive third-party versions
bun run build         # or per-workspace build command
bun test              # or per-workspace test command
```

Check `overrides` in each repo's root `package.json` — remove stale pins of oidc-provider/jose/openid-client/oidc-client-ts if present.

## Cross-references

- [[versions]] — `@owlmeans/*` internal package version sync
- [[shadcn-versions]] — UI lib (Tailwind / shadcn) version management
- [[server-oidc-provider]] — how to use and configure the embedded OIDC provider (v9 notes)
- [[server-oidc-rp]] — how to use the OIDC relying party + public type contracts
- [[auth-protocol]] — end-to-end OIDC auth flow and mocking points
