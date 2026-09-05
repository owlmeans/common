# shadcn-web — Reference

## Full `components.json` example

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/@/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "utils": "@/lib/utils",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

## Full `tsconfig.json` example

```json
{
  "extends": [
    "@owlmeans/dep-config/tsconfig.base.json",
    "@owlmeans/dep-config/tsconfig.react.json"
  ],
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/@/*"]
    },
    "rootDir": "./src/",
    "outDir": "./build/"
  },
  "exclude": ["./dist/**/*", "./build/**/*", "./tests/**/*", "./*.ts"]
}
```

## Full `src/@/globals.css` with complete `@theme` tokens

```css
@import "tailwindcss";

@source "../..";

@theme {
  /* Colors — OKLCH, light mode defaults */
  --color-background:         oklch(1 0 0);
  --color-foreground:         oklch(0.145 0 0);

  --color-card:               oklch(1 0 0);
  --color-card-foreground:    oklch(0.145 0 0);

  --color-popover:            oklch(1 0 0);
  --color-popover-foreground: oklch(0.145 0 0);

  --color-primary:            oklch(0.205 0 0);
  --color-primary-foreground: oklch(0.985 0 0);

  --color-secondary:          oklch(0.97 0 0);
  --color-secondary-foreground: oklch(0.205 0 0);

  --color-muted:              oklch(0.97 0 0);
  --color-muted-foreground:   oklch(0.556 0 0);

  --color-accent:             oklch(0.97 0 0);
  --color-accent-foreground:  oklch(0.205 0 0);

  --color-destructive:        oklch(0.577 0.245 27.325);
  --color-border:             oklch(0.922 0 0);
  --color-input:              oklch(0.922 0 0);
  --color-ring:               oklch(0.708 0 0);

  /* Radius */
  --radius: 0.625rem;

  /* Sidebar (if used) */
  --color-sidebar:            oklch(0.985 0 0);
  --color-sidebar-foreground: oklch(0.145 0 0);
  --color-sidebar-primary:    oklch(0.205 0 0);
  --color-sidebar-primary-foreground: oklch(0.985 0 0);
  --color-sidebar-accent:     oklch(0.97 0 0);
  --color-sidebar-accent-foreground: oklch(0.205 0 0);
  --color-sidebar-border:     oklch(0.922 0 0);
  --color-sidebar-ring:       oklch(0.708 0 0);
}

/* Dark mode via .dark class */
.dark {
  --color-background:         oklch(0.145 0 0);
  --color-foreground:         oklch(0.985 0 0);
  --color-card:               oklch(0.205 0 0);
  --color-card-foreground:    oklch(0.985 0 0);
  --color-popover:            oklch(0.205 0 0);
  --color-popover-foreground: oklch(0.985 0 0);
  --color-primary:            oklch(0.922 0 0);
  --color-primary-foreground: oklch(0.205 0 0);
  --color-secondary:          oklch(0.269 0 0);
  --color-secondary-foreground: oklch(0.985 0 0);
  --color-muted:              oklch(0.269 0 0);
  --color-muted-foreground:   oklch(0.708 0 0);
  --color-accent:             oklch(0.269 0 0);
  --color-accent-foreground:  oklch(0.985 0 0);
  --color-destructive:        oklch(0.704 0.191 22.216);
  --color-border:             oklch(1 0 0 / 10%);
  --color-input:              oklch(1 0 0 / 15%);
  --color-ring:               oklch(0.556 0 0);
}
```

## `src/@/lib/utils.ts`

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

## peerDependencies set

Every shadcn-based OwlMeans package declares the shadcn utility libs as peerDependencies. Radix UI packages (`@radix-ui/*`) are added per-component as primitives are copied in.

```json
{
  "peerDependencies": {
    "class-variance-authority": "*",
    "clsx": "*",
    "lucide-react": "*",
    "react": "*",
    "react-dom": "*",
    "react-hook-form": "*",
    "tailwind-merge": "*",
    "tailwindcss": "*"
  },
  "devDependencies": {
    "@owlmeans/dep-config": "workspace:*",
    "@owlmeans/test-ui": "^0.1.18-rc.15",
    "@tailwindcss/vite": "*",
    "@vitejs/plugin-react": "*",
    "playwright": "^1.49.0",
    "vite": "*"
  }
}
```

## MUI → shadcn component mapping

| MUI component | shadcn / Tailwind equivalent |
|---|---|
| `TextField` | `Input` + `Label` (from `@/components/ui/input`, `@/components/ui/label`) |
| `Button` | `Button` (from `@/components/ui/button`) |
| `IconButton` | `Button variant="ghost" size="icon"` |
| `Card` / `CardContent` / `CardActions` | `Card` / `CardContent` / `CardFooter` |
| `Grid container` | `div className="grid grid-cols-…"` or `flex` |
| `Grid item` | `div` with column-span utilities |
| `Box` | `div` with Tailwind utility classes |
| `Typography` variant h1–h6 | `h1`–`h6` with text-size/weight utilities |
| `Typography` variant body1/body2 | `p` with `text-sm` / `text-base` |
| `ThemeProvider` + `createTheme` | `@theme` block in `globals.css` (CSS variables) |
| `SxProps` | `className` prop with Tailwind utilities; `cn()` for conditional |
| `useTheme` | CSS variables accessed via `var(--color-primary)` — no hook needed |
| `useMediaQuery` | Tailwind responsive prefixes (`md:`, `lg:`) in `className` |
| `CssBaseline` | Tailwind Preflight (included in `@import "tailwindcss"`) |
| `FormHelperText` | `p className="text-sm text-destructive"` |
| `FormControl` / `FormLabel` | `FormItem` / `FormLabel` from `@/components/ui/form` |
| `Select` | `Select` + `SelectTrigger` / `SelectContent` / `SelectItem` |
| `Checkbox` | `Checkbox` (from `@/components/ui/checkbox`) |
| `Alert` | `Alert` + `AlertDescription` |
| `Tooltip` | `Tooltip` + `TooltipTrigger` / `TooltipContent` |
| `Dialog` | `Dialog` + `DialogTrigger` / `DialogContent` |
| `CircularProgress` | `Loader2` icon from `lucide-react` with `animate-spin`, or a custom spinner |
| `ButtonGroup` | `div className="flex"` with first/last border-radius overrides |
| `scalingToStyles()` helper | Tailwind spacing scale (`p-4`, `px-6`, `py-2`, etc.) |

## Tailwind v4 — the rules a package is written against

- Configuration lives in CSS `@theme` blocks. There is no `tailwind.config.js`.
- The entry is a single `@import "tailwindcss"`, not the three `@tailwind` directives.
- Vite plugin: `@tailwindcss/vite` (preferred), or `@tailwindcss/postcss` outside Vite.
- Colors are OKLCH.
- Vendoring prefixes and CSS imports is handled internally — a PostCSS chain needs neither
  `autoprefixer` nor `postcss-import`.
- `@source` adds extra scan paths beyond the auto-detected project root.

## `src/@/components/ui/button.tsx` — example primitive header

```tsx
// shadcn button — sourced from shadcn@2.x 2025-xx-xx
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors ...',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-white shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
```

## `tests/context.ts` full example (shadcn + Tailwind)

```ts
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

let url: string | null = null

export const getHarnessUrl = async (): Promise<string> => {
  if (url != null) return url
  const server = await createServer({
    configFile: false,
    root: resolve(here, './harness'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': resolve(here, '../src/@') },
    },
    server: { port: 0 },
  })
  await server.listen()
  const local = server.resolvedUrls?.local?.[0]
  if (local == null) throw new Error('vite did not expose a local URL')
  url = local
  return url
}

export const HARNESS_URL = await getHarnessUrl()
```

## `tests/harness/mount.tsx` stub (shadcn + Tailwind)

```tsx
import '../../src/@/globals.css'
import { createRoot } from 'react-dom/client'

const params = new URLSearchParams(window.location.search)
const componentName = params.get('component') ?? ''
const rawProps = params.get('props') ?? '{}'

let props: Record<string, unknown> = {}
try { props = JSON.parse(decodeURIComponent(rawProps)) } catch {}

const modules: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {
  // Register components available for testing:
  // Button: () => import('../../src/components/button/component.js'),
}

const loader = modules[componentName]
if (loader) {
  loader().then(({ default: Component }) => {
    const root = document.getElementById('root')!
    createRoot(root).render(<Component {...props} />)
  })
} else {
  document.getElementById('root')!.textContent = `Unknown component: ${componentName}`
}
```

## Radix UI — common peer deps by component

| Component copied | Radix peer dep |
|---|---|
| `accordion.tsx` | `@radix-ui/react-accordion` |
| `alert-dialog.tsx` | `@radix-ui/react-alert-dialog` |
| `avatar.tsx` | `@radix-ui/react-avatar` |
| `button.tsx` | `@radix-ui/react-slot` |
| `checkbox.tsx` | `@radix-ui/react-checkbox` |
| `dialog.tsx` | `@radix-ui/react-dialog` |
| `dropdown-menu.tsx` | `@radix-ui/react-dropdown-menu` |
| `label.tsx` | `@radix-ui/react-label` |
| `popover.tsx` | `@radix-ui/react-popover` |
| `scroll-area.tsx` | `@radix-ui/react-scroll-area` |
| `select.tsx` | `@radix-ui/react-select` |
| `separator.tsx` | `@radix-ui/react-separator` |
| `slot.tsx` | `@radix-ui/react-slot` |
| `switch.tsx` | `@radix-ui/react-switch` |
| `tabs.tsx` | `@radix-ui/react-tabs` |
| `tooltip.tsx` | `@radix-ui/react-tooltip` |
