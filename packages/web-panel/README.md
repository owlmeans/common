# @owlmeans/web-panel

shadcn UI + Tailwind v4 implementation of the OwlMeans web panel layer.
Wraps the headless `@owlmeans/client-panel` logic with shadcn primitives
instead of Material UI.

## When to use this package

- New OwlMeans web apps where the consumer owns its shadcn primitives and
  Tailwind v4 theme.
- Drop-in replacement for the previous Material-UI based `@owlmeans/web-panel`
  (which has been renamed to [`@owlmeans/mui-panel`](../mui-panel) for
  backwards-compatibility consumers).

## Install

```sh
bun add @owlmeans/web-panel@^0.1.18-rc.31
```

Peer requirements (the consuming app provides these): `react`, `react-dom`,
`react-hook-form`, `ajv`, `tailwindcss@^4`, `lucide-react`, `clsx`,
`tailwind-merge`, `class-variance-authority`, plus the radix primitives
listed in `peerDependencies`.

## Consumer setup — the `@` contract

This package imports its shadcn primitives as `@/components/ui/<name>` and
its utility as `@/lib/utils`. Build emits these specifiers verbatim
(TypeScript `moduleResolution: Bundler`). The consumer's bundler must
resolve `@/*` to its own shadcn primitive copy.

### 1. Add the package's primitives to your app

Generate the matching primitives in your app once. You can either copy them
from this package's `src/@/components/ui/` or use the shadcn CLI:

```sh
npx shadcn add button card input label progress alert separator navigation-menu
```

`navigation-menu` also needs `@radix-ui/react-navigation-menu` in your app's
dependencies — the `TopNav` section menu is built on it.

This package was authored against the shadcn `new-york` style with
`baseColor: neutral`. See `components.json` for the exact config.

### 2. Add Tailwind v4 theme tokens

The components rely on the following CSS variables (defined inside
`@theme` in your app's globals.css):

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

A working set is shipped at `src/@/globals.css` (for dev/test only).

### 3. Bundler alias

```ts
// vite.config.ts
resolve: { alias: { '@': fileURLToPath(new URL('./src/@', import.meta.url)) } }
```

### 4. Tailwind `@source` for this package

Tailwind's scanner reads your CSS root plus its `@source` directives, and it
excludes `node_modules`. Classes that exist only inside this package's
components — the whole navigation shell and footer — therefore never reach your
stylesheet unless you point Tailwind at the built package:

```css
@import "tailwindcss";

@source "../../../node_modules/@owlmeans/web-panel/build";
```

Adjust the relative depth to your own layout; the target is this package's
installed `build` directory.

## Navigation shell

`NavLayout` is the standard application shell — header, section menu, the active
section's screen menu, content, footer. A layout entrypoint elevates a component
that renders it and nothing else; the matched screen arrives as `children`.

```tsx
import { NavLayout, HOME } from '@owlmeans/web-panel'
import type { PanelNavConfig, PanelNavLink } from '@owlmeans/web-panel'

const navConfig: PanelNavConfig = {
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

const footerLinks: PanelNavLink[] = [
  { alias: HOME, label: 'My App' },
  { href: 'https://owlmeans.com', label: 'OwlMeans', open: true },
]

export const MainLayout: FC<PropsWithChildren> = ({ children }) => (
  <NavLayout nav={navConfig} title="My App" footer={footerLinks}>
    {children}
  </NavLayout>
)
```

Navigation is **two-layer**: the top menu lists sections, the side menu lists the
active section's screens. A section holding a single screen renders **no side
menu at all**. `NavLayout` mounts `SideNav` twice — a `hidden md:block` column
beside the content and a `md:hidden` strip under the header — so the same items
serve wide and narrow viewports.

| Component | Props |
|---|---|
| `NavLayout` | `nav`, `translate?`, `title?`, `home?` (brand target; defaults to the first section's first item), `actions?`, `footer?` (`PanelNavLink[]` renders the standard footer, a node replaces it), `contentClassName?`, `className?`, `style?` |
| `TopNav` | `config`, `translate?`, `ariaLabel?`, `className?`, `style?` |
| `SideNav` | the same, plus `variant?: 'side' \| 'bar'` |
| `Footer` | `links?`, `translate?`, `children?`, `className?`, `style?` |

The navigation model itself (`usePanelNav`, `PanelNavConfig`, `PanelNavItem`,
`PanelNavSection`, `PanelNavLink`, `NavTranslate`) is headless and lives in
[`@owlmeans/client-panel`](../client-panel); these components are its shadcn
rendering.

Two things to know when wiring it:

- **Labels do not use i18n unless you pass a resolver.** `translate` is a prop
  (`NavTranslate`), defaulting to one that returns the fallback, because an app
  rendered without an i18n provider throws if a menu reads the panel i18n
  context. Labels resolve as literal `label` → `translate(key, humanized)` →
  humanized alias, with default keys `nav.<section>` and `modules.<alias>`.
- **A parent route needs a `default: true` child.** A frontend entrypoint with
  children but no default child renders blank at its own path — give a grouping
  screen an index child at `'/'`.

## Breaking changes vs `@owlmeans/mui-panel`

This package keeps the same public name and re-export surface as the
previous MUI implementation, but the following props/types have changed:

- **`styles?: SxProps` is removed.** Use the new `className?: string` and
  `style?: React.CSSProperties` props instead. Affected: `BlockProps`,
  `TextProps`, `LinkProps`, `WebFormProps`, `LayoutProps`.
- **`variant` on `Text` / `Link` is now `TextVariant`**, a string-literal
  union: `'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'lead' | 'large' | 'small' |
  'muted' | 'blockquote'`. The previous MUI `TypographyOwnProps['variant']`
  union no longer applies.
- **`PanelAppProps.theme?: Theme` is replaced with
  `PanelAppProps.rootClassName?: string`.** Apply your theme via Tailwind
  classes / CSS variables instead of MUI's `Theme` object.
- **`render(context, theme?, opts?)` signature → `render(context, opts?)`**
  where `opts` includes the new `rootClassName?: string`.
- **`scalingToStyles()`** now returns a class-name string (composable with
  `cn()`), not an `SxProps` object. The `theme?: Theme` parameter is
  removed (Tailwind handles breakpoints declaratively).
- **`useBreakPoint` / `useMapBreakpoint`** now use Tailwind's static
  default breakpoints (`xs/sm/md/lg/xl`) instead of MUI's `Theme.breakpoints`.
  Customise via Tailwind config in the consuming app.
- **Component prop API for buttons** stays compatible (`'small' | 'medium'
  | 'large'`, `variant` strings `contained`/`outlined`/`text`/shadcn names).
  Internally they map to shadcn variants.

Consumers that need the previous MUI behaviour should swap to
[`@owlmeans/mui-panel`](../mui-panel) — same exports, MUI-rendered.

## Public exports

```ts
import {
  PanelApp, Layout, NavLayout, TopNav, SideNav, Footer,
  Form, TextInput, SubmitButton, Button, ButtonSelector,
  Block, Text, Link, Status, ImageUploader,
  scalingToStyles, useBreakPoint, useMapBreakpoint,
  render,
} from '@owlmeans/web-panel'

import { setupExternalAuthentication } from '@owlmeans/web-panel/auth'
import { entrypoints } from '@owlmeans/web-panel/auth/entrypoints'
```

## Related packages

- [`@owlmeans/mui-panel`](../mui-panel) — Material UI implementation of the
  same surface.
- [`@owlmeans/web-oidc-rp`](../web-oidc-rp) — companion OIDC/OAuth UI for
  this package; uses the same Tailwind theme.
- [`@owlmeans/client-panel`](../client-panel) — framework-agnostic headless
  form/layout logic this package wraps.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
