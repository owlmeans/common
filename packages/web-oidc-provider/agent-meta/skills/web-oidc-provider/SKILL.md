---
name: web-oidc-provider
description: How to use @owlmeans/web-oidc-provider — the browser state model behind an embedded OIDC provider's interaction screens — the interaction uid cookie, the interaction stack, and the OidcAuthState flags a login or consent screen branches on. Auto-invoked when building or changing OIDC provider interaction screens in a web app.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-oidc-provider

**Layer:** Web (React)
**Install:** `"@owlmeans/web-oidc-provider": "^0.1.18-rc.24"` in `dependencies`

The browser side of an application that **hosts** the OIDC provider screens — the login and consent
pages `oidc-provider` redirects to. An application that merely signs in against someone else's issuer
wants `@owlmeans/web-oidc-rp` instead.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeAuthStateModel(context, updateState)` | Builds the model for one interaction. `updateState(uid)` is the caller's round trip to the provider, resolving `{ entityId?, did? }` |
| `OidcAuthStateModel` | `init`, `updateAuthState`, `finishInteraction`, `getState`, and the six predicates below |
| `OidcAuthState` | The flag enum: `Authenticated`, `SameEntity`, `IdLinked`, `Simplified` — plus `ProfileExists` and `RegistrationAllowed`, which the model never sets |
| `AuthStateProperties` | The model's data half: `{ uid, state, entityId?, did? }` |
| `OidcInteraction` | The stacked-interaction record: `{ id, stack: { uid, token }[] }` |
| `WithSharedConfig` | `{ oidc: OidcSharedConfig }` — the config shape this package requires |

## Usage

```typescript
import { makeAuthStateModel } from '@owlmeans/web-oidc-provider'

const model = makeAuthStateModel(context, async uid => await loadInteraction(uid))
await model.init(uid)

if (!model.isAuthenticated()) return <LoginScreen />
if (!model.isSameEntity()) return <SwitchOrganizationScreen entityId={model.entityId} />
await model.finishInteraction()
```

Read the flags through the predicates — `isAuthenticated`, `isSameEntity`, `isIdLinked`,
`isSimplified`, `profileExists`, `isRegistrationAllowed` — rather than inspecting `state` directly;
`getState()` returns the whole set only for diagnostics.

`updateAuthState` adds four flags and only four: `Authenticated`, `SameEntity`, `IdLinked` and
`Simplified`. **`profileExists()` and `isRegistrationAllowed()` therefore always return `false`** —
the enum members exist and nothing ever adds them — so a screen must not branch on either as though
it reported something. Decide "does this subject already have a profile" from the round trip the
caller passes to `makeAuthStateModel`, not from the state set.

## The uid, the cookie and the stack

`init(uid)` is the entry point and it does more than store an argument:

- A uid of `'-'` means "whatever interaction this browser is already in": the value is taken from the
  interaction cookie. Its name comes from `cfg.oidc.clientCookie.interaction.name` (default
  `_interaction`) and its lifetime from `.ttl` in seconds (default 3600).
- Arriving with a **different** uid while a cookie is set is meant to push the current uid and its
  auth token onto an interaction stack in the auth store, so a nested authorization can return to the
  one it interrupted. The push only happens when the store already holds the stack record, and
  nothing ever creates it — the source marks the branch with its own `@TODO`. So in practice the
  stack stays absent, nothing is pushed, and `finishInteraction()` finds nothing to pop. Treat
  returning to an interrupted interaction as unimplemented rather than as behaviour to rely on;
  `init(uid, true)` is the reset argument for the same branch.
- The computed state is memoised per uid in module scope, for the life of the document — the memo is
  shared by every model built in that document. `init` returns the memo without touching the cookie
  when one exists; `updateAuthState(uid)` recomputes and rewrites it; `finishInteraction()` deletes
  the current uid's memo.

`Simplified` is not derived from the interaction. `updateAuthState` sets it when the `FLOW_STATE`
resource (`@owlmeans/client-flow`) holds an `EXTRA_FLOW` record whose `payload.simplified` is the
string `'true'`, and `finishInteraction()` deletes that record. Nothing in the OwlMeans packages
writes it — the relying party's own `simplified` rides on the authorization URL as a query param and
never reaches this record — so a host application that wants simplified screens has to save the
extra-flow record itself.

## Rules

- `cfg.oidc` must exist before the model is built; the cookie configuration is read eagerly.
- `entityId` falls back to `cfg.defaultEntityId` when the interaction names none, so a screen must
  not treat a present `entityId` as proof that the interaction was organization-scoped.
- `finishInteraction(true)` skips recomputing state after popping — use it when the caller navigates
  away immediately, and the default otherwise.

## Depends On

- `@owlmeans/oidc`, `@owlmeans/web-client`, `@owlmeans/client-flow`, `@owlmeans/auth`,
  `@owlmeans/resource`, `universal-cookie`
- `react` (peer)

The server half is `@owlmeans/server-oidc-provider`, which is what redirects a browser to these
screens through its `interactions.url`.
