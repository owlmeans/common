---
name: web-panel
description: How to use @owlmeans/web-panel — base browser context factory (makeContext) with shadcn/Radix + Tailwind and the default OwlMeans router wired in, the two-layer navigation shell (NavLayout/TopNav/SideNav/Footer), form/panel components, and the controlled JSON editor (`./editor`: JsonEditor), the standard icon + colour picker (`./picker`: IconColorPicker, ColorPicker, IconPicker, IconTile, ColorDot). Auto-invoked when building a web app's makeContext, wiring its navigation or layout, importing web panel components, or letting a person choose (or showing) an icon or a colour.
user-invocable: false
---

# @owlmeans/web-panel

**Layer:** Web (React)
**Install:** `"@owlmeans/web-panel": "^0.1.18-rc.82"` in `dependencies`

## Choosing a component

Pick the row for the job; the one-liner is the correct shape. Everything comes from the package
root unless the import column names a subpath.

| Job | Use | Import | Correct one-liner |
|---|---|---|---|
| The app's context — the base web context factory (shadcn/Radix + default OwlMeans router) | `makeContext` | root | `const context = makeContext<C, T>(cfg)` in `context.ts`, then `append*(context)` mixins |
| Mount the app | `render` (or `PanelApp` for a host that mounts itself) | root | `render(context)` |
| The application shell — header, section menu, screen menu, content, footer | `NavLayout` | root | `<NavLayout nav={navConfig} title="App" mobileMenu themeToggle>{children}</NavLayout>` |
| One piece of the shell | `TopNav` / `SideNav` / `MobileNav` / `Footer` / `ShellCredit` | root | `<Footer links={footerLinks} />` |
| Toasts | `Toaster` + `toast` from `sonner` | root | `<Toaster />` once, in the layout; `toast.success('Saved')` where the action ends |
| Light / dark switch | `ThemeToggle` / `useColorScheme`; head script from `./scheme` | root, `./scheme` | `<NavLayout themeToggle … />` |
| A link to a screen | `Link` | root | `<Link module={web.about} />` |
| A form | `Form`, `TextInput`, `SubmitButton`, `Button`, `ButtonSelector` | root | `<Form decorate validation={schema} onSubmit={save}><TextInput name="email" label /></Form>` |
| A panel, a heading, an error | `Block`, `Text`, `Status` | root | `<Status error={error} />` |
| An image upload | `ImageUploader` (react-dropzone options) | root | `<ImageUploader accept={{ 'image/*': [] }} onDrop={files => upload(files[0])} previewUrl={url} />` |
| "Connection lost" prompt | `SocketReloadDialog` (mounted by `PanelApp`) | root | `cfg.socket = { reloadDialog: true }` |
| The sign-in screen | `LoginScreen` / `LocalizedLoginScreen` / `appendLoginScreen` | root | `appendLoginScreen(context, { Logo })` |
| Cookie consent | `PanelCookieConsent`, `PanelConsentMenuWidget` | `./consent` | `<PanelCookieConsent />` as a `PanelApp` child |
| A person picks an icon AND a colour (a type's, a flow's, a label's mark) | `IconColorPicker` | `./picker` | `<IconColorPicker label="Mark" value={{ icon, color }} onChange={next => …} translate={usePickerTranslate()} />` |
| A person picks a colour only | `ColorPicker` | `./picker` | `<ColorPicker label="Colour" value={color} onChange={setColor} />` |
| A person picks an icon only | `IconPicker` | `./picker` | `<IconPicker label="Icon" value={icon} onChange={setIcon} color={color} />` |
| The same, inline in a dialog the app already owns | `ColorSwatches`, `IconGrid` | `./picker` | `<IconGrid value={icon} onChange={setIcon} color={color} />` |
| Show a chosen mark or colour (list, chip, header) | `IconTile`, `ColorDot` | `./picker` | `<IconTile icon={type.icon} color={type.tone} size="sm" />` |
| Palette, icon names, colour maths — no React | `PICKER_*`, `pickerColorHelper`, `pickerIconHelper` | `./picker/vocabulary` (`pickerIconHelper`, `PICKER_ICONS`: `./picker`) | `pickerColorHelper.styleOf(color)` |
| Editable or read-only JSON | `JsonEditor` | `./editor` | `<JsonEditor key={record.id} value={draft} onChange={setDraft} onValidityChange={setValid} ariaLabel="Record JSON" />` |
| The current breakpoint | `useBreakPoint` / `useMapBreakpoint` | root | `useMapBreakpoint({ xs: 1, md: 2 }, 3)` |

**Common mistakes:**

- **Importing the package's private primitives.** `src/@/components/ui/*` (button, sheet, popover …)
  and its `cn` are not exports; an app keeps its own shadcn components and never imports
  `@owlmeans/web-panel/build/@/…` or expects `@/components/ui` to resolve to this package's copy.
- **A missing `@source`.** The app's Tailwind entry must scan this package's `src`
  (`@source "../../../node_modules/@owlmeans/web-panel/src";`) or every class used only here — the
  shell, the footer, the picker — silently never reaches the stylesheet.
- **Two `Toaster`s.** Mount it once, in the layout: two render every toast twice.
- **`Form decorate` plus an own submit button.** `decorate` already renders the `Card`, the root
  error and a `SubmitButton` whenever `onSubmit` is given; without `decorate` there is no submit
  button at all and the caller renders one.
- **A `Select`, radio group or hand-made swatch row for a colour or an icon a person chooses, or
  `` `text-${color}-600` `` / `` `text-tone-${…}` `` built from a stored value.** A person-chosen colour
  or icon is always edited with the `./picker` parts and rendered with `IconTile` / `ColorDot` (or
  `pickerColorHelper.styleOf`); code-chosen tones (a status's meaning) stay the app's own classes.
- **`usePickerTranslate()` outside `PanelApp` / `render()`.** It needs the i18n instance and throws
  without one; the picker parts themselves never read i18n (pass `translate`, or get English).

## Key Exports

Rows the chooser above already covers (`makeContext`, the shell pieces, `Toaster`, `Link`) are not
repeated here, and the rows of `ThemeToggle`, `SocketReloadDialog`, `LoginScreen` and the
`Form` family live in their parts.

| Export | Description |
|--------|-------------|
| `LoginProviderNote` | The provider disclosure (`LoginProviderNoteProps`) — see [parts/sign-in.md](parts/sign-in.md) |
| `render(context, opts?)` | Mounts the tree inside `PanelApp`, with the browser language detector installed on the i18n instance. `opts` is `RenderOptions` plus `rootClassName` |
| `PanelApp` | That wrapper on its own — the themed root `div` plus the i18n provider — for a host that mounts the tree itself |
| `useContext<C, T>()` | The current context, from React. `AppContext` adds `context.flow()` over `@owlmeans/web-client`'s |
| `entrypoints` | The base declaration list — `@owlmeans/web-client`'s plus `@owlmeans/api-config-client`'s. Compose the app's own over it |
| `Block` / `Text` / `Status` | The shadcn `Card` panel with an optional `Actions` footer, a heading/paragraph whose copy comes from the panel namespace, and the shadcn `Alert` resolving a `ResilientError` to a translated message |
| `ImageUploader` / `Layout` | The uploader in a drop target with a preview, and a plain content wrapper (the shell is `NavLayout`) |
| `scalingToStyles(h, v)` | `BlockScaling` → the width/height utility classes the panels share |
| `useBreakPoint()` | The current Tailwind breakpoint name, tracked on `resize` (`lg` when there is no `window`) |
| `useMapBreakpoint(map, def?, breakpoint?)` | The `map` entry for the current breakpoint (or for the `breakpoint` passed), falling back to `def`. It **throws a `SyntaxError`** when neither yields a value, so give it a `def` or cover every breakpoint |
| Re-exports from `@owlmeans/client-panel` | Cross-platform panel primitives, incl. `usePanelNav` and the `PanelNav*` types |
| Re-exports from `@owlmeans/client` / `@owlmeans/client-entrypoint` / `@owlmeans/route` | `bind`, `bindAll`, `bindScreen`, `handler`, `lazyHandler` / `lazyComponent` (+ `LazyHandler` / `LazyComponent` / `LazyComponentOptions` types — see the `client` skill), `clientRequestHelper` (`provideRequest`), `stab`, `route`, `croute`, `frontend`, `useNavigate`, `useEntrypoint`, `useValue` |
| Re-exports from the surrounding layers | `config`, `service`, `addWebService`, `AppType` / `HOME` / `ROOT` / `BASE` / `GUEST`, `DISPATCHER`, `CAUTHEN_FLOW_ENTER`, `DAUTH_GUARD`, `bindExternalAuthentication`, `Dispatcher`, `appendWebAuthService`, `flow` / `configureFlows` / `useFlow` / `FLOW_PARAM` / `SERVICE_PARAM`, `useI18n*` / `useLanguage` / `composePrefix`, `i18nHelper` (`addI18nApp` / `addI18nLib`) / `SUPPORTED_LNGS` |

## Subpath Exports

- `./auth` — auth panel components for web
- `./auth/entrypoints` — auth panel entrypoint declarations
- `./consent` — the cookie consent dialog and policy, bound to this app's i18n, plus a menu-row
  widget and a presence service so a host's own collapsed menu can take over the floating button's
  job — see [parts/consent.md](parts/consent.md)
- `./scheme` — the React-free colour-scheme half, safe to import from a Node build script — see
  [parts/theme.md](parts/theme.md)
- `./picker` — the standard icon + colour picker and its parts, not re-exported by the root; and
  `./picker/vocabulary`, its React-free half (palette, icon names, `pickerColorHelper`), safe on a
  server, in a seed or a Node build script — see [parts/picker.md](parts/picker.md)

## Usage

### In `context.ts`
```typescript
import { makeContext as makeBasicContext } from '@owlmeans/web-panel'
import { appendOidcGuard } from '@owlmeans/web-oidc-rp'
import { appendStateResource } from '@owlmeans/state'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg)
  appendOidcGuard<C, T>(context)
  appendStateResource<C, T>(context, VIB_PROJECT_STATE)
  return context
}
```

**A context is created once per process, by one factory.** An app factory calls the factory of the
layer below it, applies idempotent `append*(context)` mixins, and returns that same context — the
whole shape of the file above. Nothing is stored for re-creation, and every service, resource and
entrypoint binds to exactly the one context it was appended to.

### Links — `Link`

`Link` renders an `<a>` whose `href` is the entrypoint's own answer: it asks
`entrypoint.url()` and puts the result on the anchor, so a link into another service comes out
absolute and a link inside this one comes out as a path. Address a screen by **alias** (or hand it
the entrypoint you already hold); `src` is the escape hatch for a literal URL.

```tsx
import { Link } from '@owlmeans/web-panel'

<Link module={web.about} />                                  // label from `modules.<alias>`
<Link module={web.session} name="nav.session">Session</Link>  // explicit i18n key
<Link src="https://owlmeans.com" open>OwlMeans</Link>         // literal target, new tab
```

Resolution is asynchronous — `href` is absent for the first paint and settles once the URL is
known — so never key a test or a layout on the anchor having an `href` synchronously. The label
falls back to `modules.<alias>` when neither `name` nor `children` is given, `open` adds
`target="_blank"` with `rel="noopener noreferrer"`, and `center` centres the text.

## Consumer setup — package boundary and Tailwind

`web-panel` ships its shadcn primitives and `cn` helper as private implementation files under its
own `build/@/` tree. Package source imports them only through relative specifiers; it must never
emit an absolute `@/…` import, because that alias belongs to the consuming application and makes a
fresh installation depend on unrelated files. `cn` is not exported: a consumer keeps its own
class-name helper and never vendors or imports this package's UI primitives.

Consumers still supply the package's peer dependencies: the Radix primitives (`alert-dialog`,
`dialog`, `label`, `navigation-menu`, `popover`, `progress`, `separator`, `slot` — `dialog` and
`popover` on the same Radix generation) plus React, Tailwind and the usual utility libraries. A
consumer may have its own shadcn `@` alias, but it is unrelated to this package.

Then point Tailwind at the installed package's **`src`** directory. Its oxide scanner reads the CSS root
plus `@source` directives only, and excludes `node_modules` — so classes that exist **only** inside
`web-panel` components (the whole navigation shell and footer) never reach the stylesheet, and the
app renders an unstyled menu. In the app's Tailwind entry:

```css
@import "tailwindcss";

@source "../../../node_modules/@owlmeans/web-panel/src";
```

Adjust the relative depth to your own layout. Source ships in the published tarball and is tracked
in a linked workspace, so it is the reliable scan target in both modes.

## Depends On

- `@owlmeans/web-client`, `@owlmeans/client-panel`, `@owlmeans/client-i18n`, `@owlmeans/web-router`
- `@owlmeans/client-socket` — `appendSocketStatus`, `useSocketStatus`, `useSocketRetry`, behind `SocketReloadDialog`
- `react-colorful` — the custom-colour wheel of `./picker` (`customColors`); `sonner` — toasts
- Peers (app-provided): `react`, `react-dom`, `react-hook-form`, `tailwindcss`, `tailwind-merge`,
  `clsx`, `class-variance-authority`, `lucide-react` (`./picker` imports its ~250 catalogue icons
  statically), `ajv`, and the `@radix-ui/react-*` primitives (`alert-dialog`, `dialog`, `label`,
  `navigation-menu`, `popover`, `progress`, `separator`, `slot`). No MUI, no react-router.
- `ajv-formats` is imported at module scope by the form model but is declared in no dependency
  section of the manifest, which lists `ajv` alone. An install that does not otherwise pull it in
  fails at import time, so declare `ajv-formats` next to `ajv` in the consuming application.

## Parts

Load a part on top of this core when its job is in play.

| Part | Load it when |
|---|---|
| [editor](parts/editor.md) | Editing or displaying JSON, syntax diagnostics, controlled text, read-only previews and document identity |
| [navigation](parts/navigation.md) | Building or restyling the application shell — `NavLayout`, `TopNav`/`SideNav`/`MobileNav`/`Footer`, the nav config, `mobileMenu`, the skip link, the footer credit, the header surface |
| [forms](parts/forms.md) | Writing a form (`Form`, `TextInput`, the buttons) or raising a toast (`Toaster`, `sonner`, the permission-denied toast) |
| [theme](parts/theme.md) | Adding the light/dark switch (`ThemeToggle`, `useColorScheme`), the head bootstrap from `./scheme`, or CSS that follows the scheme |
| [reload](parts/reload.md) | Opting into the "connection lost" prompt (`cfg.socket.reloadDialog`, `SocketReloadDialog`) |
| [sign-in](parts/sign-in.md) | Changing the sign-in screen's terms confirmation, privacy notice or provider disclosure |
| [consent](parts/consent.md) | Mounting cookie consent through `./consent`, its geo gate, or a host menu's cookie-settings row |
| [picker](parts/picker.md) | Letting a person choose an icon or a colour, or rendering a stored mark (`./picker`) |
