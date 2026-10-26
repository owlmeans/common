---
name: navigation
description: The application shell — NavLayout, TopNav/SideNav/MobileNav/Footer, the two-layer nav config, the narrow-viewport menu, the skip link, the footer credit and the header's surface rules.
metadata:
  purposes: navigation, layout, screen
  mentions: NavLayout, TopNav, SideNav, MobileNav, Footer, ShellCredit, useShellCredit, PanelNavConfig, PanelNavLink, NavTranslate, defaultNavTranslate, mobileMenu, skipLinkLabel, headerClassName, containerClassName
---

# @owlmeans/web-panel — Navigation shell

## Navigation — `NavLayout`

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
| `NavLayout` | `nav: PanelNavConfig`, `navTestId?: string`, `translate?`, `title?: ReactNode`, `home?: string` (brand target — defaults to the first section's first item), `actions?: ReactNode`, `mobileMenu?: boolean`, `skipLinkLabel?: string \| false`, `themeToggle?: boolean \| { labels? }`, `footer?: PanelNavLink[] \| ReactNode`, `headerClassName?`, `contentClassName?`, `containerClassName?`, `className?`, `style?` |
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
  `sheet` (over `@radix-ui/react-dialog`, a peer) — see *Consumer setup — package boundary and Tailwind* in [SKILL.md](../SKILL.md).

## Stable selectors and detail screens

`PanelNavSection.testId` and `PanelNavItem.testId` optionally name their rendered destinations;
`NavLayout.navTestId` names the desktop navigation landmark. With `mobileMenu`, only the current
viewport's section menu is mounted, keeping the same destination selector unique when the sheet
opens. Side/bar item selectors are emitted only by the visible variant. Hosts keep their selectors
in navigation data rather than querying translated text or styling classes.

When an unlisted detail screen has no listed ancestor, the headless model selects the section of
the longest listed pathname prefix. This covers sibling route declarations such as `/items` and
`/items/:id` without changing their route hierarchy.
