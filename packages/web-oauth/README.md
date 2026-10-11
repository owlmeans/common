# @owlmeans/web-oauth

The browser half of `@owlmeans/oauth`: the consent, device-code and done screens an OAuth 2.1
sign-in ends on, the headless `useOAuthConsent` hook behind the consent screen, and
`oauthEntrypoints()` that binds the three screens into a web app. A web app uses it when its server
runs `@owlmeans/server-oauth` and points `consentUrl` / `deviceUrl` at these screens. It renders no
API itself — the consent `load` / `approve` / `deny` handlers come from `@owlmeans/server-oauth`, and
the protocols, flow and `ConsentView` shape from `@owlmeans/oauth`. An app that does not act as an
OAuth authorization server (MCP / CLI connectors) does not need it; signing a person in to an
external OpenID provider is `@owlmeans/web-oidc-rp`.

## Installation

```bash
bun add @owlmeans/web-oauth@^0.1.18-rc.24
```

Peer dependencies: `react`, `react-dom`, `tailwindcss`, `@radix-ui/react-label`,
`@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`.

## Concepts

- **Screens** — three `RoutedComponent`s: `OAuthConsentScreen` (`/oauth/consent?ref=…`),
  `OAuthDeviceScreen` (`/oauth/device`, RFC 8628 `verification_uri`) and `OAuthDoneScreen`
  (`/oauth/done`). Full-page, no application chrome.
- **Ref** — the `?ref=` the consent screen reads: a code grant's request id or a device grant's user
  code; the server decides which.
- **Consent flow** — `oauthFlow` from `@owlmeans/oauth`. The screens transit it with `makeFlowModel`
  instead of hard-coding the next screen (`verify` → `next` → `consent`, `consent` → `approve` /
  `deny` → `done`).
- **Sign-in leg** — a signed-out visitor is not refused: the flow is suspended at its `sign-in` step
  in `FLOW_STATE` for `OAUTH_SUSPEND_TTL_MS` and the browser goes to the dispatcher; after sign-in the
  landing resumes back on the consent screen with the same `ref`.
- **Headless hook** — `useOAuthConsent` holds all consent logic; the component is a thin shell over
  the package's private shadcn primitives.

## Usage

### Wire the screens into a web app

`appendOAuthScreens` only checks that a `FLOW_STATE` resource is registered, so it runs after
`appendFlowService` (`@owlmeans/web-flow`). The screens are bound by spreading `oauthEntrypoints()`
into the app's entrypoint list, with the same `OAuthEntrypointOptions` the server passed to
`makeOAuthProtocols`.

```tsx
import { appendFlowService } from '@owlmeans/web-flow'
import { appendOAuthScreens, oauthEntrypoints } from '@owlmeans/web-oauth'

const context = makeContext(cfg)
appendFlowService(context)   // registers FLOW_STATE
appendOAuthScreens(context)  // throws SyntaxError when FLOW_STATE is missing

context.registerEntrypoints([
  ...entrypoints,
  ...oauthEntrypoints({ parent: account.base }),
])
```

The web context must also know the consent API protocols so `context.entrypoint(protocols.load)`
resolves; the harness registers them with `bindAll` from `@owlmeans/client-entrypoint`:

```tsx
import { bindAll } from '@owlmeans/client-entrypoint'
import { makeOAuthProtocols } from '@owlmeans/oauth'

const consentApi = makeOAuthProtocols({ parent: API_BASE })

context.registerEntrypoints(bindAll({
  apiBase,
  oauth: { base: consentApi.base, load: consentApi.load, approve: consentApi.approve, deny: consentApi.deny },
}))
```

### Bind the components yourself

An app that builds its entrypoints from shared protocols binds the exported components directly:

```tsx
import { handler } from '@owlmeans/client'
import { bindScreen } from '@owlmeans/client-entrypoint'
import { makeOAuthProtocols } from '@owlmeans/oauth'
import { OAuthConsentScreen, OAuthDeviceScreen, OAuthDoneScreen } from '@owlmeans/web-oauth'

const protocols = makeOAuthProtocols({ parent: account.base })

export const screens = [
  bindScreen(protocols.consentScreen, handler(OAuthConsentScreen)),
  bindScreen(protocols.deviceScreen, handler(OAuthDeviceScreen)),
  bindScreen(protocols.doneScreen, handler(OAuthDoneScreen)),
]
```

### Make Tailwind see the package classes

Tailwind skips `node_modules`, so a class used only inside this package never reaches the app
stylesheet. Every consuming app adds a `@source` line pointing at the shipped `src`:

```css
@source "../../../node_modules/@owlmeans/web-oauth/src";
```

### Build a custom consent screen on the hook

```tsx
import type { RoutedComponent } from '@owlmeans/client'
import { useContext } from '@owlmeans/client'
import { useOAuthConsent } from '@owlmeans/web-oauth'

export const MyConsentScreen: RoutedComponent = () => {
  const context = useContext()
  const [query] = context.router().useSearchParams()
  const { stage, view, errorKind, approve, deny, switchAccount } = useOAuthConsent(query.get('ref'))

  if (stage === 'error') return <p role="alert">{errorKind}</p>
  if (stage !== 'ready' && stage !== 'deciding' || view == null) return <p>…</p>

  return (
    <div>
      <h1>{view.client.name}</h1>
      <p>{view.scopes.join(', ')}</p>
      <button disabled={stage === 'deciding'} onClick={() => void deny()}>Deny</button>
      <button disabled={stage === 'deciding'} onClick={() => void approve()}>Approve</button>
      <button onClick={() => void switchAccount()}>Use another account</button>
    </div>
  )
}
```

`approve()` on a code grant sets `window.location.href` to the server's redirect; on a device grant
it navigates to the done screen with `kind` / `ref` in the query.

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `oauthEntrypoints(opts?)` | function | `[consentScreen, deviceScreen, doneScreen]` bound with `bindScreen`; `opts` is `OAuthEntrypointOptions` (`parent?`, `path?`, `guard?`) |
| `appendOAuthScreens(ctx)` | function | Throws `SyntaxError` unless `FLOW_STATE` is registered; returns the context |
| `useOAuthConsent(ref, aliases?)` | hook | `UseOAuthConsent` — the consent screen's logic |
| `OAuthConsentScreen` | component | Reads `?ref=`, signs in if needed, shows the request, approve / deny / switch account |
| `OAuthDeviceScreen` | component | Code input; with `?user_code=` it proceeds without rendering |
| `OAuthDoneScreen` | component | Final "you may close this window"; `?kind=device` picks the device message |
| `OAUTH_I18N` | const | `'oauth'` — the library-tier i18n resource |
| `OAUTH_SUSPEND_TTL_MS` | const | `600000` — how long a suspended sign-in stays valid |
| `UseOAuthConsent` | type | `{ stage, view, error, errorKind, approve, deny, switchAccount }` |
| `ConsentStage` | type | `checking` \| `signing-in` \| `loading` \| `ready` \| `deciding` \| `done` \| `error` |
| `ConsentErrorKind` | type | `missing` \| `not-found` \| `expired` \| `forbidden` \| `failed` |

`error` is the raw message for logging; `errorKind` is derived from the wire markers
`request-expired`, `request-not-found` and `forbidden`.

## Screen behaviour

- **Consent** shows the client name and how it is known (`cimd` host, `dcr` unverified, or known),
  the device code and name, the redirect host, a warning when the client only registered localhost
  addresses, and the scopes. It refuses to render inside a frame (`window.top !== window.self`).
- Every failure is one translated sentence (`error-missing`, `error-not-found`, `error-expired`,
  `error-forbidden`, or the generic `error`); the wire text is never shown.
- **Use another account** calls `auth.update(undefined)` and goes through the same suspension.

## i18n

Resource `oauth` with sections `consent`, `device` and `done`, shipped in `en`, `pl`, `ru`, `be`,
`uk`, `es`, `de` and `fr`. Translations register as a side effect of importing the package; an app
overrides a string at its own tier instead of forking a screen.

## Testing

`data-testid` contract: `oauth-consent-card`, `oauth-consent-client`, `oauth-consent-code`,
`oauth-consent-approve`, `oauth-consent-deny`, `oauth-consent-switch`, `oauth-consent-error`,
`oauth-device-card`, `oauth-device-input`, `oauth-device-submit`, `oauth-done-card`.

`bun test ./tests` drives Chromium against a Vite harness built on the real `@owlmeans/web-client`
context; the consent API is answered with `page.route` stubs on the same origin.

## Common pitfalls

- Missing the `@source` line — the screens render unstyled and nothing in the app's sources explains
  why.
- Calling `appendOAuthScreens` before `appendFlowService` — it throws by design.
- Passing different `OAuthEntrypointOptions` to the server and the web app — the screens then call
  consent routes the server never mounted.
- A sign-in plugin that navigates to `HOME` instead of resuming the flow landing breaks the return to
  the consent screen silently.
- Renaming a `data-testid` breaks the end-to-end suites that drive sign-in.
- Importing primitives through the app's `@/` alias inside package source; `tests/package-boundary.spec.ts`
  fails on it.
- A key added to `en.json` must be added to every language file; `tests/i18n.spec.ts` checks parity.

The `web-oauth` skill covers the sign-in leg, the screens and the test harness in more depth; the
`oauth` and `server-oauth` skills cover the shared contracts and the server.

## Related packages

- [`@owlmeans/oauth`](../oauth) — protocols, `oauthFlow`, `ConsentView`, `OAuthEntrypointOptions`
- [`@owlmeans/server-oauth`](../server-oauth) — authorization server and the consent API handlers
- [`@owlmeans/web-flow`](../web-flow) — `appendFlowService`, which registers `FLOW_STATE`
- [`@owlmeans/client-flow`](../client-flow) — `flowLandingOf`, suspend and resume
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — `bindScreen`, `bindAll`
- [`@owlmeans/web-client`](../web-client) — the web context the screens run in
- [`@owlmeans/web-auth-token`](../web-auth-token) — personal access token panel with the same hook/component split

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.53
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
