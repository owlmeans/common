---
name: shadcn-web
description: How to build and maintain shadcn UI + Tailwind v4 web packages in the OwlMeans framework. Auto-invoked when editing components.json, tailwind.config.*, globals.css, or files under components/ui/. Use when creating a new shadcn-based web package or adding shadcn components.
user-invocable: false
scope: general
---

# shadcn UI + Tailwind v4 web packages — OwlMeans pattern

Shadcn-based web packages are the **next-generation Web layer**, replacing MUI `web-panel` over time. They sit at the same architecture layer (Web), wrap the same headless `@owlmeans/client-panel` logic, and follow the same `web-panel` package shape — swapping MUI + Emotion for shadcn UI + Tailwind CSS v4.

See `reference.md` in this skill folder for full code examples (components.json, tsconfig, globals.css @theme tokens, peerDeps, cn(), MUI→shadcn mapping table).

## The `@` contract — core rule

Three invariants govern every shadcn-based OwlMeans package:

1. **No shadcn registries.** Primitives (Button, Input, Card, …) are **hand-copied** into `src/@/components/ui/` and committed. The `registries` field in `components.json` is always empty/absent.

2. **Same `@` import prefix as the final app.** Components inside the package import shadcn primitives as `@/components/ui/button`, `@/lib/utils`, etc. The build leaves `@/…` specifiers **verbatim** (TypeScript Bundler resolution never rewrites them). The downstream app's bundler resolves `@` to **its own** shadcn copy + theme. The package never ships its primitives as a public import.

3. **Local copy is dev/test-only.** Each package keeps its own copy under `src/@/` so it can build and test in isolation. The `package.json` `exports` map must **not** expose `./@/*` — consumers never accidentally import the package's copy.

## Package skeleton (mirrors `web-panel`)

```
<your-package>/
├── src/
│   ├── @/                              # dev/test-only primitives — NOT a public export
│   │   ├── components/ui/              # hand-copied shadcn primitives
│   │   │   ├── button.tsx
│   │   │   └── input.tsx
│   │   ├── lib/
│   │   │   └── utils.ts               # cn() utility
│   │   └── globals.css                # Tailwind v4 entry (app provides its own in prod)
│   ├── components/                    # OwlMeans framework components (wrap client-panel)
│   │   ├── form/
│   │   │   ├── component.tsx
│   │   │   ├── text/component.tsx
│   │   │   ├── button/component.tsx
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── layout/component.tsx
│   │   ├── panel-app/component.tsx
│   │   └── index.ts                   # barrel; re-exports @owlmeans/client-panel
│   ├── context.ts                     # makeContext wrapping web-client's makeContext
│   ├── main.tsx                       # render() — no theme arg (theme is pure CSS)
│   ├── types.ts
│   ├── modules.ts
│   └── index.ts
├── tests/
│   ├── harness/
│   │   ├── index.html                 # copy from @owlmeans/test-ui harness/index.html
│   │   └── mount.tsx                  # per-package: imports globals.css, registers components
│   ├── context.ts                     # boots Vite with @tailwindcss/vite + @ alias
│   └── *.spec.ts
├── components.json
├── package.json
└── tsconfig.json
```

## tsconfig setup

```json
{
  "extends": [
    "@owlmeans/dep-config/tsconfig.base.json",
    "@owlmeans/dep-config/tsconfig.react.json"
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/@/*"] },
    "rootDir": "./src/",
    "outDir": "./build/"
  },
  "exclude": ["./dist/**/*", "./build/**/*", "./tests/**/*", "./*.ts"]
}
```

`moduleResolution: Bundler` (from `tsconfig.base.json`) causes `tsc` to emit `@/…` verbatim. `paths` is used only for **type-checking** during build — it finds types for `@/components/ui/button` in `src/@/components/ui/button.tsx` without rewriting the emitted specifier.

## components.json

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

`tailwind.config: ""` is required for Tailwind v4 (no separate config file). Do not add a `registries` field.

## Tailwind v4 wiring

`src/@/globals.css` — the Tailwind entry used in dev/test only:

```css
@import "tailwindcss";

@source "../..";

@theme {
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.145 0 0);
  --color-primary: oklch(0.205 0 0);
  --color-primary-foreground: oklch(0.985 0 0);
  --color-destructive: oklch(0.577 0.245 27.325);
  --color-border: oklch(0.922 0 0);
  --color-input: oklch(0.922 0 0);
  --color-ring: oklch(0.708 0 0);
  --radius: 0.625rem;
}
```

`@source "../.."` scans the package root. In the Vite dev/test harness, `@tailwindcss/vite` processes this CSS. The **production app owns its own `globals.css`** with its own `@theme` tokens — the package's CSS is only for tests.

## Adding a primitive without a registry

1. Find the component source on the [shadcn GitHub](https://github.com/shadcn-ui/ui) (e.g. `registry/new-york/ui/<name>.tsx`) or via `npx shadcn@latest add <name> --cwd <your-package-dir>` in a throwaway branch.
2. Copy the `.tsx` source into `src/@/components/ui/<name>.tsx`.
3. Repoint all imports to `@/lib/utils` and `@/components/ui/…` for sub-primitives.
4. Add any `@radix-ui/*` packages the file imports as **peerDependencies** in `package.json`.
5. Add a comment at the top: `// shadcn <name> — sourced from shadcn@<version> <date>`.
6. Run `bun install` and `bun run build` to verify.

## Wrapping `@owlmeans/client-panel`

Shadcn form/field components are the rendering layer over the framework-agnostic headless logic from `@owlmeans/client-panel`. Mirror the MUI pattern from `@owlmeans/web-panel` (form text component):

```tsx
// MUI version (web-panel) — for reference
import { TextField } from '@mui/material'
// ...
<TextField {...field} label={label} error={fieldState.error != null} />

// shadcn version
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
// ...
<div className="flex flex-col gap-1.5">
  <Label htmlFor={field.name}>{label}</Label>
  <Input id={field.name} {...field} aria-invalid={fieldState.error != null} />
  {fieldState.error && (
    <p className="text-sm text-destructive">{fieldState.error.message}</p>
  )}
</div>
```

`FormProvider`, `useFormContext`, `Controller`, the AJV validation resolver, and `useFormI18n` from `@owlmeans/client-i18n` are unchanged — only the rendered JSX changes.

`panel-app/component.tsx` no longer needs MUI `ThemeProvider` or `CssBaseline`. It simply renders children. Theme is provided via the app's `globals.css` Tailwind entry.

## package.json exports

```json
{
  "exports": {
    ".": {
      "import": "./build/index.js",
      "types": "./build/index.d.ts"
    },
    "./auth": {
      "import": "./build/auth/index.js",
      "types": "./build/auth/index.d.ts"
    }
  }
}
```

Do **not** add `./@/*` or `./src/@/*` to exports.

## Dev/test harness (Vite + @tailwindcss/vite)

See `[[testing-ui]]` for the full Playwright harness pattern. For shadcn packages the `tests/context.ts` Vite config adds the Tailwind plugin and the `@` alias:

```ts
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

const server = await createServer({
  configFile: false,
  root: resolve(here, './harness'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': resolve(here, '../src/@') },
  },
  server: { port: 0 },
})
```

`tests/harness/mount.tsx` imports the package globals.css so components render with Tailwind styles:

```tsx
import '../../src/@/globals.css'
// ... dynamic component mounting ...
```

## Cross-references

- `[[client-panel]]` — headless form/layout logic being wrapped
- `[[web-panel]]` — MUI counterpart; the structural and API reference
- `[[testing-ui]]` — Playwright harness for component acceptance tests
- `[[shadcn-versions]]` — bumping tailwind/shadcn external deps across packages
- `[[tsconfig]]` — OwlMeans TypeScript config conventions
- `[[bun]]` — build, install, workspace filter scripts
