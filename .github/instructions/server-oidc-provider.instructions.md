---
description: "How to use @owlmeans/server-oidc-provider — embedded OIDC identity provider built on the oidc-provider library."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/server-oidc-provider

**Layer:** Server
**Install:** `"@owlmeans/server-oidc-provider": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeOidcProviderService()` | Factory for the OIDC provider service |
| Middleware | OIDC endpoints |
| Constants | Endpoint paths, default scopes |
| `OidcProvider` types | Provider config shape |

## Usage

```typescript
import { makeOidcProviderService } from '@owlmeans/server-oidc-provider'
context.registerService(makeOidcProviderService())
```

For consuming an external IdP instead, use `@owlmeans/server-oidc-rp`.

## Permissions claim seam (integrated IAM)

- `findAccount` threads the requesting `clientId` into `OidcAccountService.loadById(ctx, id, { clientId })`
  (`OidcAccountParams`) so the account service can scope claims per client.
- `combineConfig` registers the `permissions` scope and the `permissions → [permissions]` claim mapping
  by default (consts from `@owlmeans/oidc`); this is inert unless the account service emits the claim.
- To mint the claim into the id_token set `customConfiguration.conformIdTokenClaims: false` and return
  `permissions: PermissionSet[]` from the account's `claims()` when the scope includes `permissions`.

## `behindProxy` — set it explicitly behind a TLS-terminating proxy

`oidc.proxy = cfg.behindProxy ?? unsecure` (`service.ts`), where `unsecure` is true only when the
computed issuer is **not** https. So the default trusts `X-Forwarded-*` exactly when it shouldn't and
distrusts it when it must: behind an ingress that terminates TLS, the provider ignores
`X-Forwarded-Proto` and advertises **`http://`** `authorization_endpoint` / `token_endpoint` /
`jwks_uri` / `userinfo_endpoint` under an `https://` issuer, downgrading every relying party mid-flow
(a mismatch that is easy to miss because the `issuer` field itself looks correct).

**Any deployment behind a reverse proxy must set `cfg.oidc.behindProxy = true`.** It is the only
reverse-proxy knob in the package — there is no `trustProxy`. Trusting the header is a no-op when no
proxy sets it, so it is safe to enable wherever the pod is only reachable through the gateway.

Verify with the discovery document — every endpoint must share the issuer's scheme:

```bash
curl -s https://<host>/oidc/.well-known/openid-configuration | jq '{issuer, authorization_endpoint, token_endpoint}'
```

## Issuer construction — mind `{ base: true }`

The issuer is `makeUrl(services[cfg.authService ?? cfg.service], cfg.basePath ?? DEFAULT_PATH,
{ base: true })`. The `{ base: true }` **drops the service route's own `base` segment**; the
`server-oidc-rp` fallback path (`service` + `basePath`) does not pass it. Any code that needs to
reproduce this issuer (e.g. an IAM adapter reporting it to consumers) must use the identical call —
`openid-client` compares the two strings and fails discovery on any difference.

## Depends On

- `@owlmeans/oidc`, `@owlmeans/server-api`, `@owlmeans/server-context`, `oidc-provider`
