---
name: mui-panel
description: "How to use @owlmeans/mui-panel — the LEGACY MUI v7 browser layer: makeContext, the render() entry point with the MUI ThemeProvider, the Block/Text/Link/Status/Form components and the auth-only subpaths. Superseded by @owlmeans/web-panel for new work. Auto-invoked when maintaining an app that already imports mui-panel or deciding how to migrate one off it."
user-invocable: false
---

# @owlmeans/mui-panel

**Layer:** Web (React)
**Install:** `"@owlmeans/mui-panel": "^0.1.18-rc.27"` in `dependencies`

## This is the legacy UI layer

**`@owlmeans/web-panel` is the current browser panel family — shadcn/Radix over Tailwind — and
every new application uses it.** This package is the MUI v7 predecessor, kept for the applications
that already run on it. Do not start a new app here, do not add a screen family here, and do not
port a shadcn component back into it.

What that means in practice:

| Concern | Legacy (this package) | Current |
|---|---|---|
| Context factory | `makeContext` here | `makeContext` in `@owlmeans/web-panel` |
| Rendering | `render(context, theme?, opts?)` — MUI `ThemeProvider` + `CssBaseline` | `render(context, opts?)` in `@owlmeans/web-panel` — mounts `PanelApp`, which carries the i18n context |
| Layout / navigation | `Layout` — a bare `Box`; navigation is the app's own | `NavLayout` / `TopNav` / `SideNav` / `Footer` |
| Theme | an MUI `Theme` object passed to `render` | CSS tokens and the `.dark` class |
| OIDC sign-in | `@owlmeans/mui-oidc-rp` | `@owlmeans/web-oidc-rp`, or `@owlmeans/client-iam` for one-call wiring |
| Styling props | `styles?: SxProps` on `Block`, `Text`, `Link` and `Form` only | `className` / `style` merged through `cn` |

Both families sit on the same `@owlmeans/client-panel` primitives and the same entrypoint model, so
a migration is component-by-component rather than a rewrite: the context factory, the entrypoint
declarations and the form model all survive it.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeContext<C, T>(cfg)` | The browser context: registers `apiConfigMiddleware`, appends the flow service, and adds the `context.flow()` accessor |
| `useContext<C, T>()` | The current context, from React |
| `render(context, theme?, opts?)` | Mounts the tree inside `PanelApp` — MUI `ThemeProvider`, `CssBaseline` and the i18n context, with the browser language detector installed |
| `PanelApp` | That wrapper on its own, for a host that mounts the tree itself |
| `entrypoints` | The base declaration list — `@owlmeans/web-client`'s plus `@owlmeans/api-config-client`'s |
| `Block` | A `Card` panel with optional `Actions`, carrying a `PanelContext` for i18n |
| `Text` / `Link` | `Typography` and an anchor whose `href` is the entrypoint's own `url()` answer |
| `Status` | An `Alert` that resolves a `ResilientError` to a translated message |
| `Form` | `react-hook-form` + AJV (`ajvResolver`, `coerceTypes`, `ajv-formats`) over a `Grid`; `decorate` adds the `Card`, the root-error `Status` and the submit action — see the gotcha below |
| `TextInput` | The `TextField` field control. `label` / `placeholder` / `hint` are resolved from the form namespace **only when passed boolean `true`** — see the gotcha below |
| `Button` / `SubmitButton` | Buttons with the loader spinner and the three-tier label lookup |
| `ButtonSelector` | A `ButtonGroup` acting as a single-choice control |
| `ImageUploader` | `@owlmeans/web-client`'s uploader in a `Paper` drop target with a preview |
| `Layout` | A bare `Box` — this family ships no navigation shell |
| `scalingToStyles(h, v, theme)` | `BlockScaling` → `SxProps`, the sizing every panel here shares |
| `useBreakPoint()` | The current MUI breakpoint name — `xs`/`sm`/`md`/`lg`/`xl`, or `unknown` when none matches |
| `useMapBreakpoint(map, def?, breakpoint?)` | The `map` entry for the current breakpoint (or for the `breakpoint` passed), falling back to `def`. It **throws a `SyntaxError`** when neither yields a value, so give it a `def` or cover every breakpoint |
| Re-exports | `entrypoint`, `elevate`, `handler`, `route`, `croute`, `frontend`, `provideRequest`, `stab`, `guard`, `useNavigate`, `useEntrypoint`, `useValue`, `config`, `service`, `addWebService`, `DAUTH_GUARD` / `setupExternalAuthentication`, `useI18n` / `useI18nApp` / `useI18nLib` / `useLanguage` / `composePrefix`, `addI18nApp` / `addI18nLib` / `SUPPORTED_LNGS`, `flow` / `configureFlows` / `useFlow` / `FLOW_PARAM` / `SERVICE_PARAM`, `Dispatcher`, `appendWebAuthService`, `HOME` / `ROOT` / `BASE` / `GUEST` / `AppType`, `DISPATCHER`, `CAUTHEN_FLOW_ENTER`, and the types `AuthToken` and `Module` (`ClientEntrypoint` under its legacy name — what applications type their entrypoints with) |
| Re-export of `@owlmeans/client-panel` | The whole cross-platform panel surface — `ClientForm`, `PanelContext`, `usePanelI18n`, `useFormRef`, `BlockScaling`, … |

## Subpath Exports

- `./auth` — a **separate, smaller** context factory for an auth-only surface: it builds a client
  context directly (`extractPrimaryHost`, `appendWebDbService`, `appendWebRouter`,
  `apiConfigMiddleware`, `appendFlowService`) instead of the full web-client one, plus its own
  re-export set and the authentication UI plugins.
- `./auth/entrypoints` — the auth-manager declarations plus the API-config ones.

Importing `./auth` registers the authentication renderers by side effect:
`AuthenticationType.BasicEd25519`, `ReCaptcha` and `WalletConsumer` get their MUI renderers pushed
into the shared plugin registry of `@owlmeans/client-auth/manager`. That registry is a module
singleton, so **importing both this package's plugins and another family's replaces the renderers
rather than combining them** — one UI family per bundle.

## Wiring

```typescript
import { makeContext as makeBasicContext } from '@owlmeans/mui-panel'
import { appendOidcGuard } from '@owlmeans/mui-oidc-rp'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg) as T
  appendOidcGuard<C, T>(context)
  return context
}
```

**A context is created once per process, by one factory.** An app factory calls the factory of the
layer below it, applies idempotent `append*(context)` mixins, and returns that same context.
Nothing is stored for re-creation, and every service, resource and entrypoint binds to exactly the
one context it was appended to.

Compose the entrypoints over the base set, then render with the app's theme:

```typescript
import { entrypoints as baseEntrypoints, render } from '@owlmeans/mui-panel'

export const entrypoints = [...baseEntrypoints, ...appEntrypoints]

render(context, theme)
```

`render` builds a default MUI theme when none is passed, so an app with no branding still gets a
consistent surface. `PanelApp` memoises the theme on identity — hand it a stable object, not a
`createTheme(...)` call inside the render body, or every render rebuilds the whole theme.

## Gotchas

- **MUI is a peer, not a dependency.** `@mui/material`, `@mui/icons-material`, `@emotion/react`,
  `@emotion/styled`, `react`, `react-dom`, `react-hook-form` and `ajv` are all supplied by the app,
  at v7 for the MUI packages. A second copy of `@mui/material` in the tree gives two theme contexts
  and components that read the wrong one.
- **`Link` takes the screen on a prop named `module`, not `entrypoint`.** `LinkProps` declares
  `module?: string | ClientEntrypoint` — the legacy name, kept while the prose and the rest of the
  tree say entrypoint. There is no `entrypoint` prop, and a `Link` given none renders an anchor with
  no `href`. Its default label key is `modules.<alias>`, from the same legacy family.
- **`Link` resolves its `href` asynchronously.** It asks the entrypoint for its own URL, so the
  anchor has no `href` for the first paint and settles once the URL is known — never key a test or
  a layout on the attribute being present synchronously. Address a screen by alias; `src` is the
  escape hatch for a literal URL, and `open` opens a new tab.
- **`TextInput` resolves copy from a boolean, and DISCARDS a string.** `label`, `placeholder` and
  `hint` are typed `string | boolean`, but only `true` does anything: it looks up `<name>.label` /
  `<name>.placeholder` / `<name>.hint` in the form namespace. Any other value — a literal string
  included — is replaced with `undefined`. So `<TextInput label="Email" />` compiles and renders no
  label at all. Put the wording in the form's translation bundle and pass `label`.
  (`@owlmeans/web-panel`'s `TextInput` honours a string; do not carry the habit either way.)
- **`Form` renders a bare `Grid` unless `decorate` is set.** With `decorate={true}` it wraps the
  fields in a `Card`, surfaces the root error through `Status`, and renders a `SubmitButton` in
  `CardActions` when `onSubmit` is given. Without it there is no card, no root-error surface and no
  submit button — the caller renders its own action. `styles` is applied only on the decorated
  `Card`; the scaling from `horizontal`/`vertical` lands on the `Grid` otherwise.
- **`Form` validates through AJV, and the schema is the source of the defaults.** Given
  `validation` and no `defaults`, the initial values come from `schemaToFormDefault`. Its AJV
  instance coerces types, so a numeric field arrives as a number rather than the input's string.
- **Label lookup in `Button` is three-tier** — panel namespace, then the app namespace's `buttons`
  section, then `client-panel`'s. Pass `i18n: { suppress: true }` to render a literal label instead.
- **`Status` rewrites `:` to `.` in an error message** before looking it up, so a marshalled
  `ResilientError` resolves as `<type>.<message>` in the translation tree. A key written with a
  colon never matches.
- This family has **no navigation shell**. `Layout` is a `Box`; a menu, header and footer are the
  app's own MUI code. That is the largest single gap against `@owlmeans/web-panel`, and the reason
  a migration usually starts by adopting `NavLayout`.

## Depends On

- `@owlmeans/web-client`, `@owlmeans/client-panel`, `@owlmeans/client-i18n`, `@owlmeans/web-router`,
  `@owlmeans/web-flow`, `@owlmeans/web-db`, `@owlmeans/client-auth`, `@owlmeans/api-config-client`
- Peers (app-provided): `@mui/material` v7, `@mui/icons-material` v7, `@emotion/react`,
  `@emotion/styled`, `react`, `react-dom`, `react-hook-form`, `ajv`
- `ajv-formats` is imported at module scope by `Form` but is declared in no dependency section of
  the manifest, which lists `ajv` alone. An install that does not otherwise pull it in fails at
  import time, so declare `ajv-formats` next to `ajv` in the consuming application.

## Related

- `web-panel` — **the current panel family**; read it for anything new
- `mui-oidc-rp` — the OIDC relying party of this same legacy family
- `client-panel` — the cross-platform primitives both families are written against
- `shadcn-web` — how the current family is built, and the MUI→shadcn component mapping
