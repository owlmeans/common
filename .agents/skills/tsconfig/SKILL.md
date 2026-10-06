---
name: tsconfig
description: How to configure TypeScript in OwlMeans Common packages. Covers the dep-config package, which configs to extend, and how to set up a new package's tsconfig. Use when creating packages, editing tsconfigs, or diagnosing TypeScript config issues.
allowed-tools: Bash(bunx tsc *), Read, Edit, Write
---

# TypeScript Configuration — OwlMeans Common

## Overview

All shared TypeScript config lives in `packages/dep-config/` (`@owlmeans/dep-config`). Individual packages extend from there — no relative `../tsconfig.*.json` paths.

## Available configs

| File | Purpose |
|------|---------|
| `tsconfig.base.json` | Core settings: strict, ESNext, Bundler resolution, declaration output |
| `tsconfig.react.json` | Adds `jsx: "react-jsx"` and `lib: ["DOM", "DOM.Iterable", "ESNext"]` |
| `tsconfig.server.json` | Sets `lib: ["ESNext"]` only — no DOM. Base for Node/Bun overlays |
| `tsconfig.node.json` | Extends server + adds `types: ["node"]` (Node.js globals) |
| `tsconfig.bun.json` | Extends server + adds `types: ["bun"]`, `allowImportingTsExtensions` and `rewriteRelativeImportExtensions` |

## Choosing which configs to extend

**Basic package** (no React/JSX, no runtime-specific types — core, non-runtime infrastructure):
```json
{
  "extends": ["@owlmeans/dep-config/tsconfig.base.json"],
  "compilerOptions": {
    "rootDir": "./src/",
    "outDir": "./build/"
  },
  "exclude": ["./dist/**/*", "./build/**/*", "./*.ts"]
}
```

**Server package** (no DOM, runtime-agnostic — server-* packages without Node/Bun-specific APIs):
```json
{
  "extends": [
    "@owlmeans/dep-config/tsconfig.base.json",
    "@owlmeans/dep-config/tsconfig.server.json"
  ],
  "compilerOptions": {
    "rootDir": "./src/",
    "outDir": "./build/"
  },
  "exclude": ["./dist/**/*", "./build/**/*", "./*.ts"]
}
```

**Node.js package** (uses fs, path, crypto, net, etc. — requires `@types/node` in devDependencies):
```json
{
  "extends": [
    "@owlmeans/dep-config/tsconfig.base.json",
    "@owlmeans/dep-config/tsconfig.node.json"
  ],
  "compilerOptions": {
    "rootDir": "./src/",
    "outDir": "./build/"
  },
  "exclude": ["./dist/**/*", "./build/**/*", "./*.ts"]
}
```

**Bun package** (uses Bun.serve, Bun.file, etc. — requires `@types/bun` in devDependencies):
```json
{
  "extends": [
    "@owlmeans/dep-config/tsconfig.base.json",
    "@owlmeans/dep-config/tsconfig.bun.json"
  ],
  "compilerOptions": {
    "rootDir": "./src/",
    "outDir": "./build/"
  },
  "exclude": ["./dist/**/*", "./build/**/*", "./*.ts"]
}
```

> Note: `tsconfig.node.json` and `tsconfig.bun.json` both extend `tsconfig.server.json`, so extending
> either automatically excludes the DOM lib. Extend **one** of them, never both: each sets an
> explicit `types` array and the later one wins outright.
>
> That `types` array is also what makes the runtime typings safe to co-install — a package may carry
> both `@types/node` and `@types/bun` in devDependencies without conflict, because the overlay
> selects one and `skipLibCheck` keeps the rest quiet. The base and server configs set **no** `types`
> array, so there every installed `@types/*` package is ambient. Do not lean on that to get Node
> globals: a package that uses them extends `tsconfig.node.json` and declares `@types/node`.

**React package** (any package that imports React components or uses JSX):
```json
{
  "extends": [
    "@owlmeans/dep-config/tsconfig.base.json",
    "@owlmeans/dep-config/tsconfig.react.json"
  ],
  "compilerOptions": {
    "rootDir": "./src/",
    "outDir": "./build/"
  },
  "exclude": ["./dist/**/*", "./build/**/*", "./*.ts"]
}
```

Extend `tsconfig.react.json` in any package that contains JSX or types React components — that is
most of the `client-*`, `web-*` and `mui-*` families plus `router`, `socket`, `did`, `i18n` and
`server-socket`, which expose React-facing types. A package under those prefixes with no JSX
(`client-config`, `client-entrypoint`, `client-flow`, `client-iam`, `client-resource`,
`client-route`, `web-db`, `web-gtm`) stays on the base config. `astro` is the other shape: base
config plus an inline `"lib": ["ESNext", "DOM"]`, because it is browser-facing without React.

The shadcn web packages add a `paths` entry of their own on top of the React config —
`"@/*": ["./src/@/*"]`, the app-provides alias contract described by the `shadcn-web` skill.

## Includes, excludes and project references

- Each package is a standalone `tsc -b` project: no `composite`, no `references`. The build order
  comes from the workspace, not from TypeScript.
- Keep tests out of the published build. A package with a `tests/` directory adds
  `"./tests/**/*"` to `exclude`; `"./*.ts"` keeps root-level scripts out.
- `include` is optional — `"include": ["src"]` (or `["src/**/*"]`) narrows the program explicitly
  and is the better default for a package whose root holds loose `.ts` files.
- `tsc -b` writes incremental state to `<package>/tsconfig.tsbuildinfo`, next to the config rather
  than inside `build/`. A from-clean rebuild has to delete both (see the `bun` skill).

## Adding dep-config to a new package

In the package's `package.json` devDependencies:
```json
"@owlmeans/dep-config": "workspace:*"
```

Then run `bun install` from the repo root. The published test-helper packages (`test`,
`test-integration`, `test-ui`) carry a caret range instead — they are installed from the registry by
consumers, where no workspace exists to resolve.

## Key compiler settings (from tsconfig.base.json)

- `moduleResolution: "Bundler"` — compatible with Bun, no `.js` extension needed on relative imports
- `module: "ESNext"` + `target: "ESNext"` — native ESM output
- `isolatedModules: true` — each file must be independently transpilable
- `strict: true` — all strict checks enabled (noImplicitAny, strictNullChecks, etc.)
- `noUnusedLocals` + `noUnusedParameters` — an unused import or parameter is a build error, not a
  lint warning; prefix a deliberately unused parameter with `_`
- `noImplicitOverride` + `useUnknownInCatchVariables` — overrides must be declared, and a caught
  value is `unknown` until narrowed
- `declaration: true` + `declarationMap: true` + `sourceMap: true` — full type + source output
- `skipLibCheck: true` — `.d.ts` files of dependencies are not re-checked
- `resolveJsonModule` + `allowJs` + `allowArbitraryExtensions` + `esModuleInterop` +
  `forceConsistentCasingInFileNames`

## Important: rootDir/outDir are NOT shareable via extends

TypeScript resolves `rootDir`/`outDir` paths in an `extends` config relative to **that config file's location**, not the consuming package. That's why these must always be specified in each package's own `tsconfig.json`, not in `dep-config`.

## Debugging a config

```bash
# Show the fully merged tsconfig for a package
cd packages/<name>
bunx tsc --showConfig
```
