---
name: web-panel
description: How to use @owlmeans/web-panel — base browser context factory (makeContext) with shadcn/Radix + Tailwind and the default OwlMeans router wired in, plus the two-layer navigation shell (NavLayout/TopNav/SideNav/Footer) and form/panel components. Auto-invoked when building a web app's makeContext, wiring its navigation or layout, or importing web panel components.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-panel

**Layer:** Web (React)
**Install:** `"@owlmeans/web-panel": "^0.1.18-rc.13"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeContext<C, T>(cfg)` | Base web context factory (shadcn/Radix + default OwlMeans router) |
| `NavLayout` | The application shell — header, section menu, screen menu, content, footer |
| `TopNav` / `SideNav` / `Footer` | The shell's pieces, mountable on their own |
| `components` submodule | shadcn/Radix panel/form components |
| Re-exports from `@owlmeans/client-panel` | Cross-platform panel primitives, incl. `usePanelNav` and the `PanelNav*` types |
| `main`, `exports`, `context`, `modules`, `types` | Wiring helpers |

## Subpath Exports

- `./auth` — auth panel components for web
- `./auth/modules` — auth panel module declarations

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
  context.makeContext = makeContext as typeof context.makeContext
  return context
}
```

### Navigation — `NavLayout`

`NavLayout` is the application shell. A layout entrypoint elevates a component that renders it and
nothing else; the matched screen arrives as `children`. Keep the navigation as data in its own
module (`src/nav.ts`) so screens, modules and the shell all read the same aliases.

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
| `Footer` | `links?: PanelNavLink[]`, `translate?`, `children?`, `className?`, `style?` |

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

**The shell reads exactly five theme variables**: `--background` (page and top bar),
`--foreground` (active section link), `--muted-foreground` (resting section links) and
`--accent`/`--accent-foreground` (active side-menu item). It reads **no `--sidebar*` variable at
all**. So `--muted-foreground` is not merely the text colour of the `--muted` surface — it is
secondary text sitting directly on `--background`, and a theme that lightens it to suit a dark
muted panel loses its top menu.

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

## Consumer setup — the `@` contract and Tailwind

`web-panel` emits `@/components/ui/*` and `@/lib/utils` verbatim; the app's bundler resolves `@` to
its own shadcn copy. Vendor every primitive the package imports: `alert`, `button`, `card`, `input`,
`label`, `navigation-menu`, `progress` (plus `separator` if you use it), and add
`@radix-ui/react-navigation-menu` alongside the other Radix peers.

Then point Tailwind at the built package. Its oxide scanner reads the CSS root plus `@source`
directives only, and excludes `node_modules` — so classes that exist **only** inside `web-panel`
components (the whole navigation shell and footer) never reach the stylesheet, and the app renders
an unstyled menu. In the app's Tailwind entry:

```css
@import "tailwindcss";

@source "../../../node_modules/@owlmeans/web-panel/build";
```

Adjust the relative depth to your own layout; the target is the installed package's `build`.

## Depends On

- `@owlmeans/web-client`, `@owlmeans/client-panel`, `@owlmeans/client-i18n`, `@owlmeans/web-router`
- Peers (app-provided): `react`, `react-dom`, `react-hook-form`, `tailwindcss`, `tailwind-merge`,
  `clsx`, `class-variance-authority`, `lucide-react`, `ajv`, and the `@radix-ui/react-*` primitives
  (`label`, `navigation-menu`, `progress`, `separator`, `slot`). No MUI, no react-router.
