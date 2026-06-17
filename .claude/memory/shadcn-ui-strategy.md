---
name: shadcn-ui-strategy
description: Durable architecture decisions for the OwlMeans shadcn UI + Tailwind v4 web package family — the three invariants that govern every shadcn-based package.
metadata:
  type: project
---

# shadcn UI strategy — OwlMeans Common

OwlMeans Common is introducing a new family of web UI packages built on **shadcn UI + Tailwind CSS v4** to replace the current Material-UI (`web-panel`) packages. The actual package names and layer entries are deferred to when packages are created.

## Three durable decisions (confirmed 2026-05-23)

**Why:** To give final apps full control over their shadcn theme and primitive implementations, while keeping each OwlMeans package self-contained for dev/test.

1. **No shadcn registries.** Primitives are hand-copied into each package's `src/@/components/ui/`. No `registries` in `components.json`.

2. **`@` alias — app provides at integration.** Every package imports shadcn primitives as `@/components/ui/*` (same alias as the final app). Build output keeps `@/…` specifiers verbatim (TypeScript Bundler resolution). The app's bundler resolves `@` to its own copy + theme. Each package keeps a local primitive copy in `src/@/` for dev/test only. The `exports` map never exposes `./@/*`.

3. **Wrap `@owlmeans/client-panel`.** Shadcn packages render the same headless form/layout/react-hook-form logic from `@owlmeans/client-panel`, mirroring how `web-panel` wraps it for MUI. Migration from MUI → shadcn touches only the rendered JSX, not the headless logic.

**How to apply:** When building a new shadcn-based OwlMeans package, enforce all three invariants. When reviewing PRs touching these packages, flag any deviation (especially registry usage or exposing `@/*` exports).

## Related skills

- `[[shadcn-web]]` — full development & maintenance guide
- `[[shadcn-versions]]` — updating UI lib versions
- `[[testing-ui]]` — updated to cover Tailwind + `@` alias in the test harness
- `[[web-panel]]` — MUI counterpart; structural reference
- `[[client-panel]]` — headless logic being wrapped
