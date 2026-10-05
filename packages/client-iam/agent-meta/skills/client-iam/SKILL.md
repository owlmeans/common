---
name: client-iam
description: "How to use @owlmeans/client-iam — the browser half of the OwlMeans IAM in one import: appendIam (OIDC guard plus the consent-before-sign-in precondition), withIamGuard / iamEntrypoints, the re-exported sign-in surface (useLogin, useLogout), the session's organizations (listOrganizations) and the organization switch (switchOrganization, which adopts the re-signed token), hasPermission for showing or hiding a control, and the refusal reasons ORGANIZATION_REFUSAL / ORGANIZATION_OWNER_REFUSAL. Auto-invoked when wiring sign-in into a web app, rendering an organization switcher, or reading permissions in a screen."
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-iam

**Layer:** Client (browser-only — it depends on `@owlmeans/web-client` and `@owlmeans/web-oidc-rp`)
**Install:** `"@owlmeans/client-iam": "^0.1.18-rc.61"` in `dependencies`

The browser side of the IAM for an application that signs its people in through an OwlMeans OIDC
provider. One import wires the relying party, puts the consent precondition in front of every
sign-in, lists the organizations of the session and moves the session between them. It decides
nothing: every permission is enforced by the application's server (`@owlmeans/server-iam`); a screen
reads permissions only to show or hide a control.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendIam(context, opts?)` | `appendOidcGuard` of `@owlmeans/web-oidc-rp` plus `requireConsentForLogin`. `opts.consent` is `ConsentLoginOptions` — `{ disabled: true }` for an application that sets no cookie at all |
| `withIamGuard(tree, coguards?)` | `withOidcGuard` of `@owlmeans/oidc`: a decorated copy of an immutable protocol tree with `OIDC_GUARD` ahead of each selected guard (default `DEFAULT_GUARD`) |
| `iamEntrypoints(dispatcherProps?)` | `oidcEntrypoints` of `@owlmeans/web-oidc-rp`: the browser bindings of the four shared OIDC protocols (sign-in pair and organization switch) and the dispatcher screen |
| `listOrganizations(ctx)` | `OidcOrganizationItem[]` of the session — `{ entitySlug, title?, owner, groups?, home?, acting }` |
| `switchOrganization(ctx, entitySlug)` | Moves the session into another of its organizations and adopts the re-signed token with `adoptToken` |
| `requireConsentForLogin(ctx, opts?)`, `CONSENT_LOGIN_PRECONDITION`, `ConsentLoginOptions` | The consent precondition on its own (`'consent-before-login'`, priority 100), for a context wired another way |
| `useLogin` / `useLogout`, `LoginOutcome`, `LoginIntent` and the login types | Re-exported from `@owlmeans/client-auth/login`, so an application has one IAM import. `useLogin(target)` signs in first and lands on `target` after, consent and other post-sign-in steps included (`client-auth`) |
| `hasPermission(auth, permission, { scope?, resourceId?, entitySlug? }?)` | Re-exported from `@owlmeans/iam` — the same check the server gate runs |
| `ORGANIZATION_REFUSAL`, `ORGANIZATION_OWNER_REFUSAL` | `'organization'` / `'organization:owner'` — the `AuthForbidden` reasons of a non-member and of a non-owner |
| `OidcOrganizationItem` and every `@owlmeans/iam` type | Re-exported types |
| `CLIENT_IAM_SERVICE` | `'client-iam-service'` — an alias constant nothing registers |

## Wiring

```typescript
import { bindAll } from '@owlmeans/client-entrypoint'
import { appendIam, iamEntrypoints, withIamGuard } from '@owlmeans/client-iam'

appendIam(context)                                   // guard + consent precondition

export const protocols = withIamGuard(appProtocols)  // decorate the tree once
export const bindings = [
  ...bindAll(protocols.api),
  ...iamEntrypoints(),                               // spread once
]
```

`appendIam` reads the provider list from `cfg.oidc.providers`; an application whose browser is given
none still offers one generic sign-in method, and its server's default provider decides the issuer
(`web-oidc-rp`). Decorate the tree before binding it — the helpers never append declarations to a
flattened entrypoint list.

The consent precondition sits on `LoginService.begin`, the one funnel every sign-in mechanic passes
through and the place the user's gesture is still live: a refusal resolves as
`LoginOutcome.Gesture` and opens the consent dialog in the same gesture, and the person presses
"Log in" again after accepting (`login-plugins`, `web-consent`).

## Organizations of the session

A person is one account; an application sees it through its rows, one per organization the person
belongs to in that application. With the provider's `organizations` scope the session acts in ONE
of them at a time, and that is session state held by the application's server — never a parameter
of a request:

```typescript
import { listOrganizations, switchOrganization, ORGANIZATION_REFUSAL } from '@owlmeans/client-iam'

const items = await listOrganizations(context)    // the acting one carries `acting: true`
try {
  await switchOrganization(context, 'hiking-club')
  // every request from here on, and every screen reading `auth`, acts in hiking-club
} catch (error) {
  // AuthForbidden(ORGANIZATION_REFUSAL): not one of the person's organizations — the token stays
}
```

- Both calls go to the application's OWN server (`GET /authenticate/oidc/organizations`,
  `POST /authenticate/oidc/organization`), behind `OIDC_GUARD`, so they need the bindings
  `iamEntrypoints()` spreads. The server side — the session record, re-picking, refusals — is
  governed by `server-oidc-rp` → "Organizations".
- The re-signed token carries the new organization's `entitySlug`, its groups and only its
  permission sets. Re-read `auth` after a switch; nothing else needs resetting.
- There is no per-request organization selector: a screen offering "act in another organization"
  calls `switchOrganization`. A client without the `organizations` scope lists none and refuses
  every switch.

Managing organizations — creating one, inviting members, granting in it — is the server's job
through `iamRuntime` (`@owlmeans/server-iam`); the browser calls the application's own endpoints
for it, never the provider.

## Permissions in a screen

```typescript
import { hasPermission } from '@owlmeans/client-iam'

const canApprove = hasPermission(context.auth().user(), 'loan--approve', { resourceId: loanId })
```

The browser token holds the unbound sets plus the acting organization's sets with their binding
already stripped, so a screen needs no `entitySlug`. A set without `resources` covers every id. Use
the answer to hide or show a control only — the server gate decides.

## Rules

- One IAM import: take sign-in, organizations and permission checks from here, not from
  `@owlmeans/web-oidc-rp`, `@owlmeans/client-auth/login` and `@owlmeans/iam` separately.
- Adopt a token only through `adoptToken` / `context.login().adopt(token)` — `switchOrganization`
  already does; never write `auth` or the stored token by hand.
- Phrase `ORGANIZATION_REFUSAL` and `ORGANIZATION_OWNER_REFUSAL` as sentences for the person; they
  are reasons, not messages.
- Never send an organization id from the browser: organizations travel by `entitySlug` only.

## Depends On

- `@owlmeans/web-oidc-rp`, `@owlmeans/oidc` — the guard, the bindings and the switch protocols
- `@owlmeans/client-auth` — the login host and `adoptToken`
- `@owlmeans/consent` — the consent store the precondition reads
- `@owlmeans/iam` — types and `hasPermission`
- `@owlmeans/context`, `@owlmeans/entrypoint`, `@owlmeans/web-client`

## Related

- `server-iam` — the gate, the session's organizations on the server, the runtime IAM client
- `iam` — the permission model (kinds, default classes) and the `IamService`
- `web-oidc-rp`, `login-plugins`, `login-methods` — the sign-in machinery underneath
