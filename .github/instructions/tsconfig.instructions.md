---
description: "How to configure TypeScript in OwlMeans Common packages. Covers the dep-config package, which configs to extend, and how to set up a new package's tsconfig. Use when creating packages, editing tsconfigs, or diagnosing TypeScript config issues."
applyTo: "**/tsconfig*.json"
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
  "compilerOptions": { "rootDir": "./src/", "outDir": "./build/" },
  "exclude": ["./dist/**/*", "./build/**/*", "./*.ts"]
}
```

**React / Web package**:
```json
{
  "extends": [
    "@owlmeans/dep-config/tsconfig.base.json",
    "@owlmeans/dep-config/tsconfig.react.json"
  ],
  "compilerOptions": { "rootDir": "./src/", "outDir": "./build/" },
  "exclude": ["./dist/**/*", "./build/**/*", "./*.ts"]
}
```

**Server package** (no DOM, runtime-agnostic):
```json
{
  "extends": [
    "@owlmeans/dep-config/tsconfig.base.json",
    "@owlmeans/dep-config/tsconfig.server.json"
  ],
  "compilerOptions": { "rootDir": "./src/", "outDir": "./build/" },
  "exclude": ["./dist/**/*", "./build/**/*", "./*.ts"]
}
```

**Node.js package** (`@types/node` required in devDependencies):
```json
{
  "extends": [
    "@owlmeans/dep-config/tsconfig.base.json",
    "@owlmeans/dep-config/tsconfig.node.json"
  ],
  "compilerOptions": { "rootDir": "./src/", "outDir": "./build/" },
  "exclude": ["./dist/**/*", "./build/**/*", "./*.ts"]
}
```

**Bun package** (`@types/bun` required in devDependencies):
```json
{
  "extends": [
    "@owlmeans/dep-config/tsconfig.base.json",
    "@owlmeans/dep-config/tsconfig.bun.json"
  ],
  "compilerOptions": { "rootDir": "./src/", "outDir": "./build/" },
  "exclude": ["./dist/**/*", "./build/**/*", "./*.ts"]
}
```

## React Native packages

React Native packages extend `tsconfig.base.json` only (no DOM, no Node/Bun globals) — same as basic packages. The React Native runtime provides its own globals.
