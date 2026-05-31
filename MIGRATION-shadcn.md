# Migration guide — MUI → shadcn for `@owlmeans/web-panel` and `@owlmeans/web-oidc-rp`

Phase 1 of the OwlMeans web UI migration replaces Material UI with shadcn /
Tailwind v4 in `@owlmeans/web-panel` and `@owlmeans/web-oidc-rp`. This
document explains what changed, how to upgrade an application, and how to
stay on Material UI without code changes.

## TL;DR

| Old (MUI)                                       | New (shadcn)                                       |
| ----------------------------------------------- | -------------------------------------------------- |
| `@owlmeans/web-panel` ≤ 0.1.1                   | `@owlmeans/mui-panel` ≥ 0.1.2  *(same code, renamed)* |
| `@owlmeans/web-oidc-rp` ≤ 0.1.1                 | `@owlmeans/mui-oidc-rp` ≥ 0.1.2 *(same code, renamed)* |
| —                                               | `@owlmeans/web-panel` 0.1.2 *(new, shadcn-based)*  |
| —                                               | `@owlmeans/web-oidc-rp` 0.1.2 *(new, shadcn-based)* |

The package names `@owlmeans/web-panel` and `@owlmeans/web-oidc-rp` now
ship a shadcn implementation. Apps that want to stay on MUI swap the
import to the `mui-*` twins.

## I want to keep Material UI — no breaking changes

Change every import once:

```diff
- import { PanelApp } from '@owlmeans/web-panel'
+ import { PanelApp } from '@owlmeans/mui-panel'

- import {} from '@owlmeans/web-oidc-rp/auth/plugins'
+ import {} from '@owlmeans/mui-oidc-rp/auth/plugins'
```

The `mui-*` packages have the identical export surface, peer-deps, and
behaviour as the previous `web-*` packages. No other changes are needed.

## I want to upgrade to shadcn — what to do

The new `@owlmeans/web-panel` and `@owlmeans/web-oidc-rp` keep the same
public API surface, but rely on the consuming app to provide the shadcn
primitives via a `@/*` path alias.

### 1. Install peer dependencies

```sh
bun add @radix-ui/react-label @radix-ui/react-progress @radix-ui/react-separator @radix-ui/react-slot \
        class-variance-authority clsx tailwind-merge lucide-react tailwindcss@^4
```

### 2. Vendor the shadcn primitives this package needs

For `@owlmeans/web-panel`:

```sh
npx shadcn add button card input label progress alert separator
```

For `@owlmeans/web-oidc-rp`:

```sh
npx shadcn add progress
```

### 3. Add Tailwind v4 theme tokens

Add the OKLCH theme tokens used by the packages to your app's
`src/@/globals.css` (refer to
[`packages/web-panel/src/@/globals.css`](../packages/web-panel/src/@/globals.css)
for the full reference). Key tokens consumed by this package:

```css
@theme {
  --color-background, --color-foreground;
  --color-card, --color-card-foreground;
  --color-primary, --color-primary-foreground;
  --color-secondary, --color-secondary-foreground;
  --color-muted, --color-muted-foreground;
  --color-accent, --color-accent-foreground;
  --color-destructive;
  --color-success;                              /* used by <Status ok /> */
  --color-border, --color-input, --color-ring;
  --radius: 0.625rem;

  @keyframes progress-indeterminate {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
}
```

### 4. Configure bundler alias

Vite example:

```ts
// vite.config.ts
import { fileURLToPath, URL } from 'node:url'
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/@', import.meta.url)),
    },
  },
})
```

### 5. Address breaking type-surface changes

These three are the only intentional source-level breaks. Everything
else is layout-compatible.

#### a) `styles?: SxProps` is gone — use `className` / `style`

```diff
- <Block styles={{ pt: 2, px: 1 }}>...</Block>
+ <Block className="pt-2 px-1">...</Block>

- <Text styles={{ color: 'text.secondary' }}>...</Text>
+ <Text className="text-muted-foreground">...</Text>
```

Affected: `BlockProps`, `TextProps`, `LinkProps`, `LayoutProps`, `WebFormProps`.

#### b) `variant` on `<Text>` / `<Link>` is now `TextVariant`

The literal union: `'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'lead' | 'large' |
'small' | 'muted' | 'blockquote'`. There is no MUI Typography variant
support anymore.

```diff
- <Text variant="body1">...</Text>
+ <Text variant="p">...</Text>

- <Text variant="caption">...</Text>
+ <Text variant="small">...</Text>     // or "muted"
```

#### c) `theme?: Theme` is replaced with `rootClassName?: string`

```diff
- import { render } from '@owlmeans/web-panel'
- import { createTheme } from '@mui/material'
- const theme = createTheme({ palette: { primary: { main: '#123456' } } })
- render(context, theme)
+ import { render } from '@owlmeans/web-panel'
+ render(context, { rootClassName: 'min-h-screen bg-background' })

- <PanelApp theme={theme}>...</PanelApp>
+ <PanelApp rootClassName="min-h-screen bg-background">...</PanelApp>
```

Theme customisation now happens via Tailwind v4 CSS variables in your
app's `globals.css` (see step 3) and per-component `className` props.

### 6. Other minor adjustments

- **Buttons**: `variant` still accepts `'contained' | 'outlined' | 'text'`
  (mapped to shadcn `default`/`outline`/`ghost`); also accepts the shadcn
  variants directly (`default`, `destructive`, `outline`, `secondary`,
  `ghost`, `link`).
- **Button sizes**: `'small' | 'medium' | 'large'` map to shadcn
  `sm`/`default`/`lg`.
- **`scalingToStyles()`** returns a className string now, not a
  `SxProps` object. The `theme?: Theme` parameter has been removed.
- **`useBreakPoint` / `useMapBreakpoint`** use Tailwind's default static
  breakpoints (`xs` <640, `sm` 640, `md` 768, `lg` 1024, `xl` 1280).
  Customise these via your `tailwind.config` if you need different
  breakpoints.
- **Progress indicator** in tunnel-consumer, basic-ed25519, re-captcha,
  oidc-client, google-client now uses shadcn `Progress`. In indeterminate
  mode it animates via the `progress-indeterminate` keyframe — make sure
  step 3 added the `@keyframes` block.
- **`tunnel-consumer` QR code colors** read `--color-primary` and
  `--color-card` from `:root` at runtime. Provide these tokens in your
  theme.

## What didn't change

- Package name (`@owlmeans/web-panel`, `@owlmeans/web-oidc-rp`).
- Public exports map (`.`, `./auth`, `./auth/modules`, `./auth/plugins`).
- All non-component runtime: form validation (ajv + RHF), i18n,
  ajvResolver, plugin registration mechanics, context/modules wiring,
  auth flow logic.
- `@owlmeans/client-panel` (the headless layer) — unchanged.
- All other `@owlmeans/web-*` packages (`web-client`, `web-flow`,
  `web-router`, `web-wl`, `web-db`, `web-oidc-provider`) — those are
  framework-agnostic and contain no MUI references.

## Sanity check

After upgrading:

```sh
bun install
bun run build
bun run test
```

The application should compile and your existing tests should pass with
no logical changes — only the visual styling source changes from MUI's
runtime theme to Tailwind CSS variables.

## Related

- [`packages/web-panel/README.md`](../packages/web-panel/README.md) — full
  shadcn web-panel README.
- [`packages/mui-panel/`](../packages/mui-panel/) — MUI twin.
- [`packages/web-oidc-rp/README.md`](../packages/web-oidc-rp/README.md).
- [`packages/mui-oidc-rp/`](../packages/mui-oidc-rp/) — MUI twin.
- [`.claude/skills/shadcn-web/SKILL.md`](../.claude/skills/shadcn-web/SKILL.md)
  — authoritative `src/@/*` alias contract.
