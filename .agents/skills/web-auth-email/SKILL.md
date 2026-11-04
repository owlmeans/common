---
name: web-auth-email
description: How to use @owlmeans/web-auth-email — the browser half of OwlMeans e-mail sign-in. appendEmailLogin (explicit, never a side-effect import) registers the client service, the "Continue with email" login method, its own card at /authentication/login/email that mirrors the chooser card and shares its customisation levers, the post-sign-in "set a password" offer step and the eight-language strings; emailAuthEntrypoints binds the offer screen; useEmailLogin is the headless model; PasswordPanel / usePassword / ConnectedPasswordPanel manage a password from a settings screen. Covers the device id and offer ticket storage, captcha use, refusal phrasing, the @source line and the data-email-* hooks. Auto-invoked when adding e-mail sign-in to a web app, customising or replacing the e-mail card, rendering the password panel, or writing an e2e against the e-mail card.
user-invocable: false
---

# @owlmeans/web-auth-email

**Layer:** Web (L11 — `client-auth`, `client-entrypoint`, `client-i18n`, `web-captcha`, `auth-email`; NOT `web-panel`)
**Install:** `"@owlmeans/web-auth-email": "^0.1.20-rc.0"` in `dependencies`
**Peers:** React, `react-dom`, `@radix-ui/react-{label,slot}`, `class-variance-authority`, `clsx`,
`lucide-react`, `tailwind-merge`, `tailwindcss`

## Wiring

```typescript
import { bindAll } from '@owlmeans/client-entrypoint'
import { appendEmailLogin, emailAuthEntrypoints } from '@owlmeans/web-auth-email'

// makeContext, beside appendLoginScreen
appendEmailLogin(context, { protocols: emailAuthProtocols, screen: { Logo: AppLogo, footer: <AppFooter /> } })

// entrypoints: the API routes the browser calls — the tree minus `tech` (cast: the frozen tree has
// no index signature) — then the offer screen
const { base, options, pin, signIn, password } = emailAuthProtocols
export const entrypoints = [
  ...framework,
  ...bindAll({ base, options, pin, signIn, password } as never),
  ...emailAuthEntrypoints(emailAuthProtocols),
]
```

`appendEmailLogin(ctx, { protocols, screen?, method?, offer? })` does everything beyond binding:

- the client service `EMAIL_LOGIN_SERVICE` over `protocols` (a thin transport — every call rejects
  with its route's error; `options()` cached after the first success);
- the `email` `AuthenticationPlugin`: `requiresRenderer: false`, method `{ id: 'email', i18nKey:
  'email', icon: 'mail', order: 20, emphasis: 'secondary', ...opts.method }`, and `available`
  asking for the client service — a bundle that merely contains the package never grows a button;
- the offer `LoginStep` (`offer !== false`), priority `-10`, below marketing consent (`0`);
- the `auth-email` library strings and `login.method.email` in the `auth` resource, 8 languages.

**Explicit by design** — importing the package registers nothing. Bind the API routes the browser
calls and leave `tech` out: the developer routes are Ed25519-signed operator calls, never the
browser's. `registerEmailLoginScreen(ctx, C)` must come after `appendEmailLogin`.

## The card mirrors the chooser

The method button opens its own card at `/authentication/login/email` (the typed authentication
route). It is the chooser card's twin, customised with the SAME levers:

| What | How |
|---|---|
| The chooser button | `appendEmailLogin({ method })`, or `cfg.security.auth.login.overrides.email` (label, icon, order, emphasis, `hidden`, `enabled`) and `methods` (allow-list + order) |
| The card | `screen` = `Pick<LoginScreenProps, 'Logo' \| 'title' \| 'subtitle' \| 'footer' \| 'className' \| 'containerClassName' \| 'style' \| 'locale' \| 'translate'>` — a host's own props win |
| Everything | `registerEmailLoginScreen(ctx, MyScreen)` built on `useEmailLogin()` |
| Strings | an app-tier bundle over `lib : auth-email`, `{ ns: LIB_NAMESPACE }` |

Like `LoginScreen` it centres the card in an INLINE `minHeight: 100dvh` (never a class — a stale
`@source` scan drops a new utility), its default footer is the chooser's credit line
(`resolveCredit`), and "Other sign-in options" (`data-email-login-other`) leads back to the
dispatcher.

## The flow (`useEmailLogin`)

e-mail → `options` → "Receive authentication PIN code" (a captcha token for `email_pin` when
`options.captcha`) → PIN field (`inputMode=numeric`, `autocomplete=one-time-code`, resend, change
address) → signed in. "Already set a password? Use it" appears only when `options.password`: a
password field (show/hide, `autocomplete=current-password`) with a captcha token for
`email_password`; a `{ challenge, reason: 'device' }` answer switches to PIN entry with the
unknown-device notice. The current UI language rides on every PIN request as `locale`. Completion
is every self-contained plugin's: keep the offer ticket, adopt the token through the client auth
service, `loginLandingOf(ctx).landAfterLogin()` — a pending step (marketing consent, then the
offer), a parked flow, else home.

- Device id: 16 random bytes base64url in `localStorage` `owlmeans:auth-email:device`; offer ticket
  in `sessionStorage` `owlmeans:auth-email:offer`, bound to the account and its 15 minutes. Refused
  storage still signs in (an ephemeral device id, no offer).
- The offer step is pending only while a ticket of THIS account is stored AND the status says
  enabled, unset, not declined; a status read that fails is "not pending" (fails open).
  `PasswordOfferScreen`: set (new + repeat) or "Not now" (decline); both continue the login.
- With a captcha, Google's notice (`CaptchaNotice`) is shown and the badge hidden (`web-captcha`).

## Password panel

`PasswordPanel` is pure (props in, callbacks out); `usePassword(aliases?, { locale })` does the I/O
over injectable entrypoint aliases; `ConnectedPasswordPanel` joins them and sends the interface
language. States: feature off (a notice), no password (Set), password set (Change, Remove); each
action is "send code" → PIN (+ new password fields) → confirm, the PIN mailed to the account's own
address. The panel renders a complete `Card` — a host that puts it inside its own card flattens it
with direct-child `data-slot` selectors rather than nesting cards.

## Rules

- **`@source` is required**: `@source "../../../node_modules/@owlmeans/web-auth-email/src";` — its
  private shadcn primitives (`alert`, `button`, `card`, `input`, `label`, imported relatively) carry
  classes the app's Tailwind scan never sees otherwise. `web-captcha` renders nothing and needs none.
- **No control is natively `disabled`**: a blocked action carries `aria-disabled` and says why (a
  Playwright click on it needs `{ force: true }`).
- **Refusals are phrased from the error, or the status alone** (`emailRefusalHelper`): 401 wrong
  code or credentials, 403 refused captcha or confirmation, 429 too many attempts (retry-after),
  422 weak password, 409 expired offer, 404 passwords off, 503 an outage.
- A new string goes into all eight `src/i18n/<lng>.json` files (`tests/i18n.spec.ts` checks parity
  and every `t()` key).

## Test hooks

`data-email-login-screen` / `-card` / `-form` (`email` \| `pin` \| `password`) / `-email` /
`-send` / `-pin` / `-submit` / `-resend` / `-change` / `-use-password` / `-use-pin` / `-password` /
`-captcha` / `-error` (`data-refusal`) / `-other` / `-done`; `data-email-offer` (`data-state="leaving"` when nothing is left to offer) / `-password` /
`-repeat` / `-save` / `-skip` / `-error`; `data-email-password-*` on the panel. `@owlmeans/test-ui`'s
`loginViaEmailForm` drives them.

## Related

`auth-email` · `server-auth-email` · `login-methods` (the chooser, `overrides`, the credit line) ·
`login-plugins` (steps and landing) · `web-auth-token` (the same pure-panel + hook shape) ·
`web-captcha` · `testing-ui`
