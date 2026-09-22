---
name: web-oauth
description: How to use @owlmeans/web-oauth — the browser half of OAuth sign-in: the consent, device-code and done screens, oauthEntrypoints, appendOAuthScreens, the useOAuthConsent hook, the suspend-then-dispatcher sign-in leg, the mandatory Tailwind @source line, the i18n resource and the data-testid contract. Auto-invoked when binding the OAuth screens in a web app, changing what the consent screen shows, diagnosing a person who is not returned to consent after signing in, or writing a test against these screens.
user-invocable: false
---

# @owlmeans/web-oauth

**Layer:** Web (React, shadcn + Tailwind v4)
**Install:** `"@owlmeans/web-oauth": "^0.1.18-rc.5"` in `dependencies`
**Contracts:** `@owlmeans/oauth` — aliases, `makeOAuthProtocols`, `oauthFlow`, `ConsentView`
**Server half:** `@owlmeans/server-oauth` (its `consentUrl`/`deviceUrl` must point at these screens)

## Key Exports

| Export | Description |
|--------|-------------|
| `oauthEntrypoints(opts?)` | `[bindScreen(consentScreen), bindScreen(deviceScreen), bindScreen(doneScreen)]` — spread into the app's entrypoint list. `opts` is `OAuthEntrypointOptions` (`parent?`, `path?`, `guard?`) |
| `appendOAuthScreens(ctx)` | Precondition check only: throws unless a `FLOW_STATE` resource is registered (call `appendFlowService` first). Returns the context |
| `OAuthConsentScreen` · `OAuthDeviceScreen` · `OAuthDoneScreen` | The screens (`RoutedComponent`s) |
| `useOAuthConsent(ref, aliases?)` | The headless logic: `{ stage, view, error, errorKind, approve, deny, switchAccount }` with `stage` in `checking | signing-in | loading | ready | deciding | done | error`; `errorKind` in `missing | not-found | expired | forbidden | failed` (`error` is the raw wire text, for a log — never rendered) |
| `OAUTH_I18N` (`'oauth'`) · `OAUTH_SUSPEND_TTL_MS` (10 min) | The library-tier i18n resource; how long a suspended sign-in stays valid |

The **consent API** (`load`/`approve`/`deny`) is bound by the *server* app, not here — the app binds
`loadConsent`/`approveConsent`/`denyConsent` from `@owlmeans/server-oauth` in its API context and
registers the same protocols in the web context's `bindAll` so `context.entrypoint(protocols.load)`
resolves. The three screens are `sticky`, parentless frontend routes (`/oauth/consent`,
`/oauth/device`, `/oauth/done`).

## Wiring

```tsx
import { appendOAuthScreens, oauthEntrypoints } from '@owlmeans/web-oauth'

appendFlowService(context)          // registers FLOW_STATE
appendOAuthScreens(context)
// entrypoints: ...oauthEntrypoints({ parent: account.base })  — the SAME opts the server passed
```

An app that builds its entrypoints from shared `managerProtocols` binds the three screens with
`bindScreen(protocols.consentScreen, handler(OAuthConsentScreen))` etc. — the components are
exported for exactly that. Translations register as a side effect of importing the package.

## The `@source` line — a consumer rule

Tailwind's scanner reads the CSS root plus `@source` directives and excludes `node_modules`, so a
class used only inside this package never reaches the app's stylesheet and the screens render
unstyled with nothing in the app's own sources to blame. Every consuming app adds:

```css
@source "../../../node_modules/@owlmeans/web-oauth/src";
```

Point at the shipped `src`, not `build`. Primitives (`button`, `card`, `input`, `label`) are private
under `src/@/` and imported only by relative specifiers — the consuming app's `@` alias is never part
of this package's runtime, and `tests/package-boundary.spec.ts` fails on any `from '@/…'`.

## The screens

- **Consent** — reads `?ref=` (a code grant's request id, or a device grant's user code; the server
  resolves which). Nothing is shown until the app is known to be authenticated; signed in, it calls
  `load`, shows the client's name and how it is known, the device name and `XXXX-XXXX` code, the
  redirect host (code grant), a localhost warning, and the scopes; **Approve** / **Deny**. Approve
  on a code grant does `window.location.href = redirect`; on a device grant it transits the flow to
  **Done** with `kind`/`ref` in the query. **It refuses to render when framed**
  (`window.top !== window.self`) — the approval click is exactly what a clickjacking overlay steals.
  **Use another account** (`oauth-consent-switch`) signs the session out (`auth.update(undefined)`) and
  goes through the same suspension, returning to this `ref`. Every failure is ONE translated sentence
  in `oauth-consent-error`, chosen by `errorKind` (`error-missing`, `error-not-found`, `error-expired`,
  `error-forbidden`, else the generic `error`) — the wire marker and stack are never shown. The kind is
  read from the marker in the message (`request-expired`, `request-not-found`, `forbidden`).
- **Device** — RFC 8628's `verification_uri`. Opened bare it shows an input for the code; opened
  with `?user_code=…` (`verification_uri_complete`) it goes straight on. Either way it runs the same
  `verify` → `next` → `consent` transition, so the two entries converge before anything else runs.
- **Done** — "you may close this window". The device variant says the connector will catch up on
  its own (`?kind=device`). Nothing to click; the MCP/CLI is polling.

## Signed out: suspend, dispatcher, come back

The consent screen never assumes a session. When `auth.authenticated()` is empty it builds
`makeFlowModel(oauthFlow)` (never the live flow slot), sets `ref`, transits the explicit `sign-in`
step, calls `suspendFlow(context, model, { expiresAt: now + OAUTH_SUSPEND_TTL_MS })` and sends the
browser to `DISPATCHER`. The chooser / Google / supervisor sign-in then lands through
`resumeSuspendedFlow` (the landing rule in `/login-plugins`, `/client-flow`) — back on the consent
screen with the **same `ref`**, now authenticated. What is stored is the destination entrypoint alias
plus the payload query, delete-on-read and expiry-checked, in `FLOW_STATE` (IndexedDB, so it survives
Google's full-page round trip). A plugin that still navigates to `HOME` instead of the landing breaks
this leg silently.

## `data-testid` contract

`oauth-consent-card`, `oauth-consent-client`, `oauth-consent-code`, `oauth-consent-approve`,
`oauth-consent-deny`, `oauth-consent-switch`, `oauth-consent-error`, `oauth-device-card`, `oauth-device-input`,
`oauth-device-submit`, `oauth-done-card`. Do not rename them — the end-to-end suites that drive
sign-in address these.

## i18n

Library-tier resource `oauth`, all seven languages (`en pl ru be uk es de`) under `src/i18n/`;
sections `consent`, `device`, `done`. `tests/i18n.spec.ts` fails when a language lacks a key English
has — add a key to all seven. An app overrides a string at its own tier; it does not fork a screen.

## Testing

Category D (`/testing-ui`) — `bun test ./tests` drives a real chromium against a real app, with only
the server absent:

- **Harness** (`tests/context.ts` boots Vite; `tests/harness/mount.tsx` is the app). It is the real
  `@owlmeans/web-client` context (auth service, IndexedDB resources, History-API router, the real
  dispatcher), the real flow service, `oauthEntrypoints()`, and the consent API bound with `bindAll`
  under a backend parent declared on the harness's own origin. The context stays un-initialized so the
  router compiles its routes.
- **Server stubs** are `page.route` answers on that origin (`tests/helpers.ts` `open(path, { stubs })`):
  `load`/`approve`/`deny` return a `ConsentView`, a `{ redirect }`, or a refusal in the wire shape
  `type|||message|||stack`. Nothing needs CORS and no live server is reached. `authenticate: true`
  also answers the dispatcher's token exchange.
- **A signed-in visit** is `?bearer=<makeBearer(USER)>`: the harness writes the record the auth
  service reads back (`idb-keyval` `auth:user`) BEFORE the app renders — services are not initialized
  yet, so `context.auth().update()` is not available at that point. `?lng=` picks the language.
  `window.__oauth.suspended()` / `.token()` read the real flow store and auth service back.
- **What is covered:** signed-out suspension (record, expiry, dispatcher, no request made); the full
  sign-in round trip back to the same `ref`; device and code grants (client, code, device, redirect
  host, the localhost warning, approve/deny each way, `location` follows the redirect); every failure as
  one sentence; the framed refusal (an iframe of `tests/harness/frame.html`, the framed app carrying its
  own `bearer`); use-another-account; the device screen bare and linked; the done screen; and the
  consent screen in all seven languages.
- Also `package-boundary.spec.ts` (no consumer aliases in source) and `i18n.spec.ts` (7-language parity).

A test of a refusal that the screen would otherwise hide still asserts what is ABSENT (no approve or
deny button, no wire text) — the point of those cases is that nothing can be approved.
