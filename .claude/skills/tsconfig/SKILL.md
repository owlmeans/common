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
| `tsconfig.bun.json` | Extends server + adds `types: ["bun"]` + `allowImportingTsExtensions` |

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

> Note: `tsconfig.node.json` and `tsconfig.bun.json` both extend `tsconfig.server.json`, so extending either automatically excludes DOM lib.
> Do NOT use `@types/node` and `@types/bun` together — they conflict.

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

React packages include: `client-*`, `web-*`, `native-*`, `router`, `socket`, `did`, `i18n`, `server-socket`, plus any package with JSX files.

## Adding dep-config to a new package

In the package's `package.json` devDependencies:
```json
"@owlmeans/dep-config": "workspace:*"
```

Then run `bun install` from the repo root.

## Key compiler settings (from tsconfig.base.json)

- `moduleResolution: "Bundler"` — compatible with Bun, no `.js` extension needed on relative imports
- `module: "ESNext"` + `target: "ESNext"` — native ESM output
- `isolatedModules: true` — each file must be independently transpilable
- `strict: true` — all strict checks enabled (noImplicitAny, strictNullChecks, etc.)
- `declaration: true` + `declarationMap: true` + `sourceMap: true` — full type + source output

## Important: rootDir/outDir are NOT shareable via extends

TypeScript resolves `rootDir`/`outDir` paths in an `extends` config relative to **that config file's location**, not the consuming package. That's why these must always be specified in each package's own `tsconfig.json`, not in `dep-config`.

## Debugging a config

```bash
# Show the fully merged tsconfig for a package
cd packages/<name>
bunx tsc --showConfig
```
