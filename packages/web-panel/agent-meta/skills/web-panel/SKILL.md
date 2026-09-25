---
name: web-panel
description: How to use @owlmeans/web-panel — base browser context factory (makeContext) with shadcn/Radix + Tailwind and the default OwlMeans router wired in, plus the two-layer navigation shell (NavLayout/TopNav/SideNav/Footer) and form/panel components. Auto-invoked when building a web app's makeContext, wiring its navigation or layout, or importing web panel components.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-panel

**Layer:** Web (React)
**Install:** `"@owlmeans/web-panel": "^0.1.18-rc.62"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeContext<C, T>(cfg)` | Base web context factory (shadcn/Radix + default OwlMeans router) |
| `NavLayout` | The application shell — header, section menu, screen menu, content, footer |
| `TopNav` / `SideNav` / `MobileNav` / `Footer` | The shell's pieces, mountable on their own |
| `Toaster` | The application's toast surface — mounted once, in the layout |
| `ThemeToggle` / `useColorScheme` | The light/dark switcher (`ThemeToggleProps`, `ThemeToggleLabels`) and the hook behind it (`ColorSchemeModel`) — see *Light and dark* below |
| `SocketReloadDialog` | The global "connection lost — try again / reload" prompt (opt in via `cfg.socket.reloadDialog`) `PanelApp` mounts automatically — see below. The hooks it reads, `useSocketStatus` and `useSocketRetry`, are imported from `@owlmeans/client-socket`, not from this package |
| `Link` | An `<a>` addressing an entrypoint alias (or a literal `src`), with the label taken from i18n |
| `LoginScreen` / `LocalizedLoginScreen` / `appendLoginScreen` | The identity-provider choice screen — see `login-methods`. `LoginScreen` is pure w.r.t. `locale` too, exactly like `translate`: it is a prop, defaulting to nothing, never an implicit `useLanguage()` read, because a component that reaches for i18n context directly crashes an app mounted without one. `LocalizedLoginScreen` supplies `useLanguage()`'s value when the caller does not pass its own |
| `render(context, opts?)` | Mounts the tree inside `PanelApp`, with the browser language detector installed on the i18n instance. `opts` is `RenderOptions` plus `rootClassName` |
| `PanelApp` | That wrapper on its own — the themed root `div` plus the i18n provider — for a host that mounts the tree itself |
| `useContext<C, T>()` | The current context, from React. `AppContext` adds `context.flow()` over `@owlmeans/web-client`'s |
| `entrypoints` | The base declaration list — `@owlmeans/web-client`'s plus `@owlmeans/api-config-client`'s. Compose the app's own over it |
| `Block` / `Text` / `Status` | The shadcn `Card` panel with an optional `Actions` footer, a heading/paragraph whose copy comes from the panel namespace, and the shadcn `Alert` resolving a `ResilientError` to a translated message |
| `Form` / `TextInput` / `Button` / `SubmitButton` / `ButtonSelector` | The web form family. `Form` builds its own `useForm` + `ajvResolver` and borrows only `FormContext` and `schemaToFormDefault` from `@owlmeans/client-panel`; `TextInput` drives `react-hook-form`'s `Controller` directly, and the buttons call `handleSubmit` directly — none of them wraps `ClientForm`, `InputCtrl` or `ActionCtrl` |
| `ImageUploader` / `Layout` | The uploader in a drop target with a preview, and a plain content wrapper (the shell is `NavLayout`) |
| `scalingToStyles(h, v)` | `BlockScaling` → the width/height utility classes the panels share |
| `useBreakPoint()` | The current Tailwind breakpoint name, tracked on `resize` (`lg` when there is no `window`) |
| `useMapBreakpoint(map, def?, breakpoint?)` | The `map` entry for the current breakpoint (or for the `breakpoint` passed), falling back to `def`. It **throws a `SyntaxError`** when neither yields a value, so give it a `def` or cover every breakpoint |
| Re-exports from `@owlmeans/client-panel` | Cross-platform panel primitives, incl. `usePanelNav` and the `PanelNav*` types |
| Re-exports from `@owlmeans/client` / `@owlmeans/client-entrypoint` / `@owlmeans/route` | `bind`, `bindAll`, `bindScreen`, `handler`, `lazyHandler` / `lazyComponent` (+ `LazyHandler` / `LazyComponent` / `LazyComponentOptions` types — see the `client` skill), `provideRequest`, `stab`, `route`, `croute`, `frontend`, `useNavigate`, `useEntrypoint`, `useValue` |
| Re-exports from the surrounding layers | `config`, `service`, `addWebService`, `AppType` / `HOME` / `ROOT` / `BASE` / `GUEST`, `DISPATCHER`, `CAUTHEN_FLOW_ENTER`, `DAUTH_GUARD`, `bindExternalAuthentication`, `Dispatcher`, `appendWebAuthService`, `flow` / `configureFlows` / `useFlow` / `FLOW_PARAM` / `SERVICE_PARAM`, `useI18n*` / `useLanguage` / `composePrefix`, `addI18nApp` / `addI18nLib` / `SUPPORTED_LNGS` |

## Subpath Exports

- `./auth` — auth panel components for web
- `./auth/entrypoints` — auth panel entrypoint declarations
- `./consent` — the cookie consent dialog and policy, bound to this app's i18n, plus a menu-row
  widget and a presence service so a host's own collapsed menu can take over the floating button's
  job
- `./scheme` — the React-free colour-scheme half: `COLOR_SCHEME_KEY`, `COLOR_SCHEME_EVENT`,
  `ColorSchemeChoice`, `readColorScheme`, `applyColorScheme`, `colorSchemeBootstrapScript` — safe
  to import from a Node build script

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

### Navigation — `NavLayout`

`NavLayout` is the application shell. A layout entrypoint binds a component that renders it and
nothing else; the matched screen arrives as `children`. Keep the navigation as data in its own
module (`src/nav.ts`) so screens, entrypoints and the shell all read the same aliases.

```tsx
import { NavLayout, HOME } from '@owlmeans/web-panel'
import type { PanelNavConfig, PanelNavLink } from '@owlmeans/web-panel'

export const navConfig: PanelNavConfig = {
  sections: [
    { name: 'home', label: 'Home', items: [{ alias: HOME, label: 'Overview' }] },
    {
      name: 'demo', label: 'Demo', items: [
        { alias: web.session, label: 'Session' },
        { alias: web.about, label: 'About' },
      ]
    },
  ],
}

export const footerLinks: PanelNavLink[] = [
  { alias: HOME, label: 'My App' },
  { href: 'https://owlmeans.com', label: 'OwlMeans', open: true },
]

export const MainLayout: FC<PropsWithChildren> = ({ children }) =>
  <NavLayout nav={navConfig} title="My App" footer={footerLinks}>{children}</NavLayout>
```

**Navigation is two-layer.** The top menu lists **sections** — the first level; the side menu lists
the **active section's screens** — the second. A section holding a single screen renders **no side
menu at all**: the model owns that rule (`showSide`), so a section that later grows a second screen
gains its menu with no layout change. `NavLayout` mounts `SideNav` twice — `variant="side"` as the
`hidden md:block` column beside the content, `variant="bar"` as the `md:hidden` strip under the
header. Both render the same items; only one is visible at a time.

| Component | Props |
|---|---|
| `NavLayout` | `nav: PanelNavConfig`, `translate?`, `title?: ReactNode`, `home?: string` (brand target — defaults to the first section's first item), `actions?: ReactNode`, `mobileMenu?: boolean`, `skipLinkLabel?: string \| false`, `themeToggle?: boolean \| { labels? }`, `footer?: PanelNavLink[] \| ReactNode`, `headerClassName?`, `contentClassName?`, `containerClassName?`, `className?`, `style?` |
| `TopNav` | `config: PanelNavConfig`, `translate?`, `ariaLabel?`, `className?`, `style?` |
| `SideNav` | the same, plus `variant?: 'side' \| 'bar'` |
| `MobileNav` | the same as `TopNav`; `ariaLabel` names the landmark inside the sheet, `className`/`style` land on the trigger button |
| `Footer` | `links?: PanelNavLink[]`, `content?: ReactNode` (a full-width block — see below), `translate?`, `containerClassName?` (the shell's rhythm, so the footer row lines up with the header and content), `children?` (joins the centred link row), `themeToggle?: boolean \| { labels? }` (the switcher beside the credit), `className?`, `style?` |
| `ShellCredit` / `useShellCredit` | `className?`; the platform/owner credit line `Footer` always renders — see below |

**The narrow-viewport menu is opt-in: `mobileMenu`.** Off (the default) the shell is exactly the
two-layer layout above at every width. On, below `md` (768px) the section menu is hidden
(`hidden md:flex`) and `MobileNav` puts a menu button — accessible name "Menu", a 44px target, a
solid focus ring — at the end of the actions row, so `actions` ("Get started", sign-in) stay in
the header at every width. The button opens a shadcn `Sheet` from the right listing every section:
a multi-screen section as its name over links to its screens, a single-screen section as one link
carrying the section's own label, so no destination appears twice. Labels, keys and `translate`
are the menus' own (`nav.<section>`, `modules.<alias>`); the button's name, the sheet title and
its close button resolve `shell.menu` / `shell.close` — outside the `nav.` family, because an
app may have a section called `menu`. Rules the component owns:

- **The screen strip is not mounted when `mobileMenu` is on.** The sheet already lists the active
  section's screens; a strip under the header would be a second menu for the same level. The side
  column (`hidden md:block`) is untouched — wide viewports are the same shell either way.
- **An entry navigates AND closes from its own click handler.** It is an `<a href>` (focusable,
  openable in a new tab) whose `onClick` calls `preventDefault()` for in-app navigation — which a
  dialog never notices, so a sheet left to close itself stays open over the screen it just
  navigated to.
- **The sheet states both halves of its surface** (`bg-background text-foreground`): it is
  portalled to the document body and inherits nothing from the shell.
- Pinned by `nav.spec.ts` → "the narrow-viewport menu", at 375px and 1280px, with and without
  the prop (`?mobileMenu=1` in the harness).

**The skip link comes first, and `main` is its target.** `NavLayout` renders
`<a href="#main" data-skip-link>` as the FIRST child of its root — before `<header>`, never inside
it, because `header > div` (first) is the shared-rhythm row the layout pins locate. It is `sr-only`
until focused, then a pill fixed in the top-left corner (`bg-foreground text-background`,
`rounded-full`, `z-50`, the 3px `--ring` focus ring); its padding is `focus:`-only, since a plain
`px-*` sorts after `sr-only` and leaves a padded box behind the clip. Activating it focuses
`<main id="main" tabIndex={-1}>` by hand (`preventDefault` + `focus()`), because a fragment
navigation changes the location and the router reads that as navigation. The label is
`skipLinkLabel`, defaulting to `translate('shell.skip', 'Skip to content')`. `skipLinkLabel={false}`
renders no link AND leaves `main` without the id: an application rendering its own skip link owns
its own `#main`, and no two elements may share it. A screen never renders a second `<main>`.
Pinned by `nav.spec.ts` → "the skip link" (Tab from the page start, Enter lands on `main#main`,
`?skip=off`).

**A node `footer` is a full-width block, never a replacement.** An array renders the centred link
row. A node — an application's own footer layout: a brand, a description, link columns — goes to
`Footer`'s `content` and renders as a `w-full self-stretch text-start` block (`data-footer-content`)
inside the footer's container, above the credit. The container keeps `items-center` for the link
row and the credit; only the block stretches. It used to land INSIDE the centred link row, where
it shrink-wrapped to its content in the middle of the page. `ShellCredit` stays the last thing the
footer renders in every case — the container's own last child, or, with `themeToggle`, first in the
bottom row `[data-footer-bottom]` with the switcher after it. Pinned by `nav.spec.ts` → "a node footer" (`?footer=node`).

**The style slots are REGIONS, and each region is its own SURFACE.** `className` is the root —
the full-height page *behind* the header, side menu and footer. `headerClassName` is the sticky
top bar. `contentClassName` is the content area. `containerClassName` is width and padding for
all three at once, never colour.

The header paints an opaque background of its own, because it is sticky and content scrolls
beneath it. That makes it a **different surface from the root**, so it states `text-foreground`
alongside its `bg-background` — not as decoration, and not redundantly. A root carrying a
contrasting pair (`className="bg-primary text-primary-foreground"`, an ordinary dark shell)
otherwise inherits its near-white foreground into a near-white bar, and every header child that
states no colour of its own — the brand, a ghost-variant action button — is painted in the
foreground of a surface it is not on. It type-checks, it builds, it renders, and the menu is
invisible. Pinned by `tests/nav.spec.ts` → "the header is its own surface", which measures
rendered lightness rather than class names; the harness root carries a dark shell permanently so
every navigation test runs against that case.

**The header is opaque even when `headerClassName` fails to be.** Behind the header's own visible
content sits a `[data-nav-backdrop]` layer that always paints `bg-background`, at negative
z-index inside the header's own `isolate` stacking context — so it never covers a caller's actual
header content, only whatever the header's own background would have been. It exists because
`headerClassName` is free text a design or restyle pass writes, and three shapes of it leave
tailwind-merge with no background utility at all on the header: a bare `bg-transparent`, an alpha
surface (`bg-<x>/50`), or Tailwind v3's dead syntax for referencing a CSS variable
(`bg-[--my-var]` — square brackets; v4's real shorthand is `bg-(--my-var)`, parentheses). Any of
those used to leave the sticky header fully see-through, with page content visibly scrolling
through the menu. A caller that genuinely wants a coloured bar still gets it: `headerClassName`'s
own background renders on top of the backdrop. Pinned by `nav.spec.ts` → "a broken headerClassName
still leaves the backdrop layer opaque".

**`Footer` always renders the platform/owner credit line, and there is no prop that hides it.**
Below the content block and the links (or on its own, when a layout passes no `footer` at all — `NavLayout` renders
`<Footer>` unconditionally now), `ShellCredit` shows "Powered by OwlMeans" and the owner's own
copyright notice, resolved from `security.auth.login.credit` via `resolveCredit`
(`@owlmeans/client-auth/login`) — the SAME resolver and the SAME config the sign-in screen's
`LoginCredit` reads, so an owner who pays to drop the platform credit (`poweredBy: false`) drops
it everywhere, not only on a screen a signed-in visitor may never see again. Order is the opposite
of the sign-in screen's: the owner's own notice leads, the platform credit follows — a footer is
read as "whose page is this, and who built it". The links row and the credit are both centred
(`justify-center`), not left-aligned. `useShellCredit()` is exported separately so a caller that
needs to know whether there is anything to show (without rendering it) can ask, exactly how
`Footer` itself decides whether to render `null`. Pinned by `nav.spec.ts` → "the shell footer
credit".

**Every style slot is MERGED over its default — none of them substitutes.** `className`,
`headerClassName`, `contentClassName` and `containerClassName` all go through `cn`, so a caller
names only the utility it wants to move and tailwind-merge drops just the one it conflicts with.
This matters most for `containerClassName`, whose default is a four-part rhythm
(`mx-auto w-full max-w-6xl px-4`): a design asking for a wider page writes `max-w-[1280px]` and
means *wider*, not *unpadded and uncentred*. Substituting there took `px-4` and `mx-auto` down
with the width and left the header, content and footer all flush to the window edge. Pinned by
`nav.spec.ts` → "a width-only rhythm override keeps the side padding"; the harness passes a
width-only override permanently.

**A dark top bar is asked for with `headerClassName`**, giving it both halves
(`bg-secondary text-secondary-foreground`) — never by colouring the root and expecting the bar
to follow.

**The shell reads exactly these colour variables**: `--background` (page and top bar),
`--foreground` (active section link), `--muted-foreground` (resting section links),
`--accent`/`--accent-foreground` (active side-menu item), `--border` (the header, side-menu and
footer rules) and `--primary` — the footer renders its entries through `Link`, which paints
`text-primary`; `mobileMenu` adds `--ring` (the menu button's and the sheet entries' focus rings)
and a `bg-black/50` overlay. It reads **no `--sidebar*` variable at all**. So `--muted-foreground` is not merely
the text colour of the `--muted` surface — it is secondary text sitting directly on `--background`,
and a theme that lightens it to suit a dark muted panel loses its top menu.

Rules that make the shell behave:

- **Labels never reach for i18n implicitly.** `translate` is a **prop** (`NavTranslate`), defaulting
  to `defaultNavTranslate`, which returns the fallback. An app mounted with `renderApp` from
  `@owlmeans/web-client` has no i18n provider, and the panel i18n hook dereferences `i18n.options`
  on the empty object `react-i18next` returns without an instance — a throw inside render that
  blanks the whole app. An app that does have i18n passes its own
  `(key, defaultValue) => string` resolver. Order: literal `label` → `translate(key, humanized)` →
  humanized alias. Default keys are
  `nav.<section>` for sections and `modules.<alias>` for items and footer links — the same family
  `Link` uses.
- **Menu entries are real links.** `TopNav` puts the resolved path on `href` and calls
  `preventDefault()` in `onClick`, navigating in-app through `nav.press`. Never drop the `href`: an
  `<a>` without one is not focusable, does not answer the keyboard, cannot be opened in a new tab,
  and does not even carry the `link` role.
- **A parent route needs a `default: true` child.** A frontend entrypoint that has children but no
  child declared `default: true` renders blank at its own path — give a grouping screen an index
  child at `'/'`.
- **Vendor `navigation-menu` and `sheet`.** `SideNav` builds on the package-local `Button`; `TopNav`
  uses the package-local shadcn `navigation-menu` primitive and `MobileNav` the package-local
  `sheet` (over `@radix-ui/react-dialog`, a peer) — see the package-boundary rule below.

### Light and dark — `ThemeToggle`, `useColorScheme`, `./scheme`

The standard switcher, with no theme library behind it. `NavLayout themeToggle` (or `Footer
themeToggle`) puts it in the footer's bottom row beside the credit, whatever `footer` is; absent or
`false`, the footer's DOM is what it is without one. It is also mountable on its own.

**The contract is two classes on `<html>`.** `dark` = the visitor chose dark, `light` = chose light,
neither = follow the operating system. The choice is stored under `COLOR_SCHEME_KEY`
(`owlmeans:color-scheme`, `localStorage`, every access in `try`). `light` exists as a class of its
own because a visitor choosing light on a dark system has no other way to say so to a stylesheet
that paints dark under `prefers-color-scheme: dark`. So a consumer's CSS must read BOTH:

```css
:root { color-scheme: light; /* light tokens */ }
.dark { color-scheme: dark; /* dark tokens */ }
@media (prefers-color-scheme: dark) {
  :root:not(.light) { color-scheme: dark; /* the same dark tokens */ }
}
/* Tailwind v4: a `dark:` variant that follows the same rule */
@custom-variant dark {
  &:where(.dark, .dark *) { @slot; }
  @media (prefers-color-scheme: dark) { &:where(:root:not(.light), :root:not(.light) *) { @slot; } }
}
```

A theme with dark tokens under `.dark` alone never follows the OS; one with them under the media
query alone ignores an explicit light choice.

**The head bootstrap goes before any stylesheet paints.** `colorSchemeBootstrapScript()` returns a
self-contained inline script that puts the stored choice's class on `<html>` before first paint —
the only moment it can; a component doing it after mount shows a visitor who chose dark one frame
of the light page. A build step inlines it into `index.html` (import it from
`@owlmeans/web-panel/scheme` — that module imports nothing, React included) and a CSP that hashes
inline scripts must hash it. Without the bootstrap, `useColorScheme` re-applies the stored class on
mount: correct, one frame late.

Rules the pieces own:

- **The toggle flips the RESOLVED scheme** (`choice ?? system`), never the stored choice alone: on
  a dark system with nothing stored the first press means light. The icon is the scheme the page
  is in (sun while light, moon while dark), chosen in script, not by a `dark:` variant.
- **The accessible name says what pressing does** — `labels.toLight` / `labels.toDark`, English
  defaults; `NavLayout` resolves them through `translate` (`shell.toLight`, `shell.toDark`).
- **One choice per document.** `applyColorScheme(choice | null)` sets the class, stores or clears
  the key and dispatches `COLOR_SCHEME_EVENT`, so every mounted `useColorScheme` agrees at once;
  another tab's change arrives through `storage`, and an OS switch through `matchMedia` while
  nothing is stored. `setChoice(null)` hands the page back to the OS.
- **Look:** a 44px round target, `text-muted-foreground` → `hover:text-foreground`, the 3px
  `--ring` focus ring, no fill, border, gradient or shadow.

Pinned by `tests/scheme.spec.ts` (`?themeToggle=1`): the module's imports, the bootstrap string,
the class flip and persistence, the resolved flip under an emulated dark system, a node footer,
and the absent case.

### Toasts — `Toaster`

An action that succeeded or failed says so in a toast. The surface is `Toaster`; the messages are
`toast.success(...)` / `toast.error(...)` imported from **`sonner`** by whatever raised them.

```tsx
import { NavLayout, Toaster } from '@owlmeans/web-panel'

export const MainLayout: FC<PropsWithChildren> = ({ children }) => <>
  <NavLayout nav={navConfig} title="My App">{children}</NavLayout>
  <Toaster />
</>
```

- **Mount it exactly once, in the layout.** `toast()` writes to a module-global store, so two
  mounted `Toaster`s render every message twice and none renders any of them — both failures are
  silent, which is why `tests/toaster.spec.ts` asserts the count rather than the presence.
- **Colours come from the app's own tokens** — `--popover`, `--popover-foreground`, `--border` —
  so a toast matches every other floating surface. A caller's `style` merges over them.
- **The theme follows the `.dark` class on the document element**, not a theme provider: the
  package reads the class an app's `next-themes`, the owl theme provider, or a hand-written
  toggle all set, and depends on none of them. Pass `theme` explicitly to override.
- Defaults are `richColors`, `closeButton`, `duration={5000}`, `position="top-right"`; every one
  of them, and every other `ToasterProps` field, is overridable per app.
- `sonner` is a dependency of this package, so nothing is required of the consumer — but an app
  raising its own toasts should declare `sonner` too, at a range that resolves to the same copy.

### Reload prompt — `SocketReloadDialog`

`makeContext` calls `appendSocketStatus` from `@owlmeans/client-socket` unconditionally, and
`PanelApp` mounts `SocketReloadDialog` as a sibling of the Router — exactly where
`PanelCookieConsent` lives, and for the same reason: a dialog mounted inside a route is torn down
on every navigation. Neither does anything unless an app opts in:

```typescript
cfg.socket = { reloadDialog: true }
```

Once any `ws()`/`useWs()` connection in the app has exhausted its own retry budget
(`useSocketStatus() === 'lost'`), a global, blocking `AlertDialog` covers the screen — no Escape,
no outside click, two actions:

- **"Try again"** (`data-socket-retry-action`) — `useSocketRetry().retry()` revives every lost
  connection (see the `client-socket` skill). The dialog stays up with the button disabled and
  reading "Reconnecting…" while they retry, closes once the aggregate is `'online'`, and offers
  both buttons again if it falls back to `'lost'`.
- **"Reload page"** (`data-socket-reload-action`) — `window.location.reload()`, the fallback that
  always works.

The status service also retries by itself when the tab becomes visible, the window gains focus or
the browser comes back online, so a socket that died in a background tab is usually back before
anyone presses anything — an open dialog shows "Reconnecting…" through that too. Strings are
lib-tier (`useI18nLib('socket', 'reload')`: `title`, `description`, `action`, `retry`,
`retrying`), 8 languages, under `src/components/socket/i18n/`.

Leave `cfg.socket.reloadDialog` unset (or `false`) for an app that would rather show its own
inline "reconnecting…" state — `useSocketStatus()` from `@owlmeans/client-socket` serves that,
independent of the dialog.

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

### Forms — `Form`, `TextInput`, the buttons

`WebFormProps` is `@owlmeans/client-panel`'s `FormProps` plus `className` and `style`. `Form` holds
the whole model itself — `useForm` with `mode: 'all'`, `delayError: 300`, an `ajvResolver` over
`validation` with `coerceTypes` and the `ajv-formats` formats — and publishes it through
`FormProvider` plus `FormContext`, so every control below reads one form.

```tsx
import { Form, TextInput, SubmitButton, Button } from '@owlmeans/web-panel'

<Form decorate validation={schema} onSubmit={async (data, update) => { await save(data); update(data) }}>
  <TextInput name="email" label placeholder hint />
  <TextInput name="password" type="password" label="Password" />
</Form>
```

- **`decorate` switches the whole rendering.** With `decorate={true}` the fields go inside a shadcn
  `Card`, the root error surfaces through `Status`, and a `SubmitButton` is rendered in the
  `CardFooter` **whenever `onSubmit` is given** — the caller writes no action. Without it (the
  default) `Form` is a bare flex column: no card, no root-error surface, no submit button, so the
  caller renders its own action. `horizontal`/`vertical` scaling, `className` and `style` land on
  the `Card` when decorated and on that column otherwise.
- **`formRef`** — a `useFormRef()` ref filled with `{ form, update, loader, error }`, which is how a
  caller drives the form, flips the loader, or plants a field/root error from outside.
- **`TextInput` takes `label`, `placeholder` and `hint` as `string | boolean`.** `true` resolves
  `<name>.label` / `<name>.placeholder` / `<name>.hint` from the form namespace; a string is used
  verbatim; anything else renders nothing. It also takes `name`, `def`, `type` (any HTML input type,
  default `text`) and `disableAutocomplete`. A field error replaces the hint line.
- **`Button`** takes a required `label`, `onClick`, `loader` (a `Toggleable` — open disables the
  button and shows the spinner), `size` (`small`/`medium`/`large`), `fullWidth`, and `variant`,
  which maps the MUI vocabulary onto shadcn (`contained` → `default`, `outlined` → `outline`,
  `text` → `ghost`) and forwards a shadcn variant name unchanged.
- **`SubmitButton`** is that button bound to `handleSubmit`, taking `onSubmit` (or `onClick`) and a
  `label` defaulting to `submit`. It resolves the label with the form `t` itself and passes it down
  with `i18n.suppress` set, so the label is translated once.
- **`ButtonSelector`** renders one `Button` per entry of `options`, the one equal to `current`
  `contained` and the rest `outlined`, calling `onSelect(option)`. `name` prefixes each option's
  label key as `<name>.<option>`.

### The terms confirmation — `LoginTerms`, `LoginPrivacyNotice`

`components/login/terms.tsx` renders `LoginTermsModel` (`@owlmeans/client-panel/auth`) via
`termsSentence` + `termsLabelResolver` (`@owlmeans/client-auth/login`) rather than re-deriving
link/label pairs itself. **`[data-login-terms]` marks exactly one checkbox — or NONE, once
`model.terms.deferred` is true** (`LoginScreen` renders `LoginTerms` when not deferred,
`LoginPrivacyNotice` when it is): an e2e suite elsewhere in the platform treats the checkbox as a
strict, at-most-one-match locator, so a change here must never add a second one, whatever
billing/product/custom documents a configuration adds. `[data-login-privacy]` is a SIBLING
paragraph of the checkbox's `<label>`, never nested inside it — a privacy disclosure is not
something the checkbox consents to — and it is exported ON ITS OWN as `LoginPrivacyNotice`: it
still renders while deferred, since the disclosure was never the checkbox's to remove. A linked
document/notice fragment carries `data-login-document="<key>"`. `[data-login-revised]` renders only
when NOT deferred and the resolved terms carry a `revisedAt` (i.e. the configuration set
`showRevision: true` and at least one document has its own revision date) — deferred, that date
belongs to the document the checkbox agreed to, and there is no checkbox on this screen to attach it
to. `LoginTerms`/`LoginPrivacyNotice` take `locale?: string` — from `LoginScreen`'s own `locale`
prop, never read from context directly — for `Intl.ListFormat` and a custom document's locale-keyed
`labelMap`. Method buttons carry `aria-disabled={model.blocked || undefined}`, never a literal
`"false"` — a deferred screen (which never sets `blocked`) then renders identically to an unblocked
ordinary one, with no special case. Pinned by `tests/login.spec.ts` → the "with billing, product and
custom documents configured" and "the Terms confirmation deferred to a step" blocks.

## Subpath: `./consent`

`PanelCookieConsent` and `PanelCookiePolicy` — `@owlmeans/web-consent`'s components bound to this
app's language and translations, falling through to the package's own seven-language bundle for
every key the app has not overridden. See the `consent` skill.

A re-export does not move Tailwind class strings, so a consumer adds a second `@source` for
`@owlmeans/web-consent` alongside this package's — pointing at **`src`**, for the reason spelled out
under *Consumer setup* below. Without it the dialog renders half-styled.

**A service wrapping a state resource is what lets a host's own menu take over the floating
button's job.** `appendConsentWidgetService(context, alias?)` registers a ref-counted presence
service (`@owlmeans/state`'s `appendStateResource` behind `@owlmeans/context`'s `createService`) —
call it once, from the app's own `context.ts`, the same as any other `append*` mixin:

```ts
import { appendConsentWidgetService } from '@owlmeans/web-panel/consent'

appendConsentWidgetService<C, T>(context)
```

Then call `useConsentMenuPresence()` from the host menu's own **always-mounted** shell component,
never from inside the row. A dropdown's content (Radix `DropdownMenuContent` and most headless
menu content primitives) mounts its children only while the menu is OPEN, so presence announced
from inside the row hid the floating button only while the dropdown happened to be open, and
showed it again the instant it closed. The row is also not a `DropdownMenuItem`: an item takes the
inner button's focus and closes the menu on the click before the button's own handler runs.

```tsx
import { PanelConsentMenuWidget, useConsentMenuPresence } from '@owlmeans/web-panel/consent'

const MyMenu: FC = () => {
  useConsentMenuPresence()   // declares the row reachable for as long as THIS component is mounted
  return <DropdownMenu>
    <DropdownMenuTrigger>…</DropdownMenuTrigger>
    <DropdownMenuContent>
      <div className="px-2 py-1.5"><PanelConsentMenuWidget /></div>   {/* a plain row, not an item */}
    </DropdownMenuContent>
  </DropdownMenu>
}
```

`PanelCookieConsent` reads the same service (`useConsentWidgetPresent()`, internally) and computes
`noReopenButton` from it whenever the caller has not passed one explicitly — an app that both
mounts `PanelCookieConsent` at its root and calls `useConsentMenuPresence()` from its collapsed
menu gets the floating button exactly while the menu is not, with no further wiring. Ref-counted
rather than a boolean latch, because more than one menu shell can be mounted for one commit during
a layout transition (a stale header still showing its own collapsed menu while a new screen's own
menu has already mounted) and because React 18 StrictMode double-invokes mount/cleanup in dev.

**The pair a consumer imports** — the dialog and the control that takes over its floating button:

| Job | Import from `@owlmeans/web-panel/consent` | Where it goes |
|---|---|---|
| The consent dialog (and its floating re-open button) | `PanelCookieConsent` | Beside the router — a `PanelApp` child — once |
| Remember the language only while the visitor granted `functional` cookies | `installConsentLanguage()` | Once, in the bootstrap, BEFORE `prepareI18n` — wires `client-i18n`'s persistence guard, and applies a language that arrived with a link from another OwlMeans domain once the grant is saved |
| The "Cookie settings" control in a footer or menu | `PanelConsentMenuWidget` (`label`, `className`, `onSelect?` — defaults to `openConsent('reopen')`) | Inside the host's own footer/menu |
| Hiding the floating button while that control is reachable | `useConsentMenuPresence()` | Called by the always-mounted component that renders the control |
| Registering the presence service | `appendConsentWidgetService(context)` | The app's `context.ts` |

A footer is the simplest host, because it is always mounted — the control and the presence call
live in one component:

```tsx
const CookieSettings: FC = () => {
  useConsentMenuPresence()
  return <PanelConsentMenuWidget label={t('footer.cookies')} className="w-auto text-muted-foreground" />
}
```

The widget renders a `<button data-consent-menu-widget>` styled as a menu row (`w-full`,
`text-popover-foreground`, `hover:bg-accent`); a footer passes `className` to restyle it (merged
through `cn`) and its own `label` — the packaged default reads "Cookie preferences".

**The presence service is optional, and nothing throws without it.** `PanelCookieConsent` checks
the context for `consentWidget` and, when `appendConsentWidgetService` never ran, renders the plain
bound dialog with its floating button; `useConsentMenuPresence()` then has nothing to claim and
does nothing. The presence read itself (`useConsentWidgetPresent`) still needs the service — its
state resource is registered by it — so any other caller checks first. A dialog that read an
unregistered state resource threw inside render ("Resource consent-widget-presence not found") and
blanked the whole application. Pinned by `tests/consent.spec.ts` (`?consent=bare` / `?consent=menu`).

## Consumer setup — package boundary and Tailwind

`web-panel` ships its shadcn primitives and `cn` helper as private implementation files under its
own `build/@/` tree. Package source imports them only through relative specifiers; it must never
emit an absolute `@/…` import, because that alias belongs to the consuming application and makes a
fresh installation depend on unrelated files. `cn` is not exported: a consumer keeps its own
class-name helper and never vendors or imports this package's UI primitives.

Consumers still supply the package's peer dependencies: the Radix primitives (`alert-dialog`,
`dialog`, `label`, `navigation-menu`, `progress`, `separator`, `slot`) plus React, Tailwind and the
usual utility libraries. A consumer may have its own shadcn `@` alias, but it is unrelated to this package.

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
- Peers (app-provided): `react`, `react-dom`, `react-hook-form`, `tailwindcss`, `tailwind-merge`,
  `clsx`, `class-variance-authority`, `lucide-react`, `ajv`, and the `@radix-ui/react-*` primitives
  (`alert-dialog`, `dialog`, `label`, `navigation-menu`, `progress`, `separator`, `slot`). No MUI,
  no react-router.
- `ajv-formats` is imported at module scope by the form model but is declared in no dependency
  section of the manifest, which lists `ajv` alone. An install that does not otherwise pull it in
  fails at import time, so declare `ajv-formats` next to `ajv` in the consuming application.
