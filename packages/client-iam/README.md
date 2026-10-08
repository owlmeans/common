# @owlmeans/client-iam

The browser half of the OwlMeans IAM in one import, for a web app that signs its people in through
an OwlMeans OIDC provider. `appendIam` wires the OIDC relying-party guard and puts a consent
precondition in front of every sign-in; the package also re-exports the sign-in surface
(`useLogin`, `useLogout`, `withIamGuard`, `iamEntrypoints`), lists the session's organizations and
switches between them, and re-exports `hasPermission` for showing or hiding a control. It decides
nothing: permissions are enforced by the app's server (`@owlmeans/server-iam`). It is browser-only
(it depends on `@owlmeans/web-client` and `@owlmeans/web-oidc-rp`); server code uses
`@owlmeans/server-iam` and the shared permission model lives in `@owlmeans/iam`.

## Installation

```bash
bun add @owlmeans/client-iam@^0.1.18-rc.64
```

## Concepts

- **Relying-party guard** — `appendOidcGuard` from `@owlmeans/web-oidc-rp`, installed by
  `appendIam`. The provider list is read from `cfg.oidc.providers`.
- **Consent precondition** — a `LoginService` precondition (`'consent-before-login'`, priority 100)
  that refuses to start a sign-in until the essential consent category is granted, and opens the
  consent dialog in the same gesture.
- **Acting organization** — the session acts in one organization entity at a time. That is session
  state held by the app's server, moved with `switchOrganization(entitySlug)`, never a request
  parameter.
- **Organization item** — `OidcOrganizationItem`: `{ entitySlug, title?, owner, groups?, home?, acting }`.
- **Permission check** — `hasPermission` runs the same check the server gate runs; in a screen it
  only decides whether a control is visible.

## Usage

### Wire sign-in into a web app

```typescript
import { bindAll } from '@owlmeans/client-entrypoint'
import { appendIam, iamEntrypoints, withIamGuard } from '@owlmeans/client-iam'

appendIam(context)                                   // OIDC guard + consent precondition

export const protocols = withIamGuard(appProtocols)  // decorate the immutable tree once
export const bindings = [
  ...bindAll(protocols.api),
  ...iamEntrypoints(),                               // sign-in pair, organization switch, dispatcher
]
```

An app that sets no cookie at all turns the consent precondition off:

```typescript
appendIam(context, { consent: { disabled: true } })
```

A context wired without `appendIam` adds the precondition on its own:

```typescript
import { requireConsentForLogin } from '@owlmeans/client-iam'

requireConsentForLogin(context, { category: 'essential' })
```

### Sign-in and sign-out controls

```tsx
import { useLogin, useLogout } from '@owlmeans/client-iam'

export const AccountControls = () => {
  const [href, onLogin] = useLogin('/projects')   // land on /projects after signing in
  const onLogout = useLogout()

  return (
    <>
      <a href={href} onClick={onLogin}>Log in</a>
      <button onClick={onLogout}>Log out</button>
    </>
  )
}
```

When consent is missing, the sign-in resolves as `LoginOutcome.Gesture` and the consent dialog
opens; the person presses "Log in" again after accepting, because the redirect or popup must start
from a real gesture.

### Organizations of the session

```typescript
import { organizationSwitchOf, ORGANIZATION_REFUSAL } from '@owlmeans/client-iam'

const organizations = organizationSwitchOf(context)
const items = await organizations.listOrganizations()   // the acting one has `acting: true`

try {
  await organizations.switchOrganization('hiking-club')
  // every later request, and every screen reading `auth`, acts in hiking-club
} catch (error) {
  // AuthForbidden(ORGANIZATION_REFUSAL): not one of the person's organizations; the token stays
}
```

Both calls go to the app's own server behind `OIDC_GUARD`, so they need the bindings
`iamEntrypoints()` spreads. A successful switch adopts the re-signed token through `adoptToken`
from `@owlmeans/client-auth/login`.

### Permissions in a screen

```typescript
import { hasPermission } from '@owlmeans/client-iam'

const canApprove = hasPermission(context.auth().user(), 'loan--approve', { resourceId: loanId })
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `appendIam(context, opts?)` | function | `appendOidcGuard` plus `requireConsentForLogin`; `opts` is `AppendIamOptions` |
| `requireConsentForLogin(ctx, opts?)` | function | Registers the consent precondition on the login service |
| `organizationSwitchOf(ctx)` | function | Memoized `OrganizationSwitchHelper` of a context |
| `makeOrganizationSwitchHelper(ctx)` | function | Builds an `OrganizationSwitchHelper` (unmemoized) |
| `listOrganizations(ctx)`, `switchOrganization(ctx, slug)` | function | Deprecated wrappers over `organizationSwitchOf(ctx)` |
| `withIamGuard(tree, coguards?)` | function | `withOidcGuard` of `@owlmeans/oidc` — decorated copy of a protocol tree |
| `iamEntrypoints(dispatcherProps?)` | function | `oidcEntrypoints` of `@owlmeans/web-oidc-rp` |
| `useLogin(target?)` | hook | `[href, onClick]` for a sign-in control |
| `useLogout(target?)` | hook | `onClick` for a sign-out control |
| `LoginOutcome`, `LoginIntent` | enum | Re-exported from `@owlmeans/client-auth/login` |
| `hasPermission(auth, permission, opts?)` | function | Re-exported from `@owlmeans/iam`; `opts` is `{ scope?, resourceId?, entitySlug? }` |
| `ORGANIZATION_REFUSAL`, `ORGANIZATION_OWNER_REFUSAL` | const | `AuthForbidden` reasons for a non-member and a non-owner |
| `CONSENT_LOGIN_PRECONDITION` | const | `'consent-before-login'` |
| `CLIENT_IAM_SERVICE` | const | `'client-iam-service'` — an alias constant nothing registers |

### Types

| Symbol | Purpose |
|---|---|
| `AppendIamOptions` | `{ consent?: ConsentLoginOptions }` |
| `ConsentLoginOptions` | `{ category?: string, disabled?: boolean }`; `category` defaults to `essential` |
| `OrganizationSwitchHelper` | `{ listOrganizations(), switchOrganization(entitySlug) }` |
| `OidcOrganizationItem` | One organization of the session |
| `LoginPlugin`, `LoginRequest`, `LogoutRequest`, `LoginService`, `LoginPrecondition`, `LoginMethod`, `LoginMethodSource`, `LoginScreenProps` | Re-exported from `@owlmeans/client-auth/login` |
| every `@owlmeans/iam` type | Re-exported with `export type *` |

## Common pitfalls

- Decorate the protocol tree with `withIamGuard` before binding it; the helpers never append
  declarations to an already flattened entrypoint list.
- Organization calls fail without the `iamEntrypoints()` bindings.
- Never write `auth` or the stored token by hand after a switch — `switchOrganization` already adopts
  the re-signed token; re-read `auth` afterwards.
- Organizations travel by `entitySlug` only; never send an organization's `entityId` from the
  browser.
- `ORGANIZATION_REFUSAL` / `ORGANIZATION_OWNER_REFUSAL` are reasons, not messages — phrase them for
  the person.
- `hasPermission` in a screen hides or shows a control; the server gate is the decision.
- A client without the provider's `organizations` scope lists no organizations and refuses every
  switch.

The `client-iam` skill covers this package; `login-plugins`, `web-oidc-rp` and `server-iam` cover
the machinery underneath and the server side.

## Related packages

- [`@owlmeans/web-oidc-rp`](../web-oidc-rp) — the OIDC guard, bindings and dispatcher
- [`@owlmeans/oidc`](../oidc) — shared OIDC protocols, `withOidcGuard`, organization types
- [`@owlmeans/client-auth`](../client-auth) — login service, plugins and `adoptToken`
- [`@owlmeans/consent`](../consent) — the consent store the precondition reads
- [`@owlmeans/web-consent`](../web-consent) — the consent dialog the precondition opens
- [`@owlmeans/iam`](../iam) — the permission model and `hasPermission`
- [`@owlmeans/server-iam`](../server-iam) — the server gate and organization management

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.51
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
