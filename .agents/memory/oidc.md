---
node: oidc
scope: "packages/server-oidc-provider/**, packages/server-oidc-rp/**, packages/web-oidc-rp/**, packages/mui-oidc-rp/**, packages/oidc/**"
updated: 2026-10
---

# OIDC (third-party pins, isolation, subjects and sessions)

Upgrades consult the `oidc-versions` skill. Viable-side usage and the identity model: [[auth]].

## Facts

- Exact pins (deliberate-bump policy): `oidc-provider` 9.11.1 (server-oidc-provider); `jose` 6.2.5
  (server-oidc-provider, server-oidc-rp); `openid-client` 6.8.4 (server-oidc-rp);
  `oidc-client-ts` 3.5.0 (web-oidc-rp, mui-oidc-rp); `@types/oidc-provider` 9.5.0 (dev).
- Pairwise: `oidc-provider` applies `pairwiseIdentifier` to the `sub` an account's `claims()`
  returns and introspection to `token.accountId` — so `claims()` returns `sub` = `Account.accountId`,
  never the pairwise value (else it is transformed twice).
- Pairwise with redirect URIs on several hosts needs a `sector_identifier_uri`: one constant https
  URI for all clients + `sectorIdentifierUriValidate: () => false` (never fetched). Pairwise-only
  makes it every client's default; `public` is refused.
- The relying party's session record (`:token:` in `AUTH_CACHE`) alone holds a tenanted client's
  `organizations` claim, raw sets and acting `entityKey`; the switch and `iamRuntime` read it, and
  its provider `access_token` is the runtime API's bearer.
- `cfg.oidc.discoveryUris` adds discovery fields with `{{service-alias}}/path` expansion — how the
  runtime IAM API is advertised (`owlmeans_iam_api`).

## Invariants

- No upstream OIDC library type in any `@owlmeans/*` public export; the boundary is each package's
  `src/service.ts` (example: `packages/server-oidc-rp/src/types.ts`). New service methods take
  OwlMeans-owned interfaces, never raw `Configuration` / `TokenEndpointResponse`.
- After any common OIDC change, verify downstream (`viable`, `viable-agent`, `internal`):
  `bun install && build && test`; check their root `overrides` for stale third-party pins.
- Entrypoints split by ownership: `withOidcGuard(tree)` decorates shared declarations; server and
  browser `oidcEntrypoints` return local bindings (IAM: `withIamGuard`, `iamEntrypoints`);
  `makeAuthServiceEntrypoints()` returns declarations the serving app binds.
- A scope a client asks for must be on its allowlist, or `oidc-provider` fails the whole request
  with `invalid_scope` — `organizations` is on every integrated client's list.

## Gotchas

- `findAccount` → `undefined` does NOT re-prompt login (9.11.1 `no_session` reads
  `session.accountId`); consent then throws → `server_error`. `makeInteractionPolicy()` adds
  `account_refused`; a pin bump re-runs `tests/policy.spec.ts` (its first case is the canary).
- Provider response headers (COOP `unsafe-none`, `form-action *`) are raw-response middleware on the
  API server ahead of `oidc.callback()`; a Fastify `onSend` hook never fires for provider routes
  (the Koa handler ends the response through Middie) — the header looks set and is absent on the wire.
- `context.entrypoint(DISPATCHER).url is not a function` at the RP's init: a frontend route read from
  a server context has no `url()`; reached only on a fully wired app's first sign-in
  (`server-oidc-rp` → "A server context has no `url()`").
- jose v6: `importPKCS8` returns a non-extractable `CryptoKey` by default — always
  `jose.importPKCS8(pem, alg, { extractable: true })` or `exportJWK` throws.
- `sectorIdentifierUriValidate` is missing from `@types/oidc-provider` 9.5.0 — declared on
  `OidcCustomConfiguration`; drop it there when the typings carry it.
