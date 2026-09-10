/**
 * The shape a target project must have before the platform will install, build or run it.
 *
 * A slot is a pod the platform owns, on a hostname the platform owns, holding a volume the
 * user can write to — through the editor, through the agent, and through a GitHub pull that
 * merges a tree nobody here has read. What the publisher then executes comes out of that
 * volume: `bun run build` reads `scripts.build` from a `package.json` on the PVC, `bun install`
 * runs whatever lifecycle hooks it declares, and `bun dist/index.js` runs whatever the build
 * emitted. Replacing the generated app with something else is therefore not an exploit — it is
 * the documented behaviour of the tools, and the manifest below is what makes it fail.
 *
 * Deliberately structural, never heuristic: a list of paths, a handful of exact strings, and
 * a few markers. Nothing here asks a model what code means. The point is not to judge a
 * program — it is to refuse a tree that is not the one the platform generated.
 *
 * **Two trees are the one the platform generated.** A slot's volume holds the layout it was
 * initialized with for the life of the project and nothing migrates it, so the manifest is
 * per-layout and the tree picks which one it is verified against ({@link detectTargetLayout}).
 * Asserting the current layout unconditionally is not a stricter check — it is a check aimed at
 * the wrong tree, and every legacy slot answers it with one `missing` violation per path it was
 * never supposed to have. That refuses the application the platform itself generated, in front
 * of every spawn, which takes the target's backend down permanently while its preview keeps
 * serving the last build.
 */

/** The five workspace packages of the current layout, in the order the build runs them. */
export enum TargetPackage {
  Common = 'common',
  Backend = 'backend',
  Api = 'api',
  Web = 'web',
  Worker = 'worker',
}

/**
 * The three workspace packages of the legacy layout.
 *
 * Not a renaming of {@link TargetPackage}: v1's `backend` is the HTTP SERVER (v2 split that into
 * the `backend` library plus the `api` runtime) and its `frontend` is v2's `web`. The two
 * vocabularies overlap in spelling and disagree in meaning, which is exactly why they are
 * separate enums and every rule is looked up per layout.
 */
export enum TargetLegacyPackage {
  Common = 'common',
  Backend = 'backend',
  Frontend = 'frontend',
}

/** Directory holding the workspace packages of the current layout, relative to the sandbox root. */
export const TARGET_PACKAGES_DIR = 'sources'

/** The legacy layout's packages directory, kept so an already-published slot stays servable. */
export const TARGET_LEGACY_PACKAGES_DIR = 'packages'

/** The packages that bundle themselves — the ones carrying a rollup pair. */
export const TARGET_BUNDLED_PACKAGES = [
  TargetPackage.Api, TargetPackage.Web, TargetPackage.Worker,
] as const

/** Same, for the legacy layout: its `common` is the only `tsc -b` library. */
export const TARGET_LEGACY_BUNDLED_PACKAGES = [
  TargetLegacyPackage.Backend, TargetLegacyPackage.Frontend,
] as const

export const TARGET_LEGACY_PACKAGES = Object.values(TargetLegacyPackage)

/**
 * The layout a target was generated with.
 *
 * Slots created before the `create-app` adoption hold `packages/{common,backend,frontend}` and
 * keep running: their volume is the user's, and a platform that refuses to serve what it itself
 * generated is a platform that deletes projects. Detection is by probe file rather than by a
 * recorded flag, because the tree on the PVC is the only thing that is certainly true about it —
 * a re-initialization replaces the tree wholesale under a running pod.
 */
export enum TargetLayout {
  V1 = 'v1',
  V2 = 'v2',
}

/**
 * What the platform generates today. The one layout a NEW project is ever created with, and
 * therefore the only one anything upstream of the sandbox — code generation, path builders,
 * the metadata tree — knows how to write.
 */
export const TARGET_CURRENT_LAYOUT = TargetLayout.V2

/**
 * Everything one layout asserts about a tree.
 *
 * One record per layout rather than a set of parallel constants, because the rules are the same
 * questions asked of a different package set: a rule that exists for one layout and is forgotten
 * for the other is a hole that nothing fails on.
 */
export interface TargetLayoutManifest {
  layout: TargetLayout
  /** Directory holding the workspace packages, relative to the sandbox root. */
  dir: string
  /** Package directory names, in build order. */
  packages: readonly string[]
  /** The one file whose presence identifies this layout and appears in no other. */
  probe: string
  /** Every file the verifier reads for this layout. */
  files: readonly string[]
  /** Files no user-facing write may touch in a tree of this layout. */
  protectedFiles: readonly string[]
  /** The exact `scripts.build` each package must declare. */
  buildScripts: Readonly<Record<string, string>>
  /** Framework dependencies without which a package cannot be the generated app. */
  requiredDeps: Readonly<Record<string, readonly string[]>>
  /** The workspace siblings each package must depend on. */
  workspaceDeps: Readonly<Record<string, readonly string[]>>
  /** The glob spelling of the root manifest's workspace list. */
  workspaceGlob: string
  /** The written-out spelling of the same list. */
  workspaceEntries: readonly string[]
  /** Markers proving an entry file is still the framework's entry, keyed by file. */
  markers: Readonly<Record<string, readonly string[]>>
}

const fileIn = (dir: string, pkg: string, path: string): string => `${dir}/${pkg}/${path}`

/** The harness files, protected in every layout — see {@link TARGET_PROTECTED_FILES}. */
const HARNESS_PROTECTED = ['.claude/settings.json', '.agents/scripts/link-skills.sh'] as const

/** Root-level files protected in every layout. */
const ROOT_PROTECTED = ['package.json', 'bunfig.toml', 'bun.lock', 'index.js'] as const

const protectedOf = (
  dir: string, packages: readonly string[], bundled: readonly string[]
): readonly string[] => [
  ...ROOT_PROTECTED,
  ...HARNESS_PROTECTED,
  ...packages.flatMap(pkg => [fileIn(dir, pkg, 'package.json'), fileIn(dir, pkg, 'tsconfig.json')]),
  ...bundled.flatMap(pkg =>
    [fileIn(dir, pkg, 'rollup.config.js'), fileIn(dir, pkg, 'rollup.build.mjs')]),
]

const v2 = (pkg: TargetPackage, path: string): string =>
  fileIn(TARGET_PACKAGES_DIR, pkg, path)
const v1 = (pkg: TargetLegacyPackage, path: string): string =>
  fileIn(TARGET_LEGACY_PACKAGES_DIR, pkg, path)

/**
 * The current layout: five workspace packages under `sources/`.
 *
 * `common` and `backend` are libraries the other three import, so they emit declarations with
 * `tsc -b` rather than a bundle; `api`, `web` and `worker` each bundle themselves.
 */
const V2_MANIFEST: TargetLayoutManifest = {
  layout: TargetLayout.V2,
  dir: TARGET_PACKAGES_DIR,
  packages: Object.values(TargetPackage),
  // The same file the publisher's own filesystem detection probes for (`sources/api`), so the
  // two answers about one volume cannot disagree.
  probe: v2(TargetPackage.Api, 'package.json'),
  files: [
    'package.json',
    'bunfig.toml',
    v2(TargetPackage.Common, 'package.json'),
    v2(TargetPackage.Common, 'tsconfig.json'),
    v2(TargetPackage.Common, 'src/index.ts'),
    v2(TargetPackage.Common, 'src/entrypoints.ts'),
    v2(TargetPackage.Backend, 'package.json'),
    v2(TargetPackage.Backend, 'tsconfig.json'),
    v2(TargetPackage.Backend, 'src/index.ts'),
    v2(TargetPackage.Backend, 'src/context.ts'),
    v2(TargetPackage.Backend, 'src/config.ts'),
    v2(TargetPackage.Api, 'package.json'),
    v2(TargetPackage.Api, 'tsconfig.json'),
    v2(TargetPackage.Api, 'rollup.config.js'),
    v2(TargetPackage.Api, 'rollup.build.mjs'),
    v2(TargetPackage.Api, 'src/index.ts'),
    v2(TargetPackage.Api, 'src/owlmeans.ts'),
    v2(TargetPackage.Api, 'src/config.ts'),
    v2(TargetPackage.Api, 'src/entrypoints.ts'),
    v2(TargetPackage.Web, 'package.json'),
    v2(TargetPackage.Web, 'tsconfig.json'),
    v2(TargetPackage.Web, 'rollup.config.js'),
    v2(TargetPackage.Web, 'rollup.build.mjs'),
    v2(TargetPackage.Web, 'src/index.tsx'),
    v2(TargetPackage.Web, 'src/owlmeans.ts'),
    v2(TargetPackage.Web, 'src/config.ts'),
    v2(TargetPackage.Web, 'src/entrypoints.ts'),
    v2(TargetPackage.Worker, 'package.json'),
    v2(TargetPackage.Worker, 'tsconfig.json'),
    v2(TargetPackage.Worker, 'rollup.config.js'),
    v2(TargetPackage.Worker, 'rollup.build.mjs'),
    v2(TargetPackage.Worker, 'src/index.ts'),
    v2(TargetPackage.Worker, 'src/owlmeans.ts'),
    v2(TargetPackage.Worker, 'src/config.ts'),
    v2(TargetPackage.Worker, 'src/entrypoints.ts'),
  ],
  protectedFiles: protectedOf(
    TARGET_PACKAGES_DIR, Object.values(TargetPackage), TARGET_BUNDLED_PACKAGES),
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
    [v2(TargetPackage.Common, 'src/index.ts')]: ['./entrypoints.js'],
    [v2(TargetPackage.Backend, 'src/index.ts')]: ['./context.js'],
    [v2(TargetPackage.Backend, 'src/context.ts')]: ['@owlmeans/context', 'makeContext'],
    [v2(TargetPackage.Api, 'src/index.ts')]: ['./owlmeans.js', 'initOwlMeans'],
    [v2(TargetPackage.Api, 'src/owlmeans.ts')]: ['@owlmeans/server-app', 'makeContext'],
    [v2(TargetPackage.Web, 'src/index.tsx')]: ['@owlmeans/web-client', 'renderApp', './owlmeans'],
    [v2(TargetPackage.Web, 'src/owlmeans.ts')]: ['makeContext', 'owlCtx'],
    // The worker binds nothing but its health port; what makes it a worker is that it listens.
    [v2(TargetPackage.Worker, 'src/index.ts')]: ['./owlmeans.js', 'initOwlMeans'],
    [v2(TargetPackage.Worker, 'src/owlmeans.ts')]: ['@owlmeans/queue', 'makeContext'],
    // The build configuration itself: what it reads and what it emits. These are the paths the
    // publisher spawns and serves, so a config that redirects either one is a different program.
    // Matched loosely enough to survive the `path.resolve(srcDir, …)` the template writes them
    // with, and strictly enough that an input or an output somewhere else fails.
    [v2(TargetPackage.Api, 'rollup.config.js')]: ['input:', 'index.ts', 'dist', 'index.js'],
    [v2(TargetPackage.Web, 'rollup.config.js')]: ['input:', 'index.tsx', 'dist', 'bundle.js'],
    [v2(TargetPackage.Worker, 'rollup.config.js')]: ['input:', 'index.ts', 'dist', 'index.js'],
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
const V1_MANIFEST: TargetLayoutManifest = {
  layout: TargetLayout.V1,
  dir: TARGET_LEGACY_PACKAGES_DIR,
  packages: TARGET_LEGACY_PACKAGES,
  // `packages/backend` again — the publisher's own marker for this layout.
  probe: v1(TargetLegacyPackage.Backend, 'package.json'),
  files: [
    'package.json',
    'bunfig.toml',
    v1(TargetLegacyPackage.Common, 'package.json'),
    v1(TargetLegacyPackage.Common, 'tsconfig.json'),
    v1(TargetLegacyPackage.Common, 'src/index.ts'),
    v1(TargetLegacyPackage.Common, 'src/entrypoints.ts'),
    v1(TargetLegacyPackage.Backend, 'package.json'),
    v1(TargetLegacyPackage.Backend, 'tsconfig.json'),
    v1(TargetLegacyPackage.Backend, 'rollup.config.js'),
    v1(TargetLegacyPackage.Backend, 'rollup.build.mjs'),
    v1(TargetLegacyPackage.Backend, 'src/index.ts'),
    v1(TargetLegacyPackage.Backend, 'src/owlmeans.ts'),
    v1(TargetLegacyPackage.Backend, 'src/config.ts'),
    v1(TargetLegacyPackage.Backend, 'src/entrypoints.ts'),
    v1(TargetLegacyPackage.Frontend, 'package.json'),
    v1(TargetLegacyPackage.Frontend, 'tsconfig.json'),
    v1(TargetLegacyPackage.Frontend, 'rollup.config.js'),
    v1(TargetLegacyPackage.Frontend, 'rollup.build.mjs'),
    v1(TargetLegacyPackage.Frontend, 'src/index.tsx'),
    v1(TargetLegacyPackage.Frontend, 'src/owlmeans.ts'),
    v1(TargetLegacyPackage.Frontend, 'src/config.ts'),
    v1(TargetLegacyPackage.Frontend, 'src/entrypoints.ts'),
  ],
  protectedFiles: protectedOf(
    TARGET_LEGACY_PACKAGES_DIR, TARGET_LEGACY_PACKAGES, TARGET_LEGACY_BUNDLED_PACKAGES),
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
    [v1(TargetLegacyPackage.Common, 'src/index.ts')]: ['./entrypoints.js'],
    [v1(TargetLegacyPackage.Backend, 'src/index.ts')]: ['./owlmeans.js', 'initOwlMeans'],
    [v1(TargetLegacyPackage.Backend, 'src/owlmeans.ts')]: ['@owlmeans/server-app', 'makeContext'],
    [v1(TargetLegacyPackage.Frontend, 'src/index.tsx')]:
      ['@owlmeans/web-client', 'renderApp', './owlmeans'],
    [v1(TargetLegacyPackage.Frontend, 'src/owlmeans.ts')]: ['makeContext', 'owlCtx'],
    [v1(TargetLegacyPackage.Backend, 'rollup.config.js')]:
      ['input:', 'index.ts', 'dist', 'index.js'],
    [v1(TargetLegacyPackage.Frontend, 'rollup.config.js')]:
      ['input:', 'index.tsx', 'dist', 'bundle.js'],
  },
}

/**
 * Every layout the platform is willing to run, keyed by its own name.
 *
 * Declared current-first, and the order is load-bearing: detection walks it and takes the first
 * probe it finds, so a half-migrated tree carrying both is verified against the layout the
 * platform generates today rather than against the frozen one.
 */
export const TARGET_LAYOUTS: Readonly<Record<TargetLayout, TargetLayoutManifest>> = {
  [TargetLayout.V2]: V2_MANIFEST,
  [TargetLayout.V1]: V1_MANIFEST,
}

/** What one layout asserts. */
export const targetManifest = (layout: TargetLayout): TargetLayoutManifest =>
  TARGET_LAYOUTS[layout]

/**
 * Whether a tree of this layout can still be GENERATED INTO.
 *
 * A legacy target is served, built and run exactly like any other — that is the whole point of
 * verifying it against its own manifest. What no longer works on it is code generation: every
 * path builder, every stamped import specifier and the whole `docs/` metadata tree name the
 * current layout's packages, so a story implemented into a legacy tree writes files into
 * directories its workspace does not contain. That fails silently — the build succeeds, the
 * story completes and the application does not change — which is why the platform refuses
 * instead, and names re-initialization as the one cure.
 *
 * `undefined` reads as current: a publisher that predates layout reporting omits it, and reading
 * that silence as legacy would refuse development for every slot already in the cluster.
 */
export const isLegacyLayout = (layout: TargetLayout | string | undefined | null): boolean =>
  layout != null && layout !== TARGET_CURRENT_LAYOUT

/**
 * The files whose presence tells the layouts apart.
 *
 * Each layout's probe is a path the other cannot have. They are members of their own layout's
 * file list too, so a caller that reads {@link TARGET_INTEGRITY_FILES} always has both in hand —
 * which is the whole reason detection works at all. It did not before: the probe for the legacy
 * layout was declared but never read, so `detectTargetLayout` could only ever answer `V2`.
 */
export const TARGET_LAYOUT_PROBE_FILES: readonly string[] =
  Object.values(TARGET_LAYOUTS).map(manifest => manifest.probe)

/**
 * Which layout a tree is in, from its files alone — IO-free, like everything else here.
 *
 * A tree that shows neither probe is reported as the current layout: it is not a target at all,
 * and the integrity report is what has to say so, in the vocabulary of the layout the platform
 * generates today.
 */
export const detectTargetLayout = (files: Record<string, string | null>): TargetLayout => {
  for (const manifest of Object.values(TARGET_LAYOUTS)) {
    if (files[manifest.probe] != null) {
      return manifest.layout
    }
  }

  return TARGET_CURRENT_LAYOUT
}

/**
 * Files a caller must read and hand to `verifyTargetShape`.
 *
 * The UNION over every layout, because a caller reads before it knows which layout it is holding
 * and the probes are what settle that. The verifier reports only the files its selected layout
 * actually requires, so the extra reads cost a `stat` each and never a violation.
 *
 * The verifier is pure and does no IO of its own — the publisher reads these from the PVC, and
 * a test reads them from the template tree. A path that does not exist is passed as `null`,
 * which the verifier reports rather than skipping: absence is a violation for everything here.
 */
export const TARGET_INTEGRITY_FILES: readonly string[] = [
  ...new Set(Object.values(TARGET_LAYOUTS).flatMap(manifest => manifest.files)),
]

/**
 * Files no user-facing write may touch, through any path — the union over every layout.
 *
 * These are the ones that decide what gets EXECUTED — the build scripts, the package manifests
 * that name them, the compiler configuration that resolves them, and the install configuration.
 * The agent harness is here for the same reason: `.claude/settings.json` declares a
 * `SessionStart` hook and `.agents/scripts/link-skills.sh` is the command it spawns, so a write
 * to either runs code in the slot the next time an agent session opens, with no build and no
 * request involved. The agent's own generator already refuses the wiring sources
 * (`WIRING_SOURCES`), but that guard is LLM-scoped: it never saw a manual editor save and never
 * saw a git merge.
 *
 * The union rather than the current layout's list, because this is a path-shaped refusal with
 * nothing to gain from being narrow: a v2 path cannot exist in a v1 tree, so covering both costs
 * nothing and covers the legacy slots that were left writable.
 */
export const TARGET_PROTECTED_FILES: readonly string[] = [
  ...new Set(Object.values(TARGET_LAYOUTS).flatMap(manifest => manifest.protectedFiles)),
]

/**
 * What a target's root package may be named — and therefore what every other name in the tree is.
 *
 * The root manifest's `name` IS the project slug: it is what the user chose, what the hostname
 * carries, and what each workspace package prefixes itself with. Verification reads it once and
 * checks the rest AGAINST it, so a renamed project stays verifiable instead of being refused for
 * no longer being called `project`.
 *
 * The pattern is the npm-name subset a hostname label also accepts, because the two are the same
 * string: lowercase alphanumerics and inner hyphens, 1–32 characters, never starting or ending
 * with a hyphen.
 */
export const TARGET_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/

/** `<slug>-<package>` — the only way a workspace package is ever named, in either layout. */
export const targetPackageName = (slug: string, pkg: string): string => `${slug}-${pkg}`

/**
 * npm lifecycle hooks, forbidden in every one of the target's manifests.
 *
 * `bun install` runs these, and the target's install runs as part of ordinary provisioning and
 * of every `Reinstall`. A `postinstall` added to a pulled `package.json` is the shortest path
 * from "merged a branch" to "ran a command in the slot", and it does not need the build to
 * succeed or the app to work.
 */
export const TARGET_FORBIDDEN_SCRIPTS = [
  'preinstall', 'install', 'postinstall', 'preprepare', 'prepare', 'postprepare',
  'prepublish', 'prepublishOnly', 'postpublish', 'prepack', 'postpack',
] as const

/** Everything one package must declare, once the root manifest has named the slug. */
export const targetRequiredDeps = (
  slug: string, pkg: string, layout: TargetLayout = TARGET_CURRENT_LAYOUT
): string[] => {
  const manifest = targetManifest(layout)

  return [
    ...(manifest.requiredDeps[pkg] ?? []),
    ...(manifest.workspaceDeps[pkg] ?? []).map(dep => targetPackageName(slug, dep)),
  ]
}

/**
 * The current layout's own rules, kept as named constants because consumers outside the verifier
 * ask about the tree the platform generates today — never about a frozen one.
 */
export const TARGET_BUILD_SCRIPTS: Readonly<Record<string, string>> = V2_MANIFEST.buildScripts
export const TARGET_REQUIRED_DEPS: Readonly<Record<string, readonly string[]>> =
  V2_MANIFEST.requiredDeps
export const TARGET_WORKSPACE_DEPS: Readonly<Record<string, readonly string[]>> =
  V2_MANIFEST.workspaceDeps
export const TARGET_ENTRY_MARKERS: Readonly<Record<string, readonly string[]>> = V2_MANIFEST.markers
export const TARGET_WORKSPACE_GLOB = V2_MANIFEST.workspaceGlob
export const TARGET_WORKSPACE_ENTRIES: readonly string[] = V2_MANIFEST.workspaceEntries

/** Rule ids carried on a violation, so a consumer can branch without parsing prose. */
export enum IntegrityRule {
  Missing = 'missing',
  Unreadable = 'unreadable',
  PackageName = 'package-name',
  ModuleType = 'module-type',
  Workspaces = 'workspaces',
  BuildScript = 'build-script',
  LifecycleScript = 'lifecycle-script',
  RequiredDependency = 'required-dependency',
  EntryMarker = 'entry-marker',
  InstallConfig = 'install-config',
}
