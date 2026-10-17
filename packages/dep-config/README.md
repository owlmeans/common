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

## Third-party notices

`@owlmeans/dep-config/notices` exports `createThirdPartyNoticesPlugin` for Rollup, Vite and Astro client builds:

```js
import { createThirdPartyNoticesPlugin } from '@owlmeans/dep-config/notices'

// In the build configuration's plugins array:
createThirdPartyNoticesPlugin({
  root: import.meta.dirname,
  additionalPackages: ['tailwindcss'],
})
```

The plugin emits `THIRD-PARTY-NOTICES.txt` from bundled modules and the installed packages' license,
NOTICE and embedded third-party documents. It also retains package-local copied-source notices.
`additionalPackages` covers emitted CSS, fonts and virtual polyfills; `additionalFiles` adds source
notices outside the package. `references` links notices for independently loaded runtime bundles.
`fileName` selects a different output asset name when multiple executables share one output directory.

Missing required texts fail the build before bundle writing. Complete MIT grants in README files are
accepted; exact-version offline recoveries and their sources live beside the helper. Build-time tools
are included only when their own code or assets reach the output. Link browser notices from the
product, preserve them in final image copies, and keep copied-source notices in package tarballs and
scaffolds. License documents keep their original language.

Run `bun run test` in this package to verify the collector. Use the `third-party-notices` skill for
asset inputs, missing upstream texts and distribution checks.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.56
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
