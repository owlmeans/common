# @owlmeans/web-auth-email

The browser half of OwlMeans e-mail sign-in: the "Continue with email" method and its card (a
mailed PIN, or a password where the deployment offers one), the post-sign-in "set a password" step,
and the password panel for a settings screen — in eight languages. The contracts live in
`@owlmeans/auth-email`; the server half is `@owlmeans/server-auth-email`.

## Overview

- `appendEmailLogin(ctx, { protocols, screen?, method?, offer? })` — the whole wiring, explicit
  (importing the package registers no plugin): the client service, the `email` method, the offer
  step and the strings
- `emailAuthEntrypoints(protocols)` — the offer screen, bound, for the entrypoint list
- `EmailLoginScreen` / `LocalizedEmailLoginScreen` — the card; `useEmailLogin()` — its headless model
- `registerEmailLoginScreen(ctx, Component)` — replace the card entirely
- `PasswordOfferScreen` — the post-sign-in offer
- `PasswordPanel` (pure), `usePassword(aliases?)` (I/O), `ConnectedPasswordPanel` (both)
- `emailLoginStateHelper`, `emailRefusalHelper`, `emailStorageHelper`, `passwordPanelHelper` —
  the pure parts, for a replacement UI or a test
- `cn` — the class-name merger the components are written against

## Installation

```bash
bun add @owlmeans/web-auth-email@^0.2.0-alpha.0
```

The package ships its own private shadcn primitives (`alert`, `button`, `card`, `input`, `label`)
and imports them with relative specifiers; consumers provide the React, Radix (`react-label`,
`react-slot`), `lucide-react` and Tailwind peers. It does not depend on `@owlmeans/web-panel`.

## The `@source` line — required

Tailwind's scanner excludes `node_modules`, so add the package's `src` (and `@owlmeans/web-captcha`'s)
to the app's Tailwind entry:

```css
@source "../../../node_modules/@owlmeans/web-auth-email/src";
```

## Usage

```ts
import { bindAll } from '@owlmeans/client-entrypoint'
import { makeEmailAuthProtocols } from '@owlmeans/auth-email'
import { appendEmailLogin, emailAuthEntrypoints } from '@owlmeans/web-auth-email'

export const emailAuth = makeEmailAuthProtocols({ guards: [DEFAULT_GUARD], gate: { alias: APP_GATE } })

// makeContext
appendEmailLogin(context, { protocols: emailAuth, screen: { Logo: AppLogo, footer: <AppFooter /> } })

// entrypoints
export const entrypoints = [...framework, ...bindAll(emailAuth as never), ...emailAuthEntrypoints(emailAuth)]
```

The chooser then offers "Continue with email" (`[data-login-method="email"]`), and its card answers
at `/authentication/login/email`. A sign-in ends like every self-contained plugin's: the token is
adopted through the client auth service and `loginLandingOf(ctx).landAfterLogin()` lands — a pending
step (marketing consent, then the password offer), a parked target, else home.

A settings screen renders the password panel:

```tsx
<ConnectedPasswordPanel />                       // the tree given to appendEmailLogin
<ConnectedPasswordPanel aliases={myAliases} />   // routes mounted under the app's own aliases
```

With a password set, the panel also offers the new-device PIN switch when the server reports
`devicePin` in the status: "Stop asking for a code on new devices" / "Ask for a code on new
devices", confirmed by a mailed code like every other action.

## Customising

| What | How |
|---|---|
| The chooser button | `appendEmailLogin({ method })`, or `cfg.security.auth.login.overrides.email` (label, icon, order, emphasis, `hidden`, `enabled`) and `methods` (allow-list and order) |
| The card | `screen`: `Logo`, `title`, `subtitle`, `footer`, `className`, `containerClassName`, `style`, `locale`, `translate` — the chooser card's own props |
| Everything | `registerEmailLoginScreen(ctx, MyScreen)` with `useEmailLogin()` inside |
| Strings | an app-tier bundle over `lib : auth-email` (below) |
| Tests and styling | `data-email-login-*`, `data-email-offer-*`, `data-email-password-*` hooks |

## Translations

`lib : auth-email` (`login.*`, `offer.*`, `password.*`, `error.*`) in `en`, `pl`, `ru`, `be`, `uk`,
`es`, `de`, `fr`, plus `login.method.email` in the `auth` resource. The captcha notice is the captcha
client's own text in the card's language — the default of `captcha.notice` and its link labels
(`captcha.<link>`), which an app may override too. Override any string at the app tier, in the
library namespace:

```ts
import { i18nHelper, LIB_NAMESPACE } from '@owlmeans/i18n'

i18nHelper.addI18nApp('en', 'auth-email', { login: { title: 'Sign in to Acme' } }, { ns: LIB_NAMESPACE })
```

## Behaviour worth knowing

- The device id is 16 random bytes in `localStorage` (`owlmeans:auth-email:device`); the offer ticket
  waits in `sessionStorage` (`owlmeans:auth-email:offer`), bound to the account and its 15 minutes.
  A browser that refuses storage still signs in (an ephemeral device id, no offer).
- A captcha token is fetched right before each send-PIN and password sign-in when the deployment
  asks for one, from the page's registered client of the provider the server advertises
  (`captchaClients` of `@owlmeans/web-captcha`; register it explicitly, e.g. `appendRecaptchaClient()`
  of `@owlmeans/web-captcha-recaptcha`). Without that client the call is refused as
  `captcha-unavailable`, never sent without a token. The client's notice is shown when it has one.
- Refusals are phrased from the error or, in production, the HTTP status alone: 401 is a wrong code
  or wrong credentials, 403 a refused captcha or confirmation code, 429 too many attempts, 422 a
  password outside the policy, 409 an expired offer, 404 passwords off, 503 an outage.
- No control is ever natively `disabled`: a blocked action carries `aria-disabled` and says why.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.0
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
