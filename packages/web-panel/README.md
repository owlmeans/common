# @owlmeans/web-panel

shadcn UI + Tailwind v4 implementation of the OwlMeans web panel layer. It wraps the headless
`@owlmeans/client-panel` logic and `@owlmeans/web-client`'s context with shadcn primitives: the base
context factory, the navigation shell, forms, panels, the sign-in screen, toasts and the socket
reload prompt. New OwlMeans web apps build on it. An app that renders only its own components and
needs no panel can stay on [`@owlmeans/web-client`](../web-client). Material UI apps already on
[`@owlmeans/mui-panel`](../mui-panel) are legacy: the same surface rendered with MUI, maintained
but never started.

## Installation

```sh
bun add @owlmeans/web-panel@^0.1.18-rc.54
```

Peer requirements (the consuming app provides these): `react`, `react-dom`,
`react-hook-form`, `ajv`, `tailwindcss@^4`, `lucide-react`, `clsx`,
`tailwind-merge`, `class-variance-authority`, plus the radix primitives
listed in `peerDependencies` (`alert-dialog`, `dialog`, `label`, `navigation-menu`, `progress`,
`separator`, `slot`). Also declare `ajv-formats` next to `ajv`: the form model imports it, but no dependency
section of this manifest lists it.

## Concepts

- **Panel context** — `makeContext(cfg)` is `@owlmeans/web-client`'s context plus
  `apiConfigMiddleware`, the flow service (`context.flow()`), the socket-status service and the
  default shadcn sign-in screen. The app factory calls it and appends its own mixins.
- **Package boundary** — the shadcn primitives and `cn` are private files under the package's own
  `build/@/` tree, imported relatively. A consumer needs no `@` alias and vendors nothing. It
  supplies the peers, its Tailwind theme tokens and an `@source` line for this package.
- **Two-layer navigation** — the top menu lists sections and the side menu lists the active
  section's screens. A section holding a single screen renders no side menu. The model
  (`usePanelNav`, `PanelNav*`) is headless in `@owlmeans/client-panel`. With `mobileMenu`, a
  narrow viewport gets both levels behind one menu button and a sheet instead.
- **Style slots** — `className` (page root), `headerClassName` (sticky bar), `contentClassName`
  and `containerClassName` (width and padding of all three rows) are merged over their defaults
  with tailwind-merge, never substituted.
- **Global overlays** — `PanelApp` renders its `children` and `SocketReloadDialog` beside the
  router, so a dialog survives navigation.
- **`translate` props** — the navigation and login components take a
  `(key, defaultValue) => string` resolver as a prop instead of reading an i18n provider implicitly.

## Usage

### Consumer setup — theme tokens and `@source`

The components paint with these CSS variables, defined inside `@theme` in the app's globals.css:

- `--color-background`, `--color-foreground`
- `--color-card`, `--color-card-foreground`
- `--color-primary`, `--color-primary-foreground`
- `--color-secondary`, `--color-secondary-foreground`
- `--color-muted`, `--color-muted-foreground`
- `--color-accent`, `--color-accent-foreground`
- `--color-destructive`
- `--color-success` (custom; only needed if you use `<Status ok />`)
- `--color-border`, `--color-input`, `--color-ring`
- `--radius`
- `--animate-progress-indeterminate` + the `@keyframes progress-indeterminate`
  rule for the `Progress` component's indeterminate mode

A working set is shipped at `src/@/globals.css` (for dev/test only). Toasts additionally read
`--popover`, `--popover-foreground` and `--border`.

Tailwind's scanner reads your CSS root plus its `@source` directives, and it excludes
`node_modules`. Classes that exist only inside this package's components — the whole navigation
shell and footer — therefore never reach your stylesheet unless you point Tailwind at the
installed package's `src`:

```css
@import "tailwindcss";

@source "../../../node_modules/@owlmeans/web-panel/src";
```

Adjust the relative depth to your own layout. An app using `./consent` adds a second `@source` for
`@owlmeans/web-consent`'s `src`.

### 1. Config and context factory

```ts
// src/config.ts
import { config } from '@owlmeans/web-panel'
import { commonConfig, MY_APP_WEB } from 'my-app-common'
import type { Config } from './types.js'

const cfg: Config = config(MY_APP_WEB, commonConfig as Config)
// Block the screen with a "reload the page" prompt once every socket has given up reconnecting.
cfg.socket = { ...cfg.socket, reloadDialog: true }

export default cfg
```

```ts
// src/context.ts
import { appendLoginScreen, makeContext as makePanelContext, useContext as usePanelContext } from '@owlmeans/web-panel'
import type { AppConfig, AppContext } from '@owlmeans/web-panel'
import { appendConsentWidgetService } from '@owlmeans/web-panel/consent'
import { appendStateResource } from '@owlmeans/state'
import { BrandMark } from './components/brand.js'
import { PROJECT_STATE } from './consts.js'

export interface Config extends AppConfig {}
export interface Context<C extends Config = Config> extends AppContext<C> {}

export const useContext = (): Context => usePanelContext<Config, Context>()

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makePanelContext<C, T>(cfg)
  // Idempotent: makeContext registered the default screen; this puts the app's mark on it.
  appendLoginScreen<C, T>(context, { Logo: BrandMark })
  appendConsentWidgetService<C, T>(context)
  appendStateResource<C, T>(context, PROJECT_STATE)

  return context
}
```

### 2. Entrypoints and mounting with overlays

```ts
// src/entrypoints.ts
import { bindAll, bindScreen, entrypoints as panelEntrypoints, handler } from '@owlmeans/web-panel'
import { entrypoints as authEntrypoints } from '@owlmeans/client-auth'
import { apiProtocols, webProtocols } from 'my-app-common'
import { MainLayout } from './layout/main.js'
import { HomeScreen } from './screens/home.js'
import { CookiePolicyScreen } from './screens/legal/cookies.js'

export const appEntrypoints = [
  ...authEntrypoints,
  ...panelEntrypoints,
  ...bindAll(apiProtocols),
  bindScreen(webProtocols.base, handler(MainLayout)),
  bindScreen(webProtocols.home, handler(HomeScreen)),
  bindScreen(webProtocols.legal.cookies, handler(CookiePolicyScreen)),
]
```

`render(context, { rootClassName })` mounts `PanelApp` with the browser language detector
installed. An app with global overlays of its own mounts `PanelApp` itself:

```tsx
// src/render.tsx
import type { FC } from 'react'
import { render as mount } from '@owlmeans/web-client'
import type { AppContext } from '@owlmeans/web-client'
import { useI18nInstance } from '@owlmeans/client-i18n/utils'
import { PanelApp } from '@owlmeans/web-panel'
import { PanelCookieConsent } from '@owlmeans/web-panel/consent'
import detector from 'i18next-browser-languagedetector'

const App: FC<{ context: AppContext }> = ({ context }) => {
  useI18nInstance(context.cfg).use(detector)

  // Children of PanelApp sit beside the router, so the dialog survives navigation.
  return <PanelApp context={context} rootClassName="dark">
    <PanelCookieConsent policyHref="/legal/cookies" />
  </PanelApp>
}

export const render = (context: AppContext) => mount(<App context={context} />)
```

```ts
// src/index.tsx
const context = makeContext(config)
context.registerEntrypoints(appEntrypoints)
context.serviceRoute(MY_APP_WEB, true)
render(context)
```

### 3. Navigation shell, toasts and a guarded layout

`NavLayout` is the standard shell: header, section menu, the active section's screen menu, content
and footer. A layout entrypoint binds a component that renders it; the matched screen arrives as
`children`. Keep the navigation as data in its own module, so screens, entrypoints and the shell
read the same aliases.

```tsx
import type { FC, PropsWithChildren } from 'react'
import { HOME, NavLayout, Toaster, useI18nApp } from '@owlmeans/web-panel'
import type { PanelNavConfig, PanelNavLink } from '@owlmeans/web-panel'
import { useSelfAuth } from '@owlmeans/client-auth'
import { webProtocols } from 'my-app-common'

export const navConfig: PanelNavConfig = {
  sections: [
    { name: 'home', label: 'Home', items: [{ alias: HOME, label: 'Overview' }] },
    {
      name: 'projects', items: [
        { alias: webProtocols.projects.alias },
        { alias: webProtocols.archive.alias },
      ]
    },
  ],
}

const footerLinks: PanelNavLink[] = [
  { alias: HOME, label: 'My App' },
  { href: 'https://example.com/docs', label: 'Docs', open: true },
]

export const MainLayout: FC<PropsWithChildren> = ({ children }) => {
  useSelfAuth(true)
  const t = useI18nApp('menu')

  return <>
    <NavLayout nav={navConfig} title="My App" footer={footerLinks}
      translate={(key, defaultValue) => t(key, { defaultValue })}
      headerClassName="bg-secondary text-secondary-foreground"
      containerClassName="max-w-[1280px]">
      {children}
    </NavLayout>
    {/* Exactly once, in the layout. Messages come from `toast.success(...)` in `sonner`. */}
    <Toaster />
  </>
}
```

Labels resolve as literal `label`, then `translate(key, humanized alias)`, then the humanized
alias. Default keys are `nav.<section>` and `modules.<alias>`.

| Component | Props |
|---|---|
| `NavLayout` | `nav`, `translate?`, `title?`, `home?` (brand target; defaults to the first section's first item), `actions?`, `mobileMenu?` (below `md`, a menu button and a sheet replace the section menu and the screen strip; `actions` stay), `skipLinkLabel?` (the first-on-page skip link to `<main id="main">`; default `shell.skip` → "Skip to content"; `false` renders no link and no `#main`), `themeToggle?` (`true` or `{ labels? }`: the light/dark switcher in the footer's bottom row beside the credit; names via `shell.toLight` / `shell.toDark`), `footer?` (`PanelNavLink[]` renders the centred link row; a node renders as a full-width block above the credit), `headerClassName?`, `contentClassName?`, `containerClassName?`, `className?`, `style?` |
| `TopNav` | `config`, `translate?`, `ariaLabel?`, `className?`, `style?` |
| `SideNav` | the same, plus `variant?: 'side' \| 'bar'` |
| `MobileNav` | the same as `TopNav`; the trigger's name and the sheet title resolve `shell.menu` ("Menu"), its close button `shell.close` ("Close"); `className`/`style` land on the trigger |
| `Footer` | `links?`, `content?` (full-width block, `data-footer-content`), `translate?`, `containerClassName?`, `children?` (join the link row), `themeToggle?`, `className?`, `style?` — always renders the platform/owner credit line last, via `ShellCredit` |
| `ThemeToggle` | `labels?: { toLight?, toDark? }` (English defaults), `className?`, `style?` — a 44px `<button data-theme-toggle>` flipping the resolved scheme |
| `ShellCredit`, `useShellCredit` | `className?` — "Powered by OwlMeans" plus the owner's copyright, resolved the same way the sign-in screen's credit is |

### 4. Forms, panels and status

`Form` owns the whole model: `useForm` with an `ajvResolver` over `validation`, published through
`FormProvider` and `FormContext`, so every control below reads one form.

```tsx
import type { FC } from 'react'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { Block, BlockScaling, Button, Form, PanelContext, SubmitButton, TextInput, useFormRef } from '@owlmeans/web-panel'
import { apiProtocols, ProjectCreateSchema } from 'my-app-common'
import type { ProjectCreate } from 'my-app-common'
import { useContext } from '../context.js'

export const CreateProject: FC<{ onCancel: () => void }> = ({ onCancel }) => {
  const context = useContext()
  const formRef = useFormRef<ProjectCreate>()

  const onSubmit = useCallback(async (data: ProjectCreate) => {
    try {
      await context.entrypoint(apiProtocols.project.create).call({ body: data })
      toast.success('Project created')
    } catch (error) {
      // Plants a root error; Form shows it through Status when decorated.
      formRef.current?.error(error)
    }
  }, [])

  return <PanelContext resource="my-app" prefix="project-create">
    {/* `decorate` renders a Card, the root error and a SubmitButton in the footer. */}
    <Form decorate name="project" formRef={formRef} validation={ProjectCreateSchema}
      horizontal={BlockScaling.Half} onSubmit={onSubmit}>
      <TextInput name="name" label placeholder hint />
      <TextInput name="repository" type="url" label="Repository URL" disableAutocomplete />
    </Form>
    <Button label="cancel" variant="text" onClick={onCancel} />
  </PanelContext>
}
```

- `TextInput` takes `label`, `placeholder` and `hint` as `string | boolean`: `true` resolves
  `<name>.label` / `.placeholder` / `.hint` from the form namespace, and a string is used verbatim.
- Without `decorate`, `Form` is a bare flex column with no card, no root-error surface and no submit
  button, so render your own `SubmitButton` inside it.
- `formRef` (from `useFormRef()`) is filled with `{ form, update, loader, error }`.
- `Button` maps `contained` / `outlined` / `text` onto shadcn `default` / `outline` / `ghost`, and
  forwards any other shadcn variant name unchanged.

Panels and feedback:

```tsx
import { Block, ButtonSelector, ImageUploader, Link, Status, Text } from '@owlmeans/web-panel'

<Block horizontal={BlockScaling.Wide} Actions={() => <Link module={webProtocols.projects.alias} />}>
  <Text variant="h3" name="title" />
  <ButtonSelector name="period" options={['day', 'week', 'month']} current={period} onSelect={setPeriod} />
  <ImageUploader maxFiles={1} previewUrl={logoUrl} onDrop={files => upload(files[0])} />
  {result != null && <Status ok={result.ok} error={result.error} message={result.message} />}
</Block>
```

### 5. Socket connection state

With `cfg.socket.reloadDialog` set, `PanelApp` mounts `SocketReloadDialog`. It is a blocking
`AlertDialog` that opens when every `ws()` / `useWs()` connection has exhausted its retry budget
(`useSocketStatus() === 'lost'`), and its only action reloads the page. An app that prefers an
inline state leaves the flag off and reads the same status:

```tsx
import type { FC } from 'react'
import { useSocketStatus } from '@owlmeans/client-socket'
import { useI18nApp } from '@owlmeans/web-panel'

export const ConnectionBadge: FC = () => {
  const status = useSocketStatus()   // 'online' | 'reconnecting' | 'lost'
  const t = useI18nApp('connection')

  return status === 'online' ? null : <span role="status" data-state={status}>{t(status)}</span>
}
```

The dialog's strings are the lib-tier `socket` namespace (`reload.title`, `reload.description`,
`reload.action`), shipped in seven languages.

## API

### Context and mounting

| Symbol | Kind | Purpose |
|---|---|---|
| `makeContext<C, T>(cfg)` | function | Panel context factory — see *Concepts* |
| `useContext<C, T>()` | hook | The current panel context |
| `render(context, opts?)` | function | Mount `PanelApp` with the language detector; `opts` is `WebRenderOptions` |
| `WebRenderOptions` | type | `@owlmeans/web-client`'s `RenderOptions` plus `rootClassName` |
| `PanelApp`, `PanelAppProps` | component, type | Themed root `div`, i18n provider, app and router, overlays |
| `entrypoints` | const | `@owlmeans/web-client`'s entrypoints plus `@owlmeans/api-config-client`'s |
| `AppConfig`, `AppContext` | type | Adds `socket?: SocketClientSettings & { reloadDialog? }`, `flow()` and the socket-status append |

### Components

| Symbol | Kind | Purpose |
|---|---|---|
| `NavLayout`, `TopNav`, `SideNav`, `MobileNav`, `Footer`, `ShellCredit` | component | Navigation shell and its pieces, including the narrow-viewport menu sheet and the footer's platform/owner credit |
| `NavLayoutProps`, `TopNavProps`, `SideNavProps`, `MobileNavProps`, `FooterProps`, `ShellCreditProps` | type | Their props |
| `useShellCredit` | hook | Resolves the credit `ShellCredit` renders, without rendering it |
| `Layout`, `LayoutProps` | component, type | Plain content wrapper |
| `Form`, `WebFormProps` | component, type | Web form; `FormProps` plus `className` / `style` |
| `TextInput`, `TextInputProps` | component, type | `react-hook-form` controlled input |
| `Button`, `SubmitButton`, `ButtonProps`, `SubmitProps` | component, type | Action buttons; `SubmitButton` is bound to `handleSubmit` |
| `ButtonSelector`, `SelectorProps` | component, type | One button per option, the current one `contained` |
| `Block`, `Text`, `Link`, `Status` | component | Card panel with `Actions`, translated text, entrypoint link, translated `Alert` |
| `BlockProps`, `TextProps`, `LinkProps`, `StatusProps`, `StyledProps`, `TextVariant` | type | Their props |
| `ImageUploader`, `ImageUploaderProps` | component, type | Drop target with a `previewUrl` |
| `Toaster` | component | `sonner` surface themed from app tokens; follows `.dark` on the document element |
| `ThemeToggle`, `ThemeToggleProps`, `ThemeToggleLabels` | component, type | The light/dark switcher |
| `useColorScheme()`, `ColorSchemeModel` | hook, type | `{ scheme, choice, setChoice }` — the resolved scheme, the stored choice (`null` = follow the OS), and the setter |
| `SocketReloadDialog` | component | Blocking reload prompt for `'lost'` sockets |
| `LoginScreen`, `LocalizedLoginScreen` | component | Identity-provider choice screen; the localized one binds `translate` to the app's resources |
| `appendLoginScreen(ctx, setup?)`, `LoginScreenSetup` | function, type | Register the screen on the login service, with `Logo` and other `LoginScreenProps` |
| `LoginTerms`, `LoginCredit`, `LoginMethodIcon` | component | The screen's terms sentence, credit line and method icons |
| `LoginTermsProps`, `LoginCreditProps` | type | Their props |
| `scalingToStyles(horizontal?, vertical?)` | function | `BlockScaling` to Tailwind width/height classes |
| `useBreakPoint()` | hook | The current Tailwind breakpoint name |
| `useMapBreakpoint(map, def?, breakpoint?)` | hook | The map entry for the current breakpoint; throws `SyntaxError` when nothing matches and no `def` is given |

### Re-exports

| Symbol | From |
|---|---|
| everything (`usePanelNav`, `PanelNavConfig` / `PanelNavItem` / `PanelNavSection` / `PanelNavLink` / `NavTranslate`, `PanelContext`, `BlockScaling`, `useFormRef`, `FormContext`, ...) | `@owlmeans/client-panel` |
| `handler`, `useNavigate`, `useValue`, `useEntrypoint` | `@owlmeans/client` |
| `bind`, `bindAll`, `bindScreen`, `provideRequest`, `stab`; type `Module` | `@owlmeans/client-entrypoint` |
| `route`, `frontend` / `croute` | `@owlmeans/route` / `@owlmeans/client-route` |
| `config` / `service` / `addWebService` | `@owlmeans/client-context` / `@owlmeans/config` / `@owlmeans/client-config` |
| `AppType`, `HOME`, `ROOT`, `BASE`, `GUEST` | `@owlmeans/context` |
| `DISPATCHER`, `CAUTHEN_FLOW_ENTER`; type `AuthToken` | `@owlmeans/auth` |
| `DAUTH_GUARD` (`DEFAULT_ALIAS`), `bindExternalAuthentication` | `@owlmeans/client-auth` |
| `Dispatcher`, `appendWebAuthService` | `@owlmeans/web-client` |
| `composePrefix`, `useI18n`, `useI18nApp`, `useI18nLib`, `useLanguage` | `@owlmeans/client-i18n` |
| `addI18nApp`, `addI18nLib`, `SUPPORTED_LNGS` | `@owlmeans/i18n` |
| `flow`, `configureFlows` / `FLOW_PARAM`, `SERVICE_PARAM`, `useFlow` | `@owlmeans/flow` / `@owlmeans/web-flow` |

### `@owlmeans/web-panel/auth`

The context and screens for an authentication manager app — the identity-provider side, not a
relying party.

| Symbol | Kind | Purpose |
|---|---|---|
| `makeContext`, `useContext` | function, hook | Client context with IndexedDB, router, `apiConfigMiddleware` and flow service, without the relying-party auth service |
| `AppConfig`, `AppContext` | type | With `flow()` |
| `render` | function | Same as the root `render` |
| `plugins` | registry | `@owlmeans/client-auth/manager`'s registry with the shadcn renderers assigned |
| `Ed22519BasicAuthUIPlugin`, `ReCaptchaAuthUIPlugin`, `TunnelConsumerUIPlugin` | component | Those renderers |
| `AuthenticationHOC`, `AuthenticationType`, `DISPATCHER`, `CAUTHEN`, `EntrypointOutcome`, `RouteMethod`, `FLOW_ALIAS`, type `Navigator` / `AbstractRequest` / `Request` / `ServiceRoute` / `FlowService`, and the `@owlmeans/client-panel/auth` exports | re-export | Authentication-manager vocabulary |

`@owlmeans/web-panel/auth/entrypoints` exports `entrypoints`: `@owlmeans/client-auth/manager`'s
bindings plus `@owlmeans/api-config-client`'s.

### `@owlmeans/web-panel/scheme`

React-free — it imports nothing, so a Node build script can load it.

| Symbol | Kind | Purpose |
|---|---|---|
| `COLOR_SCHEME_KEY` | const | `'owlmeans:color-scheme'`, the `localStorage` key |
| `COLOR_SCHEME_EVENT` | const | The `window` event every change dispatches |
| `ColorSchemeChoice` | type | `'light' \| 'dark'` |
| `readColorScheme()` | function | The stored choice or `null` (storage errors swallowed) |
| `applyColorScheme(choice \| null)` | function | Sets the `light`/`dark` class on `<html>`, stores or clears the key, dispatches the event |
| `colorSchemeBootstrapScript()` | function | The inline head script that applies a stored choice before first paint |

The class contract: `.dark` = chosen dark, `.light` = chosen light, neither = follow the OS. A
consumer's CSS puts dark tokens under `.dark` AND under
`@media (prefers-color-scheme: dark) { :root:not(.light) { … } }`, and inlines
`colorSchemeBootstrapScript()` in the document head.

### `@owlmeans/web-panel/consent`

| Symbol | Kind | Purpose |
|---|---|---|
| `PanelCookieConsent`, `PanelCookiePolicy` | component | `@owlmeans/web-consent` components bound to the app's language and translations |
| `PanelConsentMenuWidget` | component | The cookie-preferences control for a host menu or footer ("Cookie settings" — pass `label` and `className`) |
| `appendConsentWidgetService(ctx, alias?)`, `createConsentWidgetService` | function | Ref-counted presence service over a state resource |
| `useConsentMenuPresence()`, `useConsentWidgetPresent()` | hook | Declare that a menu shows the row; read whether one does (hides the floating button) |
| `CONSENT_WIDGET_SERVICE`, `CONSENT_WIDGET_STATE` | const | Service alias and state alias |
| `ConsentWidgetPresenceRecord`, `ConsentWidgetService`, `ConsentWidgetServiceAppend` | type | Service types |
| `useConsent`, `useConsentCategory`, `consentStore`, `openConsent`, `isConsented`, `readConsent`, `writeConsent`, `clearConsent`, `consentBootstrapScript`, `DEFAULT_CONSENT_CATEGORIES`, `CONSENT_KEY`, `CONSENT_ESSENTIAL`, `CONSENT_ANALYTICS`, `CONSENT_MARKETING` and the consent types | re-export | `@owlmeans/web-consent` |

### Differences from `@owlmeans/mui-panel`

The public names match the MUI implementation; these props and types differ:

- **`styles?: SxProps` is removed.** Use `className?: string` and `style?: React.CSSProperties`
  (`BlockProps`, `TextProps`, `LinkProps`, `WebFormProps`, `LayoutProps`).
- **`variant` on `Text` / `Link` is `TextVariant`**: `'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'lead' |
  'large' | 'small' | 'muted' | 'blockquote'`.
- **`PanelAppProps.theme?: Theme` is replaced with `rootClassName?: string`.** Apply the theme
  through Tailwind classes and CSS variables.
- **`render(context, theme?, opts?)` is now `render(context, opts?)`**, where `opts` includes
  `rootClassName`.
- **`scalingToStyles()` returns a class-name string** composable with other classes, not an
  `SxProps`; its `theme` parameter is gone.
- **`useBreakPoint` / `useMapBreakpoint` use Tailwind's default breakpoints**
  (`xs/sm/md/lg/xl`) instead of MUI's `Theme.breakpoints`.
- **Button props stay compatible** (`'small' | 'medium' | 'large'`, `contained` / `outlined` /
  `text` or shadcn variant names).

## Common pitfalls

- **Add the `@source` line** for this package's `src` (and for `@owlmeans/web-consent` when using
  `./consent`). Without it the navigation shell renders unstyled.
- **A parent frontend route needs a `default: true` child.** A grouping screen with children but no
  default child renders blank at its own path.
- **Menu and login labels need a `translate` prop to be localized.** The components never read the
  i18n context implicitly, so without the prop they show literal labels or humanized aliases.
- **Mount `Toaster` exactly once, in the layout.** Two surfaces render every toast twice. An app
  raising its own toasts declares `sonner` at a range that resolves to the same copy.
- **Mount dialogs beside the router** (`PanelApp` children or the web-client overlay slot), never
  inside a route.
- **Give a dark top bar both halves through `headerClassName`** (`bg-secondary
  text-secondary-foreground`). The header is its own surface; colouring only the root leaves its
  menu unreadable.
- **Name only the utility you want to move in `containerClassName`.** It merges over
  `mx-auto w-full max-w-6xl px-4`, so `max-w-[1280px]` changes only the width.
- **`Link` resolves its `href` asynchronously.** Never key a test or layout on the anchor having an
  `href` at first paint.
- **`reloadDialog` is off by default.** The dialog renders nothing unless `cfg.socket.reloadDialog`
  is `true`.
- **Run `useConsentMenuPresence()` from the menu's always-mounted component**, never from inside a
  dropdown row, which mounts only while the menu is open. Without `appendConsentWidgetService` it
  does nothing and `PanelCookieConsent` keeps its floating button.
- **Pass an application footer layout as a node `footer`.** It renders full-width above the credit;
  an array renders the centred link row. Neither removes the credit.
- **A theme for `ThemeToggle` reads both classes.** Dark tokens under `.dark` only never follow
  the OS; under the media query only, they ignore an explicit light choice. Inline the head
  bootstrap or a stored dark choice flashes light for a frame.
- **The shell already renders the skip link and `<main id="main">`.** A screen never renders a
  second `<main>` or `#main`; an app with its own skip link passes `skipLinkLabel={false}`.
- **`mobileMenu` is opt-in.** Without it a narrow viewport keeps the section menu and the screen
  strip; with it both move into the sheet.
- **Never import `@/…` from package code or vendor its primitives in the app.** The `@` alias
  belongs to the consumer.
- **Every override of a packaged string covers all seven languages** (`SUPPORTED_LNGS`).

## Related packages

- [`@owlmeans/web-client`](../web-client) — the web context and mount helpers this package builds on
- [`@owlmeans/client-panel`](../client-panel) — headless form, layout, navigation and login models
- [`@owlmeans/client-auth`](../client-auth) — auth service, login hooks and plugin registry
- [`@owlmeans/client-socket`](../client-socket) — `useSocketStatus` behind the reload prompt
- [`@owlmeans/web-consent`](../web-consent) — cookie consent components behind `./consent`
- [`@owlmeans/web-oidc-rp`](../web-oidc-rp) — OIDC relying party UI on the same Tailwind theme
- [`@owlmeans/web-router`](../web-router) — default OwlMeans routing plugin
- [`@owlmeans/mui-panel`](../mui-panel) — legacy Material UI implementation of the same surface

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.32
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
