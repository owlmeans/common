import { HARNESS_PROTECTED, ROOT_PROTECTED } from '../consts.local.js'
import {
  TARGET_BUNDLED_PACKAGES, TARGET_LEGACY_BUNDLED_PACKAGES, TARGET_LEGACY_PACKAGES, TARGET_LEGACY_PACKAGES_DIR,
  TARGET_PACKAGES_DIR, TargetLayout, TargetLegacyPackage, TargetPackage,
} from '../consts.js'
import type { TargetLayoutManifest } from '../types.js'

/**
 * The current layout: five workspace packages under `sources/`.
 *
 * `common` and `backend` are libraries the other three import, so they emit declarations with
 * `tsc -b` rather than a bundle; `api`, `web` and `worker` each bundle themselves.
 */
export const V2_MANIFEST: TargetLayoutManifest = {
  layout: TargetLayout.V2,
  dir: TARGET_PACKAGES_DIR,
  packages: Object.values(TargetPackage),
  // The same file the publisher's own filesystem detection probes for (`sources/api`), so the
  // two answers about one volume cannot disagree.
  probe: `${TARGET_PACKAGES_DIR}/${TargetPackage.Api}/package.json`,
  files: [
    'package.json',
    'bunfig.toml',
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Common}/package.json`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Common}/tsconfig.json`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Common}/src/index.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Common}/src/entrypoints.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Backend}/package.json`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Backend}/tsconfig.json`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Backend}/src/index.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Backend}/src/context.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Backend}/src/config.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Api}/package.json`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Api}/tsconfig.json`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Api}/rollup.config.js`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Api}/rollup.build.mjs`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Api}/src/index.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Api}/src/owlmeans.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Api}/src/config.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Api}/src/entrypoints.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Web}/package.json`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Web}/tsconfig.json`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Web}/rollup.config.js`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Web}/rollup.build.mjs`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Web}/src/index.tsx`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Web}/src/owlmeans.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Web}/src/config.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Web}/src/entrypoints.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Worker}/package.json`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Worker}/tsconfig.json`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Worker}/rollup.config.js`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Worker}/rollup.build.mjs`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Worker}/src/index.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Worker}/src/owlmeans.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Worker}/src/config.ts`,
    `${TARGET_PACKAGES_DIR}/${TargetPackage.Worker}/src/entrypoints.ts`,
  ],
  protectedFiles: [
    ...ROOT_PROTECTED,
    ...HARNESS_PROTECTED,
    ...Object.values(TargetPackage).flatMap(pkg =>
      [`${TARGET_PACKAGES_DIR}/${pkg}/package.json`, `${TARGET_PACKAGES_DIR}/${pkg}/tsconfig.json`]),
    ...TARGET_BUNDLED_PACKAGES.flatMap(pkg =>
      [`${TARGET_PACKAGES_DIR}/${pkg}/rollup.config.js`, `${TARGET_PACKAGES_DIR}/${pkg}/rollup.build.mjs`]),
  ],
  buildScripts: {
    [TargetPackage.Common]: 'tsc -b',
    [TargetPackage.Backend]: 'tsc -b',
    [TargetPackage.Api]: 'bun ./rollup.build.mjs',
    [TargetPackage.Web]: 'bun ./rollup.build.mjs',
    [TargetPackage.Worker]: 'bun ./rollup.build.mjs',
  },
  requiredDeps: {
    [TargetPackage.Common]: ['@owlmeans/context', '@owlmeans/entrypoint'],
    [TargetPackage.Backend]: ['@owlmeans/context', '@owlmeans/postgres-resource'],
    [TargetPackage.Api]: ['@owlmeans/server-app'],
    [TargetPackage.Web]: ['@owlmeans/web-client'],
    [TargetPackage.Worker]: ['@owlmeans/queue', '@owlmeans/redis-queue'],
  },
  // `api` and `worker` both reach the database through `backend`, which is the whole reason
  // `backend` is a library: two runtimes, one context factory, one set of resources. A `worker`
  // that stopped depending on `backend` is processing jobs against something else.
  workspaceDeps: {
    [TargetPackage.Common]: [],
    [TargetPackage.Backend]: [TargetPackage.Common],
    [TargetPackage.Api]: [TargetPackage.Common, TargetPackage.Backend],
    [TargetPackage.Web]: [TargetPackage.Common],
    [TargetPackage.Worker]: [TargetPackage.Backend],
  },
  workspaceGlob: `${TARGET_PACKAGES_DIR}/*`,
  workspaceEntries: Object.values(TargetPackage).map(pkg => `${TARGET_PACKAGES_DIR}/${pkg}`),
  markers: {
    [`${TARGET_PACKAGES_DIR}/${TargetPackage.Common}/src/index.ts`]: ['./entrypoints.js'],
    [`${TARGET_PACKAGES_DIR}/${TargetPackage.Backend}/src/index.ts`]: ['./context.js'],
    [`${TARGET_PACKAGES_DIR}/${TargetPackage.Backend}/src/context.ts`]: ['@owlmeans/context', 'makeContext'],
    [`${TARGET_PACKAGES_DIR}/${TargetPackage.Api}/src/index.ts`]: ['./owlmeans.js', 'initOwlMeans'],
    [`${TARGET_PACKAGES_DIR}/${TargetPackage.Api}/src/owlmeans.ts`]: ['@owlmeans/server-app', 'makeContext'],
    [`${TARGET_PACKAGES_DIR}/${TargetPackage.Web}/src/index.tsx`]: ['@owlmeans/web-client', 'renderApp', './owlmeans'],
    [`${TARGET_PACKAGES_DIR}/${TargetPackage.Web}/src/owlmeans.ts`]: ['makeContext', 'owlCtx'],
    // The worker binds nothing but its health port; what makes it a worker is that it listens.
    [`${TARGET_PACKAGES_DIR}/${TargetPackage.Worker}/src/index.ts`]: ['./owlmeans.js', 'initOwlMeans'],
    [`${TARGET_PACKAGES_DIR}/${TargetPackage.Worker}/src/owlmeans.ts`]: ['@owlmeans/queue', 'makeContext'],
    // The build configuration itself: what it reads and what it emits. These are the paths the
    // publisher spawns and serves, so a config that redirects either one is a different program.
    // Matched loosely enough to survive the `path.resolve(srcDir, …)` the template writes them
    // with, and strictly enough that an input or an output somewhere else fails.
    [`${TARGET_PACKAGES_DIR}/${TargetPackage.Api}/rollup.config.js`]: ['input:', 'index.ts', 'dist', 'index.js'],
    [`${TARGET_PACKAGES_DIR}/${TargetPackage.Web}/rollup.config.js`]: ['input:', 'index.tsx', 'dist', 'bundle.js'],
    [`${TARGET_PACKAGES_DIR}/${TargetPackage.Worker}/rollup.config.js`]: ['input:', 'index.ts', 'dist', 'index.js'],
  },
}

/**
 * The legacy layout: three workspace packages under `packages/`.
 *
 * Frozen — nothing generates one any more, and every rule here is stated against the trees that
 * exist rather than against a template this repository still ships (it does not). `backend` is
 * the HTTP server AND the data layer, which is why it carries both `@owlmeans/server-app` and
 * `@owlmeans/postgres-resource`; `common` is the only library.
 */
export const V1_MANIFEST: TargetLayoutManifest = {
  layout: TargetLayout.V1,
  dir: TARGET_LEGACY_PACKAGES_DIR,
  packages: TARGET_LEGACY_PACKAGES,
  // `packages/backend` again — the publisher's own marker for this layout.
  probe: `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Backend}/package.json`,
  files: [
    'package.json',
    'bunfig.toml',
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Common}/package.json`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Common}/tsconfig.json`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Common}/src/index.ts`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Common}/src/entrypoints.ts`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Backend}/package.json`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Backend}/tsconfig.json`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Backend}/rollup.config.js`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Backend}/rollup.build.mjs`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Backend}/src/index.ts`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Backend}/src/owlmeans.ts`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Backend}/src/config.ts`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Backend}/src/entrypoints.ts`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Frontend}/package.json`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Frontend}/tsconfig.json`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Frontend}/rollup.config.js`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Frontend}/rollup.build.mjs`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Frontend}/src/index.tsx`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Frontend}/src/owlmeans.ts`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Frontend}/src/config.ts`,
    `${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Frontend}/src/entrypoints.ts`,
  ],
  protectedFiles: [
    ...ROOT_PROTECTED,
    ...HARNESS_PROTECTED,
    ...TARGET_LEGACY_PACKAGES.flatMap(pkg =>
      [`${TARGET_LEGACY_PACKAGES_DIR}/${pkg}/package.json`, `${TARGET_LEGACY_PACKAGES_DIR}/${pkg}/tsconfig.json`]),
    ...TARGET_LEGACY_BUNDLED_PACKAGES.flatMap(pkg =>
      [`${TARGET_LEGACY_PACKAGES_DIR}/${pkg}/rollup.config.js`, `${TARGET_LEGACY_PACKAGES_DIR}/${pkg}/rollup.build.mjs`]),
  ],
  buildScripts: {
    [TargetLegacyPackage.Common]: 'tsc -b',
    [TargetLegacyPackage.Backend]: 'bun ./rollup.build.mjs',
    [TargetLegacyPackage.Frontend]: 'bun ./rollup.build.mjs',
  },
  requiredDeps: {
    [TargetLegacyPackage.Common]: ['@owlmeans/context', '@owlmeans/entrypoint'],
    [TargetLegacyPackage.Backend]: ['@owlmeans/server-app', '@owlmeans/postgres-resource'],
    [TargetLegacyPackage.Frontend]: ['@owlmeans/web-client'],
  },
  workspaceDeps: {
    [TargetLegacyPackage.Common]: [],
    [TargetLegacyPackage.Backend]: [TargetLegacyPackage.Common],
    [TargetLegacyPackage.Frontend]: [TargetLegacyPackage.Common],
  },
  workspaceGlob: `${TARGET_LEGACY_PACKAGES_DIR}/*`,
  workspaceEntries: TARGET_LEGACY_PACKAGES.map(pkg => `${TARGET_LEGACY_PACKAGES_DIR}/${pkg}`),
  markers: {
    [`${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Common}/src/index.ts`]: ['./entrypoints.js'],
    [`${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Backend}/src/index.ts`]: ['./owlmeans.js', 'initOwlMeans'],
    [`${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Backend}/src/owlmeans.ts`]: ['@owlmeans/server-app', 'makeContext'],
    [`${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Frontend}/src/index.tsx`]:
      ['@owlmeans/web-client', 'renderApp', './owlmeans'],
    [`${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Frontend}/src/owlmeans.ts`]: ['makeContext', 'owlCtx'],
    [`${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Backend}/rollup.config.js`]:
      ['input:', 'index.ts', 'dist', 'index.js'],
    [`${TARGET_LEGACY_PACKAGES_DIR}/${TargetLegacyPackage.Frontend}/rollup.config.js`]:
      ['input:', 'index.tsx', 'dist', 'bundle.js'],
  },
}
