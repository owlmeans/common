---
name: web-panel
description: How to use @owlmeans/web-panel — base browser context factory (makeContext) with shadcn/Radix + Tailwind and the default OwlMeans router wired in, plus the two-layer navigation shell (NavLayout/TopNav/SideNav/Footer) and form/panel components. Auto-invoked when building a web app's makeContext, wiring its navigation or layout, or importing web panel components.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-panel

**Layer:** Web (React)
**Install:** `"@owlmeans/web-panel": "^0.1.18-rc.32"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeContext<C, T>(cfg)` | Base web context factory (shadcn/Radix + default OwlMeans router) |
| `NavLayout` | The application shell — header, section menu, screen menu, content, footer |
| `TopNav` / `SideNav` / `Footer` | The shell's pieces, mountable on their own |
| `Toaster` | The application's toast surface — mounted once, in the layout |
| `Link` | An `<a>` addressing an entrypoint alias (or a literal `src`), with the label taken from i18n |
| `LoginScreen` / `LocalizedLoginScreen` / `appendLoginScreen` | The identity-provider choice screen — see `login-methods` |
| `render(context, opts?)` | Mounts the tree inside `PanelApp`, with the browser language detector installed on the i18n instance. `opts` is `RenderOptions` plus `rootClassName` |
| `PanelApp` | That wrapper on its own — the themed root `div` plus the i18n provider — for a host that mounts the tree itself |
| `useContext<C, T>()` | The current context, from React. `AppContext` adds `context.flow()` over `@owlmeans/web-client`'s |
| `entrypoints` | The base declaration list — `@owlmeans/web-client`'s plus `@owlmeans/api-config-client`'s. Compose the app's own over it |
| `Block` / `Text` / `Status` | The shadcn `Card` panel with an optional `Actions` footer, a heading/paragraph whose copy comes from the panel namespace, and the shadcn `Alert` resolving a `ResilientError` to a translated message |
| `Form` / `TextInput` / `Button` / `SubmitButton` / `ButtonSelector` | The web form family. `Form` builds its own `useForm` + `ajvResolver` and borrows only `FormContext` and `schemaToFormDefault` from `@owlmeans/client-panel`; `TextInput` drives `react-hook-form`'s `Controller` directly, and the buttons call `handleSubmit` directly — none of them wraps `ClientForm`, `InputCtrl` or `ActionCtrl` |
| `ImageUploader` / `Layout` | The uploader in a drop target with a preview, and a plain content wrapper (the shell is `NavLayout`) |
| `scalingToStyles(h, v)` | `BlockScaling` → the width/height utility classes the panels share |
| `cn(...inputs)` | The class-name merger the components are written against — an app never re-declares it |
| `useIsMobile()` / `MOBILE_BREAKPOINT` | Viewport narrower than Tailwind's `md` (768), matched with `matchMedia` |
| `useBreakPoint()` | The current Tailwind breakpoint name, tracked on `resize` (`lg` when there is no `window`) |
| `useMapBreakpoint(map, def?, breakpoint?)` | The `map` entry for the current breakpoint (or for the `breakpoint` passed), falling back to `def`. It **throws a `SyntaxError`** when neither yields a value, so give it a `def` or cover every breakpoint |
| Re-exports from `@owlmeans/client-panel` | Cross-platform panel primitives, incl. `usePanelNav` and the `PanelNav*` types |
| Re-exports from `@owlmeans/client` / `@owlmeans/client-entrypoint` / `@owlmeans/route` | `entrypoint`, `elevate`, `handler`, `provideRequest`, `stab`, `route`, `croute`, `frontend`, `guard`, `useNavigate`, `useEntrypoint`, `useValue` |
| Re-exports from the surrounding layers | `config`, `service`, `addWebService`, `AppType` / `HOME` / `ROOT` / `BASE` / `GUEST`, `DISPATCHER`, `CAUTHEN_FLOW_ENTER`, `DAUTH_GUARD`, `setupExternalAuthentication`, `Dispatcher`, `appendWebAuthService`, `flow` / `configureFlows` / `useFlow` / `FLOW_PARAM` / `SERVICE_PARAM`, `useI18n*` / `useLanguage` / `composePrefix`, `addI18nApp` / `addI18nLib` / `SUPPORTED_LNGS` |

## Subpath Exports

- `./auth` — auth panel components for web
- `./auth/entrypoints` — auth panel entrypoint declarations
- `./consent` — the cookie consent dialog and policy, bound to this app's i18n
- `./jobs` — `JobProgress`, `JobStatus`, `useJobToasts` over `@owlmeans/queue` records

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

`NavLayout` is the application shell. A layout entrypoint elevates a component that renders it and
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
| `NavLayout` | `nav: PanelNavConfig`, `translate?`, `title?: ReactNode`, `home?: string` (brand target — defaults to the first section's first item), `actions?: ReactNode`, `footer?: PanelNavLink[] \| ReactNode`, `headerClassName?`, `contentClassName?`, `containerClassName?`, `className?`, `style?` |
| `TopNav` | `config: PanelNavConfig`, `translate?`, `ariaLabel?`, `className?`, `style?` |
| `SideNav` | the same, plus `variant?: 'side' \| 'bar'` |
| `Footer` | `links?: PanelNavLink[]`, `translate?`, `containerClassName?` (the shell's rhythm, so the footer row lines up with the header and content), `children?`, `className?`, `style?` |

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
`text-primary`. It reads **no `--sidebar*` variable at all**. So `--muted-foreground` is not merely
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
- **Vendor `navigation-menu`.** `SideNav` builds on the existing `Button`; `TopNav` uses the shadcn
  `navigation-menu` primitive — see the `@` contract below.

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

## Subpath: `./jobs`

Three presentational pieces for a queue job, over `JobRecord` from `@owlmeans/queue`. They take
records — `@owlmeans/client-job`'s `useJobs()` maps straight onto them — and hold no store, no
socket and no strings of their own.

```tsx
import { JobProgress, JobStatus, useJobToasts } from '@owlmeans/web-panel/jobs'

const jobs = useJobs().map(model => model.record)
useJobToasts(jobs)

<JobStatus job={job} labels={{ [JobState.Active]: t('jobs.running') }} />
<JobProgress job={job} />
```

| Export | Description |
|---|---|
| `JobProgress` | The shadcn `Progress` bar. `job.progress` is read as a number, `{ percent }` or `{ done, total }`; anything else animates INDETERMINATE, because zero and "the processor never called `progress()`" look identical otherwise |
| `JobStatus` | The state pill. `data-state` carries the raw state, so a test never keys on the wording |
| `jobProgressValue(job)` | The percentage the bar shows, or `undefined` |
| `useJobToasts(jobs, opts?)` | One toast per job the first time it settles, on the `Toaster` the layout already mounts |

- **No packaged wording.** The states are broker vocabulary; the sentence an app wants for them
  ("Queued", "Rendering", "Ready") is its own copy in its own namespace, so `JobStatus` takes a
  `labels` map and otherwise renders the raw state — data, not an untranslated string.
- **`useJobToasts` never toasts on its first pass.** A screen opening onto a store seeded with
  yesterday's finished jobs would fire a stack of them at once, so everything already settled at
  mount is recorded as announced and only what settles afterwards is reported.
- It needs the same single `Toaster` as everything else — see above.

## Subpath: `./consent`

`PanelCookieConsent` and `PanelCookiePolicy` — `@owlmeans/web-consent`'s components bound to this
app's language and translations, falling through to the package's own seven-language bundle for
every key the app has not overridden. See the `consent` skill.

A re-export does not move Tailwind class strings, so a consumer adds a second `@source` for
`@owlmeans/web-consent` alongside this package's — pointing at **`src`**, for the reason spelled out
under *Consumer setup* below. Without it the dialog renders half-styled.

## Consumer setup — the `@` contract and Tailwind

`web-panel` emits `@/components/ui/*` and `@/lib/utils` verbatim; the app's bundler resolves `@` to
its own shadcn copy. Vendor every primitive the package imports: `alert`, `button`, `card`, `input`,
`label`, `navigation-menu`, `progress` (plus `separator` if you use it), and add
`@radix-ui/react-navigation-menu` alongside the other Radix peers.

The vendored `@/lib/utils` stays — the package's own components resolve `cn` through it — but the
app's own components import `cn` from `@owlmeans/web-panel` instead of declaring a third copy. The
public export is a package-owned function, deliberately not a re-export of `@/lib/utils`: that
specifier is emitted verbatim and would resolve back to the consumer's file.

Then point Tailwind at the installed package's **`src`**. Its oxide scanner reads the CSS root
plus `@source` directives only, and excludes `node_modules` — so classes that exist **only** inside
`web-panel` components (the whole navigation shell and footer) never reach the stylesheet, and the
app renders an unstyled menu. In the app's Tailwind entry:

```css
@import "tailwindcss";

@source "../../../node_modules/@owlmeans/web-panel/src";
```

Adjust the relative depth to your own layout. **Point at `src`, never at `build`:** the scanner
applies the `.gitignore` of whatever repository a path resolves into, and a linked `node_modules`
entry resolves into a monorepo whose `.gitignore` covers every package build directory — a `build`
source there scans zero files and reports nothing, while the shell renders unstyled with nothing to
blame. `src` is tracked in the repository and ships in the published tarball, so one path serves a
linked checkout and an npm install alike.

## Depends On

- `@owlmeans/web-client`, `@owlmeans/client-panel`, `@owlmeans/client-i18n`, `@owlmeans/web-router`
- `@owlmeans/queue` — `JobRecord` / `JobState`, read by the `./jobs` subpath
- Peers (app-provided): `react`, `react-dom`, `react-hook-form`, `tailwindcss`, `tailwind-merge`,
  `clsx`, `class-variance-authority`, `lucide-react`, `ajv`, and the `@radix-ui/react-*` primitives
  (`label`, `navigation-menu`, `progress`, `separator`, `slot`). No MUI, no react-router.
- `ajv-formats` is imported at module scope by the form model but is declared in no dependency
  section of the manifest, which lists `ajv` alone. An install that does not otherwise pull it in
  fails at import time, so declare `ajv-formats` next to `ajv` in the consuming application.
