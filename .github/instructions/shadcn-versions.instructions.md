---
description: How to update Tailwind CSS, shadcn UI primitives, and related UI lib versions across shadcn-based OwlMeans packages. Distinct from the @owlmeans/* version sync (see versions.instructions.md).
applyTo: "**/components.json"
---

# shadcn + Tailwind version management

This covers **external UI dependency versions** across shadcn-based OwlMeans packages. It is separate from the `@owlmeans/*` version sync (see `versions.instructions.md`).

## What to update

- `tailwindcss`, `@tailwindcss/vite`, `@tailwindcss/postcss`
- `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`
- `@radix-ui/*` (added per component as primitives are copied in)
- Shadcn primitive `.tsx` files in `src/@/components/ui/` (copied source, not npm)

## Bumping npm versions

```bash
# Example: bump tailwindcss in a shadcn package (run per package)
sed -i 's/"tailwindcss": "[^"]*"/"tailwindcss": "^4.1.0"/g' <shadcn-package>/package.json
bun install
bun run build
```

## Re-syncing copied primitives

1. Find the new source for the component in shadcn GitHub.
2. Diff against the local copy to preserve any project-local changes.
3. Update the version comment: `// shadcn <name> — sourced from shadcn@<version> <date>`.
4. Run `bun run build` and category-D UI tests.

## Tailwind major upgrades

Follow the official Tailwind upgrade guide. Check `@theme` token compatibility and `@source` syntax. Update `@tailwindcss/vite` to a matching major version.

## Verification

```bash
bun run build
# Run category-D UI tests for shadcn packages
bun test --filter <shadcn-pkg-name> ./tests
```

See `.claude/skills/shadcn-versions/SKILL.md` for full procedure.
