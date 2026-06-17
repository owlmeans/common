# @owlmeans/dep-config

Shared TypeScript configuration for all `@owlmeans/*` packages. Provides base compiler options, React/JSX settings, server/Node/Bun runtime settings, and a consistent strict configuration aligned with TypeScript 6.0+.

## Configs

| File | Purpose |
|------|---------|
| `tsconfig.base.json` | Core strict settings, ESNext target, Bundler module resolution |
| `tsconfig.react.json` | JSX + DOM lib (for React/React Native packages) |
| `tsconfig.server.json` | Server-side base: `lib: ["ESNext"]` only (no DOM) |
| `tsconfig.node.json` | Extends server + adds `types: ["node"]` (Node.js globals) |
| `tsconfig.bun.json` | Extends server + adds `types: ["bun"]` + `allowImportingTsExtensions` |

## Usage

Add to your package's `devDependencies`:

```json
"@owlmeans/dep-config": "workspace:*"
```

Then create a `tsconfig.json` in your package using one of the flavors below:

### Basic package (no JSX, no runtime-specific types)

```json
{
  "extends": [
    "@owlmeans/dep-config/tsconfig.base.json"
  ],
  "compilerOptions": {
    "rootDir": "./src/",
    "outDir": "./build/"
  },
  "exclude": ["./dist/**/*", "./build/**/*", "./*.ts"]
}
```

Used by: core packages, infrastructure packages.

### Server package (no DOM, runtime-agnostic)

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

Used by: server packages that don't need Node.js or Bun-specific APIs.

### Node.js package

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

Used by: packages using Node.js built-ins (fs, path, crypto, net, etc.). Requires `@types/node` in devDependencies.

### Bun package

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

Used by: packages using Bun-specific APIs (Bun.serve, Bun.file, etc.). Requires `@types/bun` in devDependencies.

### React package (JSX enabled)

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

Used by: client packages, web packages, native packages, and any package that imports React components.

## Key Settings (tsconfig.base.json)

- **target / module**: ESNext
- **moduleResolution**: Bundler — compatible with Bun and modern bundlers, no `.js` extension requirements on relative imports
- **isolatedModules**: true — ensures each file is independently transpilable
- **strict**: true — all strict type checks enabled
- **declaration / declarationMap / sourceMap**: true — full type and source map output
- **noUnusedLocals / noUnusedParameters**: true — clean code enforcement
- **skipLibCheck**: true — skip checking external `.d.ts` files
