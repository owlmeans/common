---
name: server-iam
description: "How to use @owlmeans/server-iam — one-call OIDC RP wiring (appendIam), the IAM gate that asserts unbound, organization-bound and resource-scoped permissions (claims-first, UMA2 fallback), the session's organizations (makeOrganizationScope: organizationOf/organizationsOf), the request-bound runtime IAM client (makeIamRuntimeClient), plus the gate-param grammar it re-exports. Use when gating server endpoints, declaring gate params, acting in a tenanted client's organizations, managing members or grants from a target's server, or diagnosing a permission refusal. Applies to files matching **/owlmeans.ts, **/gate*.ts, **/auth-guard*.ts."
metadata:
  applyTo: "**/owlmeans.ts, **/gate*.ts, **/auth-guard*.ts"
---

# Using `@owlmeans/server-iam`

**Install:** `"@owlmeans/server-iam": "^0.1.18-rc.59"` in `dependencies`

Boilerplate-less server-side consumer of the OwlMeans IAM. One call wires the OIDC RP stack and the
IAM gate; the consumer never knows which IAM backend (Keycloak or integrated) is active. For a
tenanted client it also reads the session's organizations and calls the provider's runtime IAM API
as the signed-in subject.

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `appendIam(context)` | fn | Registers `makeOidcClientService()`, `makeOidcWrappingService()`, `makeIamGate()` (under `OIDC_GATE`), and the OIDC guard |
| `makeIamGate(alias?, opts?)` | fn | The IAM `GateService` — claims-first assertion with UMA2 fallback |
| `IamGateOptions` | type | `{ strictResourceScope?: boolean }` — refuse a scoped param on the fallback path instead of widening it |
| `gateParamHelper` (`.parseGateParam` / `.parseGateSelector` / `.formatGateParam`) / `gateValidationHelper.validateGateParams` / `resolveGateResource` | helper / fn | Re-exports from `@owlmeans/iam`, which owns the grammar |
| `RESOURCE_PARAM_SEPARATOR` / `RESOURCE_SOURCE_SEPARATOR` / `RESOURCE_PATH_SEPARATOR` | const | `'@'`, `':'` and `'.'`, re-exported |
| `GateParamSource` / `GateParamErrorCode` / `GateResolutionFailure` | enum | Re-exported; the sources a selector may name, and why one failed |
| `hasPermission` | fn | Re-export from `@owlmeans/iam` |
| `makeOrganizationScope(context, request).organizationOf(entitySlug)` | scope | One organization of the request's subject as a `ResolvedEntity` (`{ id: entityKey, slug, iamKey: entityKey }`); one the subject is not in is `AuthForbidden(ORGANIZATION_REFUSAL)` |
| `makeOrganizationScope(context, request).organizationsOf()` | scope | Every organization of the request's subject, as `ResolvedEntity[]` |
| `makeIamRuntimeClient(context, request)` | fn | The request-bound `IamRuntimeClient` of the provider's runtime IAM API — see "The runtime IAM client" |
| `IamRuntimeClient` | type | `organizations.{list,create,update}`, `members.{list,add,update,remove}`, `permissions.list`, `grants.{list,assign,revoke}` |
| `ORGANIZATION_REFUSAL` / `ORGANIZATION_OWNER_REFUSAL` | const | Re-exported from `@owlmeans/oidc`: the `AuthForbidden` reasons of a non-member and of a non-owner |
| `SERVER_IAM_SERVICE` | const | `'server-iam-service'` — exported and referenced nowhere; the gate registers under `OIDC_GATE`, not under this |
| Every `@owlmeans/iam` type | type | Re-exported wholesale, so a server needs one IAM import |

The grammar lives in **`@owlmeans/iam`**, not here — the browser, both IAM adapters and
code-generation tooling all have to read the same rules. This package re-exports it because it is the
documented import path for a server, so one IAM import covers the gate and its grammar.

`appendIam` reads the provider configuration from `cfg.oidc.providers`, so populate that before
calling it. It is the IAM-flavoured replacement for wiring `@owlmeans/server-oidc-rp` by hand: the
one difference is the gate, which is `makeIamGate()` rather than `makeOidcGate()`.

## Gate-param syntax

```
<permission>                  → unscoped (project-wide): 'article--modify'
<permission>@<bareKey>        → bare form:      'department--modify@departmentId'
<permission>@<source>:<path>  → qualified form: 'order--modify@body:order.id'
```

Sources: `params`, `query`, `body`, `headers`, `auth`.

- **The bare form is lenient and flat**; the qualified form is strict and nested. `@a.b` in the bare
  form is the literal key `"a.b"` — a query key may legally contain a dot, and splitting it would
  change what already-deployed selectors mean. Dotted paths exist only after a `source:`.
- The separator is `:` and not a dot on purpose. With a dotted-only form, a route that gains a param
  named like a source keyword silently changes a selector's meaning: `/report/:query` with
  `@query.id` flips from "the route param named `query.id`" to "the query string's `id`" — an
  authorization lookup redirected to attacker-supplied input by an unrelated route rename.
- The bare form searches `params` then `query`. That query fallback is legacy and deliberately kept:
  removing it would silently deny deployed apps whose selector names a query key.
- `headers:` lowercases its first segment and unwraps a single-element array; a repeated header is
  refused rather than silently narrowed to one of its values.
- `auth:` is the only source that is neither attacker-controlled nor subject to `removeAdditional`.
  Prefer it whenever the rule is "bound to their own profile or entity".
- A resolved id must satisfy the grant's `resources[]` — **and a grant carrying no `resources` at all
  covers every id**. That is the all-resources form of the same permission, not a separate one.
- Params are **any-of**: one granted param is enough. Which is why a malformed or unresolvable param
  can only contribute `false` and never throw — otherwise one bad sibling would refuse a request the
  subject is legitimately entitled to.

**The `@` belongs to the gate and nowhere else.** It is never part of a permission's stored NAME. A
definition or grant written as `enquiry--view@enquiryId` is a key nothing looks up, so the permission
reads as granted in every screen and every request is still refused, with nothing logged.
`ensurePermission` refuses such a name; `gateValidationHelper.validateGateParams` catches the mirror-image mistake at
generation time.

### `gateValidationHelper.validateGateParams(params, audit?)`

Reports what is provable from an entrypoint's own declaration: a selector naming a route param the
path does not carry, or a `body`/`query`/`headers` key the `Filter` does not declare **while that
schema sets `additionalProperties: false`**. That qualifier matters — the server's AJV runs
`removeAdditional`, which strips only what a schema closes, so without it the check would fire on
every unfiltered endpoint and be ignored within a week. It never decides a request; the gate runs it
once per alias and only logs.

The route half of the audit comes from `entrypoint.mount()`, which needs a service with a resolvable
address. An entrypoint that has none is still audited against its filter — the route-param check is
simply skipped rather than the whole audit being lost.

```ts
// module declaration
{ gate: { alias: OIDC_GATE, params: ['department--modify@depId'] } }

// or imperative
await ctx.service<GateService>(OIDC_GATE).assert(req, res, ['article--modify'])
```

## How the gate decides

1. `req.auth == null` → `AuthForbidden('auth')`.
2. **Claims mode** — when `req.auth.permissions` is a valid `PermissionSet[]` (minted into the id_token
   by the integrated IAM provider and mapped into `Auth` by `@owlmeans/server-oidc-rp`), params are
   asserted locally via `hasPermission`, with `entitySlug: req.entity?.slug ?? authHelper.entitySlugOf(auth)` —
   the organization the request acts in.
3. **Fallback** — otherwise `@…` suffixes are stripped and the check delegates to the UMA2 gate model
   from `@owlmeans/server-oidc-rp` (`createGateModel().loadPermissions`) — exactly the check
   `makeOidcGate` performs, which is what a Keycloak-backed deployment gets.

In claims mode all four permission kinds (`iam` skill, "Permission kinds") are decided locally by
`hasPermission`; a bound set reaching the gate is a leak the relying party should have stripped, and
it counts only when the request acts in exactly its organization.

Which branch runs is decided per request by the token alone: a conforming `permissions` claim selects
claims mode, its absence selects the fallback. Nothing configures it, and there is no environment
variable behind it.

**The fallback path does not enforce resource scoping**, so one declaration means two different
things depending on which backend answered. It cannot be fixed by denying — a Keycloak-backed adapter
throws `IamUnsupported('resource-scoped-grant')`, so a scoped grant cannot exist there and denying
would lock every user out of every scoped endpoint. The gate logs each such param once per alias;
`makeIamGate(alias, { strictResourceScope: true })` opts into denial where the refusals are the
intended outcome.

A denial distinguishes its reasons in the log: a param that failed **structurally** (unparseable,
source absent, value not a scalar) is reported separately from one that resolved fine and simply was
not granted. The HTTP answer is identical — `AuthForbidden('permission')` either way — because the
caller must never learn which.

## `{entity}` in a permission name

A gate param may carry the literal `{entity}`, which is substituted at assertion time with the
organization entity's **stable id** — `req.entity.id`, resolved once at the server boundary — falling
back to the token's `entitySlug` and then to `-`. So `my-service-account-{entity}` asserts a
per-organization permission without the declaration knowing which organization it is for.

Grants are stored against the id wherever one is resolvable. The slug fallback exists for deployments
with no organization store of their own, where the slug *is* the identifier; a deployment that has a
store must not grant against slugs, because a rename would then orphan every grant.

## Organizations of the session

A relying party of a tenanted client has no organization registry of its own: the provider's
`organizations` claim, kept in the session record (`@owlmeans/server-oidc-rp`), is the only source,
re-read on every validation. `makeOrganizationScope(context, request).organizationsOf()` answers all of it and `.organizationOf(slug)` one entry by
slug, as `ResolvedEntity` values keyed by the frozen `entityKey` — use them for a handler that acts in
an organization its URL names rather than the session's acting one (which the guard already attaches
as `req.entity`). A session of a client without the scope acts in none and has none to offer; an
unauthenticated request or a session that is gone is `AuthorizationError` (401).

## The runtime IAM client

`makeIamRuntimeClient(context, request)` calls the provider's runtime IAM API (`makeIamRuntimeProtocols` in
`@owlmeans/iam`) as that request's subject:

- **Base** — the provider's discovery field `IAM_API_METADATA` (`owlmeans_iam_api`), read through
  the OIDC client service's adapter `getMetadata()` for the session's client, and cached per context
  and client; a failed lookup is forgotten. A provider that advertises none (Keycloak) is
  `IamClientError('runtime-api:<client>')`.
- **Bearer** — the provider access token of the request's session record, read afresh on every call
  so a token the guard just refreshed is the one sent. A record without one is
  `AuthForbidden('record')`, and nothing is sent.
- **Transport** — plain `fetch` over `IAM_RUNTIME_ROUTES`: the API is another service's tree, and a
  relying party binds none of it.
- **Refusals** — a development server's marshalled error is rebuilt into its class. A production body
  is only an incident id, so the status and the route decide: a 403 from an owner route is
  `AuthForbidden(ORGANIZATION_OWNER_REFUSAL)`, from any other route `AuthForbidden(ORGANIZATION_REFUSAL)`;
  a 401 is `AuthorizationError('iam-runtime')`; anything else `IamError('runtime:status:<n>')`. The
  incident id travels on the error.

`members.add` is find-or-create by e-mail and idempotent — that is the provider's job, so a caller
never checks for an existing member first. Owner and member rights are decided by the provider from
the token; nothing sent here can widen them.

## Rules

- Register the gate via `appendIam()`; do not also register `makeOidcGate()` — both use the
  `OIDC_GATE` alias and the IAM gate already covers the UMA2 path.
- Never branch on the IAM backend in consumer code — the gate's claims/fallback split is the only seam.
- The OIDC provider entry must request the `permissions` scope (`extraScopes`) for claims mode to
  engage; without it the gate transparently uses the fallback. A tenanted client also requests
  `organizations`.
- Reach the runtime IAM API only through `makeIamRuntimeClient`; never forward the browser's wrapped token or
  build a bearer from anything but the session record.

## Related instructions

- `@owlmeans/iam` — abstraction + `hasPermission`; see the `iam` skill
- `@owlmeans/server-oidc-rp` — claim extraction + UMA2 model; see the `server-oidc-rp` skill
