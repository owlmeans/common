---
name: login-methods
description: The identity-provider choice screen — how a sign-in method is declared, where methods come from, the configuration that decides what is offered, the terms confirmation and credit line, and how a dispatcher composes it. Read before touching a dispatcher, adding an authentication method, or changing what a sign-in screen shows.
user-invocable: false
metadata:
  scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# The sign-in method choice

A dispatcher never chooses an identity provider for the user. It handles the RETURN leg — a token,
an authorization code, an error in the URL — and the already-authenticated check; when there is
nothing to return from, it renders the choice and **starts nothing**.

The chooser is the generalised `Gesture` rendering the dispatcher already had: a method button IS
the user gesture, which is also what makes framed sign-in work at all, because the window a framed
app must open can only be opened inside one.

## Where each piece lives

| Piece | Package |
|---|---|
| `SecurityConfig.auth.login`, `BrandSettings`, the `OWLMEANS_*_URL` defaults | `@owlmeans/config` |
| `AuthMethodMeta` on `AuthenticationPlugin`; `registerAuthPlugin` / `getAuthPlugin` / `listAuthPlugins` | `@owlmeans/client-auth/manager/plugins` |
| `LoginMethod`, the source registry, terms/credit resolvers, the screen slot, the plain fallback screen, the copy | `@owlmeans/client-auth/login` |
| `useLoginMethods` — the headless model | `@owlmeans/client-panel/auth` |
| The rendered shadcn screen and `appendLoginScreen` | `@owlmeans/web-panel` |
| `cfg.oidc.providers[]` → methods | `@owlmeans/web-oidc-rp` |

Two import directions are load-bearing:

- **A relying party must never import a UI family.** `web-oidc-rp` importing `web-panel` would
  force a `mui-oidc-rp → mui-panel` twin and make every relying party pick one. Instead
  `LoginService` carries `registerScreen`/`screen`, and a dispatcher renders
  `login().screen() ?? FallbackLoginScreen`.
- **`manager/plugins → login/methods`, never the reverse.** `@owlmeans/client-auth/login` is what
  every generated target pulls in through `client-iam`; the reverse edge would drag the manager's
  React plugin implementations into every target bundle *and* side-effect-register three
  authentication methods the app never asked for.

## Declaring a method

An `AuthenticationPlugin` gains one optional field. Everything in it is optional, so no existing
plugin object changes:

```typescript
requiresRenderer?: boolean   // plugin level: the Implementation throws without an assigned Renderer

method?: {
  id?: string          // defaults to the plugin's `type`
  label?: string       // literal fallback when no translation resolves
  i18nKey?: string     // under `auth`'s `login.method.*`; defaults to the id
  icon?: string        // a registry NAME, never markup — this package has no icon library
  order?: number       // ascending; default 100
  emphasis?: 'primary' | 'secondary' | 'link'
  restricted?: boolean // never offered unless the configuration asks for it BY NAME
  hidden?: boolean     // registered, never a choice
  available?: (ctx: LoginMethodContext) => boolean  // per context, at render time
}
```

**Absent `method` means the plugin is never OFFERED** — still reachable by type, which is what a
step-inside-another-flow (`re-captcha`) needs.

**`restricted` is the operator-login gate.** A restricted method appears only where the
configuration named it in `methods` or enabled it in `overrides`. Registering the plugin is
deliberately not enough: an operator login that shows up wherever its code happens to be bundled
is an operator login in production.

**`i18nKey` when the type is not the key.** The default key IS the plugin's type, so a plugin whose
type is a machine id (`google-oauth`) and whose translation lives under a human key (`google`) must
say so — otherwise the untranslated fallback puts the raw type on the button.

### A method must be able to RUN where it is offered

Registration proves only that some module reached the bundle, and modules arrive in groups: an app
that wanted one method out of a package gets every method that package registers. `pluginMethodSource`
therefore drops a plugin on three counts, and a new plugin has to answer all three.

| Gate | Field | The button it prevents |
|---|---|---|
| Not a sign-in method | no `method` / `hidden` | `re-captcha` offered as a way in |
| Cannot render | `requiresRenderer` + no `Renderer` | opens a screen that throws `Renderer is not defined` |
| Not wired here | `method.available` returns false | starts a flow whose first act is a failed service lookup |

**`requiresRenderer` is declared, never inferred.** A plugin that renders its own form and one that
throws on mount are the same object until the screen mounts. `@owlmeans/client-auth` ships no UI
family, so `basic-ed25519`, `wallet-consumer` and `re-captcha` declare it and get their `Renderer`
from a panel package's side-effect module (`@owlmeans/web-panel/auth/plugins`,
`@owlmeans/mui-panel/auth/plugins`). An app that never imports one of those must not be offered
them — `@owlmeans/web-panel`'s own index does NOT pull that module in, so "the app uses web-panel"
is not the same as "the renderers are assigned".

**`available` is where a plugin admits it does not apply.** `oidc-client` shares a side-effect
import with `google-oauth`, so wiring Google alone used to put a generic provider button on the
screen; it now asks `ctx.context.hasService(OIDC_RP)`, which is registered by `appendOidcGuard` and
by nothing else. Check the thing the flow will actually reach for — a registered service, an
advertised provider list — not a proxy for it.

## Where methods come from

Sources, not a list. `registerMethodSource({ alias, list })` — globally, or per context through
`login().registerMethodSource(...)`. Two ship:

- `pluginMethodSource` — every registered plugin carrying `method`.
- `oidcMethodSource` — `cfg.oidc.providers[]`, honouring `restrictedProviders` (`false` = none,
  `true` = the default one, an array = an allow-list) and dropping `internal` ones.

**When the browser knows of no provider by name, the OIDC source still yields ONE generic method.**
That is the ordinary case for a generated application: `oidc` is not advertised by
`api-config-server` and a target registers no `apiConfigMiddleware`, so its browser has no provider
list at all and the server's own default selection decides which issuer the flow reaches. Yielding
nothing there would leave a working application with an empty sign-in screen.

A source that throws is skipped, not fatal: a misconfigured provider list must not remove the
method that does work.

## Configuration

`cfg.security.auth.login` — `enabled`, `methods` (an ordered allow-list, which is also the order),
`overrides`, `secretKey`, `autoSelectSingle`, `terms`, `credit`, `title`, `subtitle`.

**Nothing is ever started automatically.** `autoSelectSingle` defaults to `false` and is further
suppressed while the terms are unconfirmed or the document is embedded, so a single-method app
still renders its screen. A `?method=` marker carried into a surrogate window is not an
auto-redirect: the user already chose, one window up.

**Dev-only methods ride `cfg.debug.supervisor`, never `cfg.debug.all`.** Whole families of
applications set `debug.all` for reasons that have nothing to do with authentication — a generated
target sets it for itself — so gating on it hands an operator login to every one of them.

## A method must never fail silently

`LoginOutcome.Passed` means "the plugin did nothing — carry on with the ordinary continuation".
A **dispatcher** has such a continuation. A **screen** does not: the user clicked, the document did
not move, and if nothing renders the button is indistinguishable from a broken one.

`loginAttemptError(outcome)` (`@owlmeans/client-auth/login`) is the single reading of a finished
attempt — `Passed`/`Failed` → `login.error.failed`, `Gesture` → `login.error.blocked`, everything
else → null. A screen renders a thrown `model.error` first (it names the fault) and this second.
A `start` that cannot proceed should **throw**, not return `Passed`.

This is not hypothetical: the generic OIDC method returned `Passed` whenever it could not build an
authorization URL, and a generated application's only sign-in button did nothing, reported nothing,
and logged nothing.

## The OIDC flow must be at the step that can authorize

`stdOidcFlow.initialStep` is `Dispatch`. `OidcAuthService.authenticate` answers **only** from
`Ephemeral` and returns null from anywhere else — so a flow that was merely booted yields no URL,
forever.

`enterOidcAuthorization(model)` (`@owlmeans/client-auth/login`) is that transition: it targets the
step's own service, defaults the entity (the init endpoint rejects a body without one, even though
it resolves the provider by `def` alone), and transits to `Ephemeral` when the target is
`FLOW_PLACEHOLDER` — which is the generated-application case, where the app is its own authority.
Idempotent, so call it before every `authenticate`.

`@owlmeans/client-auth`'s own `DispatcherHOC` has always done this inline. **A relying party that
REPLACES that dispatcher inherits the requirement without the code** — that is precisely how
`web-oidc-rp` shipped a chooser whose every method was a no-op. Call the helper; never re-derive
the transition.

## The consumer's primitives, not ours

The published screen imports `@/components/ui/button` **unresolved**, so it renders through the
consuming application's vendored shadcn copy — deliberately, so the screen matches their theme.
The consequence: it inherits that copy's age. A `cursor-pointer` that current shadcn puts in the
button's base was missing from an older vendored one, and the only control on the page showed an
arrow. State any behaviour the screen actually depends on in the screen's own `className`.

## The terms confirmation

Method buttons carry `aria-disabled` and `data-blocked`, **never the HTML `disabled` attribute**.
A disabled button swallows the click, so a user who has not confirmed presses it and is told
nothing at all — the screen simply seems broken. A blocked click instead sets `attempted`, renders
the requirement in `role="alert"` and focuses the checkbox.

(Playwright honours `aria-disabled` in its actionability check, so a test that clicks a blocked
control needs `{ force: true }` — that is the control behaving as designed, not a test workaround.)

Acceptance is recorded in `localStorage` against a version derived from the resolved URLs, so
changing a document re-asks and a same-origin surrogate window does not ask twice.

The control is a **native `<input type="checkbox">`** inside the existing `label` primitive:
`web-panel` ships no `checkbox` primitive, and forcing every consumer to vendor one plus its Radix
peer in order to render a sign-in screen would break every app already on the package.

## The credit line

`resolveCredit` composes "Powered by OwlMeans" (`poweredBy`, default true) beside a **copyright
notice**, not a bare name: `© <year> <holder>`. The mark and the year are what make a footer a
notice rather than a caption, so `copyright` defaults to on and an app that meant to assert one
does not have to spell it into a literal.

- `holder` — defaults to the organization, then the product. The organization falls back to its
  SLUG, because an organization record carries no readable name: "no name" is the ordinary case,
  not an error.
- `since` — a first year in the past renders a range (`© 2019–2026`); the current year, or a year a
  skewed clock puts ahead of it, renders a single year.
- `copyright: '<text>'` — an owner's own wording, used verbatim in the notice's place.
- `copyright: false` — the bare `product — organization` pairing this line used to be.
- `line` — replaces the whole composition, notice included.

The product is named beside the notice only when it is not itself the holder: `OwlMeans — © 2026
OwlMeans` says the name twice.

**An EMPTY string is unset, everywhere in this resolver.** Its inputs come from build-time
environment a platform delivers, and every undelivered key arrives as `''`
(`BRANDING_ORGANIZATION: meta.brandingOrganization ?? ''`). `??` does not fall through an empty
string, so a plain nullish chain lets an undelivered organization win and composes a line ending
in a bare dash. Normalise each candidate before the chain, never after it.

## Layout

The screen is rendered straight out of a dispatcher, into a chain that carries no height — so it
sets its own `100dvh` and centres the card in it. **A percentage minimum (`min-h-full`) collapses
to the content** and leaves the card at the top of an otherwise empty page.

**That height is an INLINE style, not `min-h-dvh`, in the styled screen too.** A `web-panel` class
reaches a consuming app's stylesheet only through its `@source` scan of this package's `src`, and a
class NEW to that stylesheet is exactly what such a scan can be stale about — a running Vite dev
server picks up the rebuilt `build/*.js` through HMR while its Tailwind scan of a symlinked
`node_modules` path does not re-run, so the markup updates and the rule never arrives. Every other
utility on that box already exists in any app that renders anything; a missing height rule is the
one that leaves the screen looking nearly right and silently uncentred. `props.style` is the
override, because a class-based one no longer works.

The same trap applies to any rare utility this package introduces: **if a `web-panel` change looks
half-applied in a linked app, restart its dev server before believing the component.**

Everything in the card is centred, the terms confirmation included: its checkbox stays at the start
of the sentence (`justify-center` + `text-center`), not above it.

The screen centres the card **within its own box**, which is the whole page when a dispatcher
renders it. An app that mounts it below its own chrome (the `web-panel` harness does) gets a box
that starts under that chrome — so a centring test measures the card against the SCREEN box, never
against the window.

## i18n

Registered from `@owlmeans/client-auth` into the existing `auth` library resource under a `login`
root, seven languages in the same commit. `_addI18n` **pushes**, so this coexists with
`web-client`'s own `auth` registration and the two merge by tier and priority.

The agreement sentence is ONE translated string carrying `{{terms}}` / `{{privacy}}` placeholders,
split at render time to inject anchors — word order stays translatable, and nothing but a string
ever comes out of a translation.

`LoginScreen` takes `translate` as a prop and reaches for no context; `LocalizedLoginScreen` binds
`useI18nLib`. `appendLoginScreen` registers the bound one.

## Wiring a dispatcher

```
1. login().enter()                          ← FIRST statement of the effect
2. ?error=  → render it, stop               ← the anti-loop guard
3. ?token=  → provideToken(...)
4. ?code=   → oidc.dispatch → login().complete → Handled | Orphaned | navigate()
5. ?method= → start that method             ← the surrogate's re-entry
6. signed in already → login().resume(token) → resumeAction(...)
7. otherwise → render login().screen() ?? FallbackLoginScreen. START NOTHING.
```

`resumeAction` (`@owlmeans/client-auth/login`) is the one reading of a resume outcome, exported as
a pure function because three dispatchers share it — `web-client`, `web-oidc-rp` and
`mui-oidc-rp`, the last being a near-verbatim copy that has drifted before.

## Related

`login-plugins` (where the round trip runs) · `client-auth` · `client-panel` · `web-panel` ·
`web-auth` · `localization`
