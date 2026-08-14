---
name: server-iam
description: "How to use @owlmeans/server-iam — one-call OIDC RP wiring (appendIam) and the IAM gate that asserts unscoped and resource-scoped permissions (claims-first, UMA2 fallback). Use when gating server endpoints in IAM consumers (e.g. the viable target template backend). Applies to files matching **/owlmeans.ts, **/gate*.ts, **/auth-guard*.ts."
metadata:
  applyTo: "**/owlmeans.ts, **/gate*.ts, **/auth-guard*.ts"
---

# Using `@owlmeans/server-iam`

Boilerplate-less server-side consumer of the OwlMeans IAM. One call wires the OIDC RP stack and the
IAM gate; the consumer never knows which IAM backend (Keycloak or integrated) is active.

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `appendIam(context)` | fn | Registers `makeOidcClientService()`, `makeOidcWrappingService()`, `makeIamGate()` (under `OIDC_GATE`), and the OIDC guard |
| `makeIamGate(alias?)` | fn | The IAM `GateService` — claims-first assertion with UMA2 fallback |
| `parseGateParam(param)` | fn | Splits `'perm@requestParam'` into `{ permission, resourceParam? }` |
| `RESOURCE_PARAM_SEPARATOR` | const | `'@'` |
| `hasPermission` | fn | Re-export from `@owlmeans/iam` |

## Gate-param syntax

```
<permission>                      → unscoped (project-wide): 'article--modify'
<permission>@<requestParam>       → resource-scoped: 'department--modify@departmentId'
```

- `{entity}` substitution applies to the permission part in both forms.
- For the resource-scoped form the gate resolves `req.params[requestParam] ?? req.query[requestParam]`
  at assert time and requires the grant's `resources[]` to contain it (an unscoped grant always passes).
- Params are **any-of**: one granted param is enough.

```ts
// module declaration
gate(OIDC_GATE, ['department--modify@depId'])

// or imperative
await ctx.service<GateService>(OIDC_GATE).assert(req, res, ['article--modify'])
```

## How the gate decides

1. `req.auth == null` → `AuthForbidden('auth')`.
2. **Claims mode** — when `req.auth.permissions` is a valid `PermissionSet[]` (minted into the id_token
   by the integrated IAM provider and mapped into `Auth` by `@owlmeans/server-oidc-rp`), params are
   asserted locally via `hasPermission`.
3. **Fallback** — otherwise `@…` suffixes are stripped and the check delegates to the UMA2 gate model
   from `@owlmeans/server-oidc-rp` (`createGateModel().loadPermissions`) — byte-equivalent to the old
   `makeOidcGate`, which keeps Keycloak-backed deployments unchanged.

## Rules

- Register the gate via `appendIam()`; do not also register `makeOidcGate()` — both use the
  `OIDC_GATE` alias and the IAM gate already covers the UMA2 path.
- Never branch on the IAM backend in consumer code — the gate's claims/fallback split is the only seam.
- The OIDC provider entry must request the `permissions` scope (`extraScopes`) for claims mode to
  engage; without it the gate transparently uses the fallback.

## Related instructions

- `@owlmeans/iam` — abstraction + `hasPermission`; see the `iam` skill
- `@owlmeans/server-oidc-rp` — claim extraction + UMA2 model; see the `server-oidc-rp` skill
