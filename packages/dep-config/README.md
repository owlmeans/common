# @owlmeans/dep-config

Shared TypeScript configuration for all `@owlmeans/*` packages. Provides base compiler options, React/JSX settings, and a consistent strict configuration aligned with TypeScript 6.0+.

## Configs

| File | Purpose |
|------|---------|
| `tsconfig.base.json` | Core strict settings, ESNext target, Bundler module resolution |
| `tsconfig.react.json` | JSX + DOM lib (for React/React Native packages) |

## Usage

Add to your package's `devDependencies`:

```json
"@owlmeans/dep-config": "workspace:*"
```

Then create a `tsconfig.json` in your package using one of the two flavors:

### Basic package (no JSX)

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

Used by: core packages, server packages, infrastructure packages.

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
