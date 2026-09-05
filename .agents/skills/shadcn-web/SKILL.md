---
name: shadcn-web
description: How to build and maintain shadcn UI + Tailwind v4 web packages in the OwlMeans framework. Auto-invoked when editing components.json, tailwind.config.*, globals.css, or files under components/ui/. Use when creating a new shadcn-based web package or adding shadcn components.
user-invocable: false
metadata:
  scope: general
---

# shadcn UI + Tailwind v4 web packages — OwlMeans pattern

Shadcn-based web packages are the **current Web layer**. `@owlmeans/web-panel` is the reference one, and `@owlmeans/mui-panel` is the legacy MUI family it supersedes. Both sit at the same architecture layer (Web) and wrap the same headless `@owlmeans/client-panel` logic; the shadcn family swaps MUI + Emotion for shadcn UI + Tailwind CSS v4, and a new package follows `web-panel`'s shape.

See `reference.md` in this skill folder for full code examples (components.json, tsconfig, globals.css @theme tokens, peerDeps, cn(), MUI→shadcn mapping table).

## The `@` contract — core rule

Four invariants govern every shadcn-based OwlMeans package:

1. **No shadcn registries.** Primitives (Button, Input, Card, …) are **hand-copied** into `src/@/components/ui/` and committed. The `registries` field in `components.json` is always empty/absent.

2. **Same `@` import prefix as the final app.** Components inside the package import shadcn primitives as `@/components/ui/button`, `@/lib/utils`, etc. The build leaves `@/…` specifiers **verbatim** (TypeScript Bundler resolution never rewrites them). The downstream app's bundler resolves `@` to **its own** shadcn copy + theme. The package never ships its primitives as a public import.

3. **Local copy is dev/test-only.** Each package keeps its own copy under `src/@/` so it can build and test in isolation. The `package.json` `exports` map must **not** expose `./@/*` — consumers never accidentally import the package's copy.

   `cn` is the one exception, and it is exported as a **package-owned** function from `src/utils.ts`, never as a re-export of `@/lib/utils`: that specifier is emitted verbatim and would resolve back to the consumer's own file, which is not what an app importing `cn` from the package asked for. The vendored `src/@/lib/utils.ts` stays exactly as shadcn emits it, because the package's own primitives must keep resolving through the `@` contract.

4. **The consumer must add an `@source` for the package's `src`.** Tailwind's oxide scanner reads
   the CSS root plus `@source` directives only, and it excludes `node_modules` — so a class that
   exists **only** inside the package's own components never reaches the app's stylesheet, and the
   feature renders unstyled with nothing in the app's own sources to blame. Every app consuming
   `@owlmeans/web-panel` (or any other shadcn OwlMeans package) adds a line to its Tailwind entry:

   ```css
   @import "tailwindcss";

   @source "../../../node_modules/@owlmeans/web-panel/src";
   ```

   The relative depth follows the app's layout. **Point at `src`, never at `build`:** the scanner
   applies the `.gitignore` of whatever repository a path resolves into, and a linked `node_modules`
   entry resolves into a monorepo whose `.gitignore` covers every package build directory — a
   `build` source there scans zero files and reports nothing, while the UI renders half-styled with
   nothing to blame. `src` is tracked in the repository and ships in the published tarball, so one
   path serves a linked checkout and an npm install alike. This is a **general consumer rule**, not
   a scaffolding detail.

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
│   │   └── index.ts                   # local component barrel only
│   ├── context.ts                     # makeContext wrapping web-client's makeContext
│   ├── main.tsx                       # render() — no theme arg (theme is pure CSS)
│   ├── types.ts
│   ├── entrypoints.ts                 # the base declaration list an app composes over
│   ├── utils.ts                       # the package-owned `cn`, exported publicly
│   └── index.ts                       # package barrel; also re-exports @owlmeans/client-panel
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
7. Document it: a consumer must vendor **every** primitive the package imports. `@owlmeans/web-panel`
   currently imports `alert`, `button`, `card`, `input`, `label`, `navigation-menu` and `progress`
   (`separator` is vendored for consumers that use it) — so its Radix peers include
   `@radix-ui/react-navigation-menu`.

Prefer a light custom component over a heavyweight block when only part of it is needed. The
two-level navigation shell deliberately renders its second level with the existing `Button` rather
than pulling in the shadcn `sidebar` block: that block drags in `sheet`, `tooltip`, `skeleton` and
`use-mobile`, plus eight `--color-sidebar-*` tokens every consumer theme would then have to define.

## Wrapping `@owlmeans/client-panel`

Shadcn form/field components are the rendering layer over the framework-agnostic headless logic
from `@owlmeans/client-panel`: `FormContext`, `schemaToFormDefault`, `useClientFormContext`,
`useFormI18n` and `useFormError` come from there, while the field itself drives `react-hook-form`'s
`Controller` and resolves its own label from the form namespace. `@owlmeans/client-panel` also
publishes ready headless controllers — `ClientForm`, `InputCtrl`, `ActionCtrl` — but the reference
package does **not** route through them; an application may still use them directly to lay a form
out its own way. The same headless logic is rendered by the MUI family in `@owlmeans/mui-panel`:

```tsx
// MUI version (mui-panel) — for reference
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

Both families share the same machinery: `FormProvider`, `useFormContext` and `Controller` from
`react-hook-form`, the AJV validation resolver, and `useFormI18n` from `@owlmeans/client-panel`.
Only the rendered JSX differs. (`@owlmeans/client-i18n` publishes `useI18n`, `useI18nLib`,
`useI18nApp`, `useLanguage`, `composePrefix` and `I18nContext` — the *form*-scoped `t` is
`client-panel`'s.)

`panel-app/component.tsx` needs no MUI `ThemeProvider` and no `CssBaseline` — it renders children, Tailwind's Preflight replaces the baseline, and the theme comes from the app's own `globals.css`.

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
- `[[web-panel]]` — the reference shadcn package: the structural and API model to copy
- `[[mui-panel]]` — the legacy MUI family this one supersedes; the source side of the mapping table
- `[[testing-ui]]` — Playwright harness for component acceptance tests
- `[[shadcn-versions]]` — bumping tailwind/shadcn external deps across packages
- `[[tsconfig]]` — OwlMeans TypeScript config conventions
- `[[bun]]` — build, install, workspace filter scripts
