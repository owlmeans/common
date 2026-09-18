---
name: oidc-versions
description: How to manage and upgrade the four OIDC/OAuth third-party dependencies used by OwlMeans OIDC packages. Covers exact-pin policy, official doc anchors, breaking-change checklists for each lib, the OwlMeans isolation principle, and the verification flow across common and downstream repos. Auto-invoked when touching oidc-provider, openid-client, jose, or oidc-client-ts version strings in package.json files.
allowed-tools: Bash(npm view *), Bash(grep *), Bash(bun *)
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# OIDC / OAuth dependency version management — OwlMeans Common

The sibling of [[versions]] (internal `@owlmeans/*` version sync) and [[shadcn-versions]] (UI lib
bumps). Use it whenever upgrading the upstream OIDC/OAuth libraries, and cross-read it before
touching any OIDC package implementation.

## The four libraries and their owning packages

| Library | Owner package(s) | Policy | Current pin |
|---------|-----------------|--------|-------------|
| `oidc-provider` | `@owlmeans/server-oidc-provider` | **exact** | `9.11.1` |
| `jose` | `@owlmeans/server-oidc-provider`, `@owlmeans/server-oidc-rp` | **exact** | `6.2.5` |
| `openid-client` | `@owlmeans/server-oidc-rp` | **exact** | `6.8.4` |
| `oidc-client-ts` | `@owlmeans/web-oidc-rp`, `@owlmeans/mui-oidc-rp` | **exact** | `3.5.0` |

`@types/oidc-provider` is a dev dependency of `@owlmeans/server-oidc-provider` and must track the
oidc-provider major: `9.5.0` (v9 ships no bundled types).

All four are authored by panva or authts and follow semantic versioning. **Exact pins** are the
policy — no caret, no range — so that every bump is a deliberate, reviewed change. The pinned value
lives in each owning package's `dependencies`; nothing else may declare one of these libraries.

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

### oidc-provider v9

- **The provider is a Koa app instance**, and `Provider#use(fn)` splices `fn` **ahead of** the
  provider's own router in the Koa chain, so such a middleware runs before routing and resumes
  normally after `await next()`. Header corrections for an OwlMeans server nonetheless belong in a
  middleware registered on the API server **before** `oidc.callback()`, writing to the raw response
  where `@fastify/helmet` has already put its defaults. They must never be a Fastify `onSend` hook:
  `oidc.callback()` ends the response outside Fastify's reply lifecycle, so `onSend` never fires for
  a route the provider answers.
- **`enableHttpPostMethods` is `false`.** Turning it on requires `cookies.long.sameSite: 'none'` in
  the same configuration; otherwise the constructor throws `TypeError: HTTP POST Method support
  requires that cookies.long.sameSite is set to none`.
- **DPoP is on.** `features.dPoP.enabled` is `true` with no configuration. Disable it when the
  clients send no DPoP proofs.
- **Cookie `sameSite` is `lax`** for both `cookies.long` and `cookies.short`. Review it when the
  interaction UI lives on a different subdomain.
- **JWK `kid` must be unique.** No two keys in `jwks.keys` may share one.
- **There is no `provider.Account` getter.** Accounts come from the `findAccount` callback.
- **ESM-only**, and outbound HTTP goes through the `fetch` configuration option — a function
  mirroring the fetch API, defaulting to `globalThis.fetch`. There is no `httpOptions`.
- **`@types/oidc-provider` must track the major** (`9.5.0`); v9 ships no bundled types.

### jose v6

- **WebCrypto is the only crypto backend.** `importPKCS8`, `importSPKI` and `importX509` resolve to a
  `CryptoKey`; `importJWK` resolves to a `CryptoKey` for every key type except `oct`, which yields a
  `Uint8Array`. `KeyObject` survives only as an exported type.
- **`extractable` defaults to `false` for a private key** and `true` for everything else, so an
  imported private key cannot be exported unless the import asked for it:
  ```typescript
  const key = await jose.importPKCS8(pkcs8String, 'RS256', { extractable: true })
  const jwk = await jose.exportJWK(key)   // works
  ```
- `decodeJwt(jwt): JWTPayload`.
- Both the root entry and the subpath entries (`jose/jwt/verify`, `jose/key/import`, `jose/errors`, …)
  are exported. Prefer the root entry — an `import * as jose from 'jose'` is what the OwlMeans
  packages use, and a subpath import buys nothing under a bundler.
- **CJS `require()` needs Node's `require(esm)` support**; use dynamic `import()` otherwise.

### openid-client v6

A functional API — there is no client class. The surface OwlMeans uses:

- `discovery(issuerUrl, clientId, metadata?, clientAuthentication?, options?)` → `Configuration`.
  `metadata` accepts the client secret as a bare string. `clientAuthentication` is a `ClientAuth`
  function (`ClientSecretPost(secret)`, `ClientSecretBasic(secret)`, …) and defaults to
  `ClientSecretPost` when a secret is present — passing `undefined` takes that default.
- `buildAuthorizationUrl(config, params)` → `URL`.
- `authorizationCodeGrant(config, url, checks)` → `TokenEndpointResponse`.
- `clientCredentialsGrant(config)` / `refreshTokenGrant(config, refreshToken)`.
- `tokenIntrospection(config, token)`.
- `allowInsecureRequests` — passed inside the `execute` array of `discovery`'s options to permit
  plain HTTP for an internal or development issuer.

### oidc-client-ts v3

Only `UserManager` is referenced, in the incomplete fully-browser-side path; the production flow is a
server-side token exchange. Check the CHANGELOG for changes to the `UserManager` constructor or
`signinRedirect` before bumping a minor.

## OwlMeans isolation principle

**No upstream OIDC library NAME may appear in a package's public `index.ts` exports.** Declare
OwlMeans-owned types and map at the service boundary, so a consumer never imports from
`openid-client` or `oidc-provider` to type a variable this stack handed it.

The public types of `@owlmeans/server-oidc-rp` are the canonical example:

- `OidcTokenSet` / `OidcTokenSetParameters` — declared shapes for `access_token`, `refresh_token`,
  `id_token`, `token_type`, `expires_in`, `scope`, with and without the `claims()` helper.
- `OidcGrantChecks` — the declared shape for PKCE checks.
- `OidcIntrospectionResponse` — the declared shape for token introspection.
- `OidcServerMetadata` and `OidcClientDescriptor` — deliberate aliases onto the upstream metadata and
  configuration objects, exported under owned names. `OidcClientDescriptor` is **opaque**: consumers
  receive it and pass it back, and never read its internals.

What the principle guarantees is the **exported name**: a consumer types every value this stack hands
it without importing `openid-client` or `oidc-provider`. It does not confine upstream imports to one
file, and reading it that way misleads. In `@owlmeans/server-oidc-rp` the type module imports
`Configuration`, `ServerMetadata`, `TokenEndpointResponse` and `TokenEndpointResponseHelpers` from
`openid-client` in order to alias them under the owned names; the service module imports the
functional API; and `jose`'s `decodeJwt` is imported directly by the token wrapper, the `oidc-client`
auth plugin and the exchange handler. A library swap touches each of those — the owned names are what
keep it from reaching any consumer.

See [[server-oidc-rp]] for the full public surface.

## Performing a bump

1. **Read the CHANGELOG** for the target version (link above). Enumerate every breaking change
   against the checklist above.
2. Update the version string in **each owning package's `package.json`** — exact pins only, no caret.
3. Update `@types/oidc-provider` when bumping `oidc-provider` across a major.
4. Reinstall so the lockfile is regenerated.
5. **Fix the code** using the checklist — particularly the jose `extractable` argument and the
   placement of the header-correcting middleware for oidc-provider.
6. Build every affected package, then run its unit tests.

## Downstream verification

A project that links these packages as local workspace entries picks up the rebuilt outputs
automatically, but its own transitive copies of the four libraries do not move on their own. After
rebuilding, in every consuming project: reinstall, build, and run the tests.

Then check `overrides` (or the equivalent resolution field) in each consuming project's root
manifest and remove any stale pin of `oidc-provider`, `jose`, `openid-client` or `oidc-client-ts` —
an override outranks the exact pin the owning package declares, so a forgotten one silently keeps the
old version installed.

## Cross-references

- [[versions]] — `@owlmeans/*` internal package version sync
- [[shadcn-versions]] — UI lib (Tailwind / shadcn) version management
- [[server-oidc-provider]] — how to use and configure the embedded OIDC provider (v9 notes)
- [[server-oidc-rp]] — how to use the OIDC relying party + public type contracts
- [[auth-protocol]] — end-to-end OIDC auth flow and mocking points
