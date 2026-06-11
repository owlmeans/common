---
description: How to build and maintain shadcn UI + Tailwind v4 web packages in OwlMeans Common. Load when editing components.json, tailwind.config.*, globals.css, or files under components/ui/.
applyTo: "**/components.json, **/tailwind.config.{ts,js,mjs}, **/globals.css, **/components/ui/**, **/@/lib/utils.ts"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# shadcn UI + Tailwind v4 — OwlMeans web packages

Shadcn-based web packages are the next-generation Web layer replacing `web-panel` (MUI). They wrap the same headless `@owlmeans/client-panel` logic and mirror `web-panel`'s package shape — swapping MUI for shadcn UI + Tailwind v4.

## The `@` contract — three invariants

1. **No shadcn registries.** Primitives are **hand-copied** into `src/@/components/ui/`. Never use `registries` in `components.json`.
2. **Same `@` import prefix as the final app.** Components import `@/components/ui/button`, `@/lib/utils`, etc. The build emits `@/…` verbatim (Bundler resolution). The app's bundler resolves `@` to its own shadcn copy. The package never ships its primitives as a public import.
3. **Local copy is dev/test-only.** `src/@/` exists so the package can build and test in isolation. Never expose `./@/*` in `package.json` exports.

## tsconfig — `@` alias setup

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/@/*"] }
  }
}
```

`moduleResolution: Bundler` (from `dep-config/tsconfig.base.json`) emits `@/…` verbatim — TypeScript resolves types via `paths` but does not rewrite the specifier.

## components.json

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/@/globals.css", "baseColor": "neutral", "cssVariables": true },
  "iconLibrary": "lucide",
  "aliases": { "components": "@/components", "ui": "@/components/ui", "utils": "@/lib/utils", "lib": "@/lib", "hooks": "@/hooks" }
}
```

`tailwind.config: ""` is required for Tailwind v4.

## Tailwind v4 — globals.css

```css
@import "tailwindcss";
@source "../..";
@theme {
  --color-primary: oklch(0.205 0 0);
  --color-primary-foreground: oklch(0.985 0 0);
  --color-destructive: oklch(0.577 0.245 27.325);
  --color-border: oklch(0.922 0 0);
  --radius: 0.625rem;
  /* ... full token set in @owlmeans/shadcn-web reference.md ... */
}
```

In production, the **app owns its own `globals.css`**. The package's CSS is only for dev/test.

## Adding a primitive (no registry)

1. Copy `.tsx` source from shadcn GitHub into `src/@/components/ui/<name>.tsx`.
2. Repoint imports to `@/lib/utils` and `@/components/ui/…`.
3. Add any `@radix-ui/*` packages as **peerDependencies**.
4. Add comment: `// shadcn <name> — sourced from shadcn@<version> <date>`.

## Wrapping `@owlmeans/client-panel`

Replace MUI rendering in `web-panel` components with shadcn + Tailwind classes. The `FormProvider`, `useFormContext`, `Controller`, AJV resolver, and `useFormI18n` are unchanged — only JSX changes.

```tsx
// MUI: <TextField {...field} label={label} error={...} />
// shadcn:
<div className="flex flex-col gap-1.5">
  <Label htmlFor={field.name}>{label}</Label>
  <Input id={field.name} {...field} aria-invalid={fieldState.error != null} />
  {fieldState.error && <p className="text-sm text-destructive">{fieldState.error.message}</p>}
</div>
```

## package.json peerDependencies

`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `react`, `react-dom`, `react-hook-form`, `tailwindcss`. Add `@radix-ui/*` per component copied.

## package.json exports — never expose `@/*`

```json
{ "exports": { ".": { "import": "./build/index.js", "types": "./build/index.d.ts" } } }
```

See `.claude/skills/shadcn-web/SKILL.md` for the full pattern.
