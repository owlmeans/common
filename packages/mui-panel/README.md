# @owlmeans/mui-panel

The legacy MUI browser layer of OwlMeans: a web context factory, a `render()` entry that mounts the
app inside an MUI `ThemeProvider`, a small set of MUI panel components (`Block`, `Text`, `Link`,
`Status`, `Form`, `TextInput`, buttons, an image uploader) and a re-export surface for binding shared
protocol declarations, routes, i18n and flows from one import. It exists for applications that
already run on MUI; they bind shared protocol declarations locally with `bindAll()` and
`bindScreen()`. **New browser work uses `@owlmeans/web-panel`** (shadcn/Radix over Tailwind) — do
not start an app, add a screen family, or port a shadcn component here. Both families sit on the
same `@owlmeans/client-panel` primitives and entrypoint model, so an app migrates component by
component. The `mui-panel` skill covers this package.

## Installation

```bash
bun add @owlmeans/mui-panel@^0.1.18-rc.64
```

Peer dependencies the app provides: `@mui/material`, `@mui/icons-material`, `@emotion/react`,
`@emotion/styled`, `react`, `react-dom`, `react-hook-form`, `ajv`. `Form` also imports `ajv-formats`,
which the manifest does not declare — add it to the app next to `ajv`.

## Concepts

- **Context factory** — `makeContext(cfg)` builds on `@owlmeans/web-client`'s context, registers
  `apiConfigMiddleware` and the flow service, and adds the `context.flow()` accessor. One context per
  process; app factories call it and then apply their own `append*` mixins.
- **Entrypoints** — `entrypoints` is the base declaration list (`@owlmeans/web-client`'s plus
  `@owlmeans/api-config-client`'s). An app appends its own, built from shared protocol declarations
  with `bindAll` (API protocols) and `bindScreen` (frontend protocols bound to a component).
- **Theme** — an MUI `Theme` passed to `render` / `PanelApp`; a default `createTheme()` is used when
  none is given.
- **Panel i18n** — components resolve copy through `@owlmeans/client-panel`'s panel and form
  namespaces rather than taking literal strings.
- **Auth surface** — the `./auth` subpath is a smaller context for an authentication-only app, and
  its import registers MUI renderers for the built-in authentication methods.

## Usage

### 1. Context factory

```typescript
import { makeContext as makeMuiContext } from '@owlmeans/mui-panel'
import type { AppConfig, AppContext } from '@owlmeans/mui-panel'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C): T => {
  const context = makeMuiContext<C, T>(cfg)
  // app-level append* mixins go here

  return context
}
```

### 2. Entrypoints and rendering

```tsx
import { bindAll, bindScreen, entrypoints as baseEntrypoints, handler, render } from '@owlmeans/mui-panel'
import { createTheme } from '@mui/material/styles'
import { apiProtocols, webProtocols } from 'my-app-common'
import { HomeScreen } from './screens/home.js'

export const appEntrypoints = [
  ...baseEntrypoints,
  ...bindAll(apiProtocols),
  bindScreen(webProtocols.home, handler(HomeScreen)),
]

const theme = createTheme({ palette: { mode: 'dark' } })   // module scope: a stable object

const context = makeContext(config)
context.registerEntrypoints(appEntrypoints)
render(context, theme)
```

`render(context, theme?, opts?)` installs the browser language detector and mounts `PanelApp`
(`ThemeProvider`, `I18nContext`, `<App>`, `CssBaseline`). A host that mounts the tree itself uses
`PanelApp` directly.

### 3. Panels, text, links and status

```tsx
import { Block, BlockScaling, Link, Status, Text } from '@owlmeans/mui-panel'

export const HomeScreen = () =>
  <Block horizontal={BlockScaling.Half} i18n={{ prefix: 'home' }}>
    <Text name="title" variant="h4" />
    <Link module="projects" />                {/* href resolved from the entrypoint's url() */}
    <Link src="https://owlmeans.com" open>OwlMeans</Link>
    <Status ok={false} error={lastError} />
  </Block>
```

### 4. Forms

```tsx
import { Form, SubmitButton, TextInput, useFormRef } from '@owlmeans/mui-panel'

export const ProfileForm = () => {
  const formRef = useFormRef<ProfileInput>()

  return <Form name="profile" formRef={formRef} validation={ProfileSchema} decorate
    onSubmit={async data => { await saveProfile(data) }}>
    <TextInput name="email" label placeholder hint />
    <TextInput name="displayName" label />
  </Form>
}
```

With `decorate` the form renders a `Card`, the root error through `Status`, and a `SubmitButton`
when `onSubmit` is set. Without it the form is a bare `Grid` and the caller renders its own
`<SubmitButton onSubmit={...} />`. `label`, `placeholder` and `hint` take `true` to look up
`<name>.label` / `.placeholder` / `.hint` in the form namespace.

### 5. Auth-only surface

```typescript
import { makeContext, render } from '@owlmeans/mui-panel/auth'
import { entrypoints } from '@owlmeans/mui-panel/auth/entrypoints'

const context = makeContext(config)
context.registerEntrypoints(entrypoints)
render(context, theme)
```

Importing `@owlmeans/mui-panel/auth` sets MUI renderers for `AuthenticationType.BasicEd25519`,
`ReCaptcha` and `WalletConsumer` in the shared `@owlmeans/client-auth/manager` plugin registry.

## API

### Main entry `@owlmeans/mui-panel`

| Symbol | Kind | Purpose |
|---|---|---|
| `makeContext(cfg)` / `useContext()` | functions | Build the context; read it in React |
| `render(context, theme?, opts?)` | function | Mount the app with the language detector inside `PanelApp` |
| `PanelApp` | component (`PanelAppProps`: `AppProps` + `theme?`) | `ThemeProvider` + `I18nContext` + `<App>` + `CssBaseline` |
| `entrypoints` | array | Base declarations from `@owlmeans/web-client` and `@owlmeans/api-config-client` |
| `Block` | component (`BlockProps`) | `Card` panel with `horizontal`/`vertical` scaling, optional `Actions`, panel i18n scope, `styles` |
| `Text` | component (`TextProps`) | `Typography` with a translated `name`, `variant`, `center`, `nested`, `styles` |
| `Link` | component (`LinkProps`) | MUI link to `src` or to an entrypoint given as `module` (alias or entrypoint); `open` targets a new tab |
| `Status` | component (`StatusProps`) | `Alert` resolving `message`, a `ResilientError`, or the variant to translated text |
| `Form` | component (`WebFormProps`) | `react-hook-form` + AJV over a `Grid`; `decorate` adds card, root error and submit |
| `TextInput` | component (`TextInputProps`) | `TextField` bound to the form; `name`, `label?`, `placeholder?`, `hint?`, `type?`, `def?`, `disableAutocomplete?` |
| `Button` / `SubmitButton` | components (`ButtonProps` / `SubmitProps`) | Buttons with loader spinner and label lookup |
| `ButtonSelector` | component (`SelectorProps`) | `ButtonGroup` as a single-choice control: `current`, `options`, `onSelect` |
| `ImageUploader` | component (`ImageUploaderProps`) | Web-client uploader in a `Paper` drop target with `previewUrl` |
| `Layout` | component (`LayoutProps`) | A bare `Box` — no navigation shell |
| `scalingToStyles(h, v, theme?)` | function | `BlockScaling` → `SxProps` |
| `useBreakPoint()` | hook | Current MUI breakpoint name, or `'unknown'` |
| `useMapBreakpoint(map, def?, breakpoint?)` | hook | Value for the current breakpoint; throws `SyntaxError` when none and no `def` |
| `AppConfig`, `AppContext` | types | Web-client config/context plus flow config and `flow()` |

### Re-exports (main entry)

| Symbols | From |
|---|---|
| everything | `@owlmeans/client-panel` (`BlockScaling`, `PanelContext`, `usePanelI18n`, `useFormRef`, `ClientForm`, …) |
| `handler`, `useNavigate`, `useValue`, `useEntrypoint` | `@owlmeans/client` |
| `bind`, `bindAll`, `bindScreen`, `clientRequestHelper`, `provideRequest`, `stab`; type `Module` | `@owlmeans/client-entrypoint` |
| `config` / `service` / `addWebService` | `@owlmeans/client-context` / `@owlmeans/config` / `@owlmeans/client-config` |
| `croute` / `route`, `frontend` | `@owlmeans/client-route` / `@owlmeans/route` |
| `DAUTH_GUARD`, `bindExternalAuthentication` | `@owlmeans/client-auth` |
| `AppType`, `HOME`, `ROOT`, `BASE`, `GUEST` | `@owlmeans/context` |
| `DISPATCHER`, `CAUTHEN_FLOW_ENTER`; type `AuthToken` | `@owlmeans/auth` |
| `composePrefix`, `useI18n`, `useI18nApp`, `useI18nLib`, `useLanguage` | `@owlmeans/client-i18n` |
| `addI18nApp`, `addI18nLib`, `i18nHelper`, `SUPPORTED_LNGS` | `@owlmeans/i18n` |
| `flow`, `configureFlows` / `FLOW_PARAM`, `SERVICE_PARAM`, `useFlow` | `@owlmeans/flow` / `@owlmeans/web-flow` |
| `Dispatcher`, `appendWebAuthService` | `@owlmeans/web-client` |

### Subpath `@owlmeans/mui-panel/auth`

`makeContext` (client context with `extractPrimaryHost`, `appendWebDbService`, `appendWebRouter`,
`apiConfigMiddleware`, flow service), `useContext`, `render`, `plugins` (the shared registry with
the MUI renderers set), types `AppConfig` / `AppContext`, all of `@owlmeans/client-panel/auth`,
`AuthenticationHOC`, and a re-export set close to the main entry's (adds `EntrypointOutcome`,
`RouteMethod`, `CAUTHEN`, `AuthenticationType`, `FLOW_ALIAS`; types `Navigator`, `AbstractRequest`,
`Request`, `ServiceRoute`, `FlowService`).

### Subpath `@owlmeans/mui-panel/auth/entrypoints`

`entrypoints` — the auth-manager declarations plus the API-config ones.

## Migrating to `@owlmeans/web-panel`

| Concern | Here | In `@owlmeans/web-panel` |
|---|---|---|
| Rendering | `render(context, theme?, opts?)` | `render(context, opts?)` |
| Theme | MUI `Theme` object | CSS tokens and the `.dark` class |
| Layout | `Layout` (a `Box`) | `NavLayout`, `TopNav`, `SideNav`, `Footer` |
| Styling | `styles?: SxProps` | `className` / `style` |
| OIDC sign-in | `@owlmeans/mui-oidc-rp` | `@owlmeans/web-oidc-rp` |

The context factory, entrypoint declarations and form model carry over unchanged.

## Common pitfalls

- `TextInput` discards a string `label`/`placeholder`/`hint` — only `true` resolves copy. Put the
  wording in the form's translation bundle. (`@owlmeans/web-panel`'s `TextInput` takes strings.)
- `Link` takes the target on `module`, not `entrypoint`, and resolves `href` asynchronously — the
  first paint has no `href`.
- `Form` without `decorate` renders no card, no root-error surface and no submit button; `styles`
  applies only to the decorated card.
- `Form` coerces types through AJV, and with `validation` and no `defaults` it derives initial
  values from the schema.
- `Status` rewrites `:` to `.` in an error message before lookup, so translation keys use dots.
- Pass `render` a stable theme object; a `createTheme(...)` inside a render body rebuilds the theme
  each time.
- A second copy of `@mui/material` in the tree gives two theme contexts. Importing another family's
  auth plugins replaces these renderers in the shared registry — one UI family per bundle.
- `useMapBreakpoint` throws when the breakpoint is not in `map` and no `def` is given.

## Related packages

- [`@owlmeans/web-panel`](../web-panel) — the current browser panel family; use it for new work
- [`@owlmeans/client-panel`](../client-panel) — the cross-platform primitives both families build on
- [`@owlmeans/web-client`](../web-client) — the browser context, `<App>` mounting and uploader
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — `bind`, `bindAll`, `bindScreen`
- [`@owlmeans/client-auth`](../client-auth) — the authentication manager and plugin registry
- [`@owlmeans/mui-oidc-rp`](../mui-oidc-rp) — OIDC relying party for this legacy family

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
