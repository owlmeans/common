---
name: shadcn-versions
description: How to update versions of shadcn UI primitives, Tailwind CSS v4, and related UI libs across all shadcn-based OwlMeans web packages. Distinct from the @owlmeans/* package version sync (see [[versions]] skill). Use when bumping tailwind, shadcn components, or utility libs.
allowed-tools: Bash(grep *), Bash(sed *), Bash(bun install)
---

# shadcn + Tailwind version management — OwlMeans Common

This skill handles **external UI dependency versions** for the shadcn-based web packages. It is **distinct** from the `[[versions]]` skill, which manages the synchronized `@owlmeans/*` package version (`0.1.x` etc.).

## What this covers

| Package | Location | Notes |
|---|---|---|
| `tailwindcss` | peerDependency + devDependency | core engine |
| `@tailwindcss/vite` | devDependency | Vite plugin for dev/test harness |
| `@tailwindcss/postcss` | devDependency | PostCSS fallback (if used) |
| `class-variance-authority` | peerDependency | `cva()` for component variants |
| `clsx` | peerDependency | conditional class names |
| `tailwind-merge` | peerDependency | merge Tailwind classes without conflicts |
| `lucide-react` | peerDependency | icon library |
| `@radix-ui/*` | peerDependency | per-component Radix UI primitives |
| shadcn primitives (copied) | source in `src/@/components/ui/` | hand-copied `.tsx` files — not npm |

Shadcn primitive `.tsx` files inside each package are **not** npm dependencies — they are copied source files. Updating them is a separate step (see below).

## Checking current versions

To see what versions installed `@owlmeans/*` shadcn packages declare:

```bash
# Which tailwind version do installed OwlMeans shadcn packages use?
grep -r '"tailwindcss"' node_modules/@owlmeans/*/package.json

# Which tailwind-merge / clsx version?
grep -r '"tailwind-merge"\|"clsx"\|"class-variance-authority"' node_modules/@owlmeans/*/package.json

# Which @radix-ui/* versions?
grep -r '"@radix-ui/' node_modules/@owlmeans/*/package.json
```

## Bumping external UI lib versions

Shadcn packages use caret ranges in peerDependencies (e.g. `"tailwindcss": "*"` or `"tailwindcss": "^4.x"`). To pin to a specific version across all shadcn packages in the `@owlmeans/common` source repo, run these in the monorepo root (OwlMeans framework contributors):

```bash
# Example: pin tailwindcss to ^4.1.0 across all shadcn packages
OLD_TW='\*'   # or whatever the current range is
NEW_TW='^4.1.0'

# Update each shadcn package's package.json (run per package)
sed -i "s/\"tailwindcss\": \"$OLD_TW\"/\"tailwindcss\": \"$NEW_TW\"/g" <shadcn-package>/package.json

# Same pattern for other UI libs
sed -i 's/"tailwind-merge": "\*"/"tailwind-merge": "^2.5.0"/g' <shadcn-package>/package.json
sed -i 's/"clsx": "\*"/"clsx": "^2.1.0"/g' <shadcn-package>/package.json

bun install
```

Always run `bun run build` and the category-D UI tests after bumping to catch breaking changes.

## Bumping the Vite plugin / PostCSS plugin

These are devDependencies only (used in the test harness, not production). Update them separately:

```bash
sed -i 's/"@tailwindcss\/vite": "\*"/"@tailwindcss\/vite": "^4.1.0"/g' <shadcn-package>/package.json
bun install
```

## Tailwind major version upgrades (v4 → v5, etc.)

1. Read the [Tailwind upgrade guide](https://tailwindcss.com/docs/upgrade-guide) for breaking changes.
2. Check `@theme` token compatibility — token names may change between major versions.
3. Check `@source` directive syntax changes.
4. Update `@tailwindcss/vite` and `@tailwindcss/postcss` to matching major versions.
5. Rebuild (`bun run build`) and run all category-D UI tests.
6. Update this skill and `[[shadcn-web]]` with the new conventions.

## Re-syncing copied shadcn primitives

When shadcn upstream releases a new version, manually update the hand-copied primitives:

1. **Find the changed component source** — check the shadcn GitHub diff or changelog.
2. **Get the new source** — copy from `https://ui.shadcn.com/r/<name>.json` (the raw file URL) or from the [shadcn GitHub](https://github.com/shadcn-ui/ui) (`registry/new-york/ui/<name>.tsx`).
3. **Diff against the local copy** to identify any project-local modifications (custom classes, extra props, i18n tweaks) that must be preserved.
4. **Apply changes**, preserving local modifications.
5. **Update the version comment** at the top of the file: `// shadcn <name> — sourced from shadcn@<version> <date>`.
6. **Check `components.json` schema** — if the shadcn schema version changed, update `"$schema"` URLs.
7. Run `bun run build` and UI tests.

## Keeping `@radix-ui/*` versions consistent

Radix UI packages are added as peerDependencies when primitives are copied in. Keep them consistent across packages:

```bash
# Check radix versions in installed OwlMeans shadcn packages
grep -r '"@radix-ui/' node_modules/@owlmeans/*/package.json | grep -v node_modules

# Bump a specific radix package (run per shadcn package in the source repo)
sed -i 's/"@radix-ui\/react-slot": "[^"]*"/"@radix-ui\/react-slot": "^1.1.0"/g' <shadcn-package>/package.json
bun install
```

## Verification

After any version change:

```bash
# Build all packages
bun run build

# Run category-D UI tests for shadcn packages
bun test --filter <shadcn-pkg-name> ./tests
```

If category-D tests don't exist yet, at minimum load the harness URL manually to confirm components render without JS errors.

## Cross-references

- `[[versions]]` — synchronized `@owlmeans/*` package version (separate concern)
- `[[shadcn-web]]` — how to build/maintain shadcn-based OwlMeans packages
- `[[testing-ui]]` — category-D Playwright tests that verify UI after version bumps
- `[[bun]]` — bun install, workspace filter, build commands
