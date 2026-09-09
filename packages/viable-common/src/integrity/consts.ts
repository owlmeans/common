
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
 */

/** The five workspace packages, in the order the build runs them. */
export enum TargetPackage {
  Common = 'common',
  Backend = 'backend',
  Api = 'api',
  Web = 'web',
  Worker = 'worker',
}

/** Directory holding the workspace packages, relative to the sandbox root. */
export const TARGET_PACKAGES_DIR = 'sources'

/** The packages that bundle themselves — the ones carrying a rollup pair. */
export const TARGET_BUNDLED_PACKAGES = [
  TargetPackage.Api, TargetPackage.Web, TargetPackage.Worker,
] as const

const dirOf = (pkg: TargetPackage): string => `${TARGET_PACKAGES_DIR}/${pkg}`
const fileOf = (pkg: TargetPackage, path: string): string => `${dirOf(pkg)}/${path}`

/**
 * The layout a target was generated with.
 *
 * Slots published before the `create-app` adoption hold `packages/{common,backend,frontend}` and
 * keep running: their volume is the user's, and a platform that refuses to serve what it itself
 * generated is a platform that deletes projects. Detection is by probe file rather than by a
 * recorded flag, because the tree on the PVC is the only thing that is certainly true about it.
 */
export enum TargetLayout {
  V1 = 'v1',
  V2 = 'v2',
}

/** The legacy layout, kept only so an already-published slot stays servable. */
export const TARGET_LEGACY_PACKAGES_DIR = 'packages'
export const TARGET_LEGACY_PACKAGES = ['common', 'backend', 'frontend'] as const

/**
 * The files whose presence tells the two layouts apart. A caller reads these alongside
 * `TARGET_INTEGRITY_FILES` and hands both to the pure functions below.
 */
export const TARGET_LAYOUT_PROBE_FILES = [
  `${TARGET_PACKAGES_DIR}/${TargetPackage.Common}/package.json`,
  `${TARGET_LEGACY_PACKAGES_DIR}/${TARGET_LEGACY_PACKAGES[0]}/package.json`,
] as const

/**
 * Which layout a tree is in, from its files alone — IO-free, like everything else here.
 *
 * A tree that shows neither probe is reported as `V2`: it is not a target at all, and the
 * integrity report is what has to say so, in the vocabulary of the layout the platform
 * currently generates.
 */
export const detectTargetLayout = (files: Record<string, string | null>): TargetLayout => {
  if (files[TARGET_LAYOUT_PROBE_FILES[0]] != null) return TargetLayout.V2
  if (files[TARGET_LAYOUT_PROBE_FILES[1]] != null) return TargetLayout.V1

  return TargetLayout.V2
}

/**
 * Files a caller must read and hand to `verifyTargetShape`.
 *
 * The verifier is pure and does no IO of its own — the publisher reads these from the PVC, and
 * a test reads them from the template tree. A path that does not exist is passed as `null`,
 * which the verifier reports rather than skipping: absence is a violation for everything here.
 */
export const TARGET_INTEGRITY_FILES: readonly string[] = [
  'package.json',
  'bunfig.toml',
  fileOf(TargetPackage.Common, 'package.json'),
  fileOf(TargetPackage.Common, 'tsconfig.json'),
  fileOf(TargetPackage.Common, 'src/index.ts'),
  fileOf(TargetPackage.Common, 'src/entrypoints.ts'),
  fileOf(TargetPackage.Backend, 'package.json'),
  fileOf(TargetPackage.Backend, 'tsconfig.json'),
  fileOf(TargetPackage.Backend, 'src/index.ts'),
  fileOf(TargetPackage.Backend, 'src/context.ts'),
  fileOf(TargetPackage.Backend, 'src/config.ts'),
  fileOf(TargetPackage.Api, 'package.json'),
  fileOf(TargetPackage.Api, 'tsconfig.json'),
  fileOf(TargetPackage.Api, 'rollup.config.js'),
  fileOf(TargetPackage.Api, 'rollup.build.mjs'),
  fileOf(TargetPackage.Api, 'src/index.ts'),
  fileOf(TargetPackage.Api, 'src/owlmeans.ts'),
  fileOf(TargetPackage.Api, 'src/config.ts'),
  fileOf(TargetPackage.Api, 'src/entrypoints.ts'),
  fileOf(TargetPackage.Web, 'package.json'),
  fileOf(TargetPackage.Web, 'tsconfig.json'),
  fileOf(TargetPackage.Web, 'rollup.config.js'),
  fileOf(TargetPackage.Web, 'rollup.build.mjs'),
  fileOf(TargetPackage.Web, 'src/index.tsx'),
  fileOf(TargetPackage.Web, 'src/owlmeans.ts'),
  fileOf(TargetPackage.Web, 'src/config.ts'),
  fileOf(TargetPackage.Web, 'src/entrypoints.ts'),
  fileOf(TargetPackage.Worker, 'package.json'),
  fileOf(TargetPackage.Worker, 'tsconfig.json'),
  fileOf(TargetPackage.Worker, 'rollup.config.js'),
  fileOf(TargetPackage.Worker, 'rollup.build.mjs'),
  fileOf(TargetPackage.Worker, 'src/index.ts'),
  fileOf(TargetPackage.Worker, 'src/owlmeans.ts'),
  fileOf(TargetPackage.Worker, 'src/config.ts'),
  fileOf(TargetPackage.Worker, 'src/entrypoints.ts'),
]

/**
 * Files no user-facing write may touch, through any path.
 *
 * These are the ones that decide what gets EXECUTED — the build scripts, the package manifests
 * that name them, the compiler configuration that resolves them, and the install configuration.
 * The agent harness is here for the same reason: `.claude/settings.json` declares a
 * `SessionStart` hook and `.agents/scripts/link-skills.sh` is the command it spawns, so a write
 * to either runs code in the slot the next time an agent session opens, with no build and no
 * request involved. The agent's own generator already refuses the wiring sources
 * (`WIRING_SOURCES`), but that guard is LLM-scoped: it never saw a manual editor save and never
 * saw a git merge.
 */
export const TARGET_PROTECTED_FILES: readonly string[] = [
  'package.json',
  'bunfig.toml',
  'bun.lock',
  'index.js',
  '.claude/settings.json',
  '.agents/scripts/link-skills.sh',
  ...Object.values(TargetPackage).flatMap(pkg => [
    fileOf(pkg, 'package.json'),
    fileOf(pkg, 'tsconfig.json'),
  ]),
  ...TARGET_BUNDLED_PACKAGES.flatMap(pkg => [
    fileOf(pkg, 'rollup.config.js'),
    fileOf(pkg, 'rollup.build.mjs'),
  ]),
]

/**
 * The exact `scripts.build` each package must declare.
 *
 * The single most important line in this file. `bun run build` is what the publisher spawns
 * (`services/slot.ts`), what the boot check spawns, and what the production build init
 * container spawns — so whatever this string says is what the platform executes, with the
 * slot's environment and its database credentials in scope. An exact match, not a marker: the
 * template has never varied these, and "contains rollup" would admit
 * `curl … | sh && bun ./rollup.build.mjs`.
 *
 * `common` and `backend` are libraries the other three import, so they emit declarations with
 * `tsc -b` rather than a bundle.
 */
export const TARGET_BUILD_SCRIPTS: Record<TargetPackage, string> = {
  [TargetPackage.Common]: 'tsc -b',
  [TargetPackage.Backend]: 'tsc -b',
  [TargetPackage.Api]: 'bun ./rollup.build.mjs',
  [TargetPackage.Web]: 'bun ./rollup.build.mjs',
  [TargetPackage.Worker]: 'bun ./rollup.build.mjs',
}

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

/** `<slug>-<package>` — the only way a workspace package is ever named. */
export const targetPackageName = (slug: string, pkg: TargetPackage): string => `${slug}-${pkg}`

/**
 * The workspace list the root manifest may declare.
 *
 * Two spellings are accepted because both are correct and `create-app` emits the first: the glob
 * over the packages directory, or the five entries written out. Anything else builds something
 * other than these packages.
 */
export const TARGET_WORKSPACE_GLOB = `${TARGET_PACKAGES_DIR}/*`
export const TARGET_WORKSPACE_ENTRIES: readonly string[] =
  Object.values(TargetPackage).map(pkg => dirOf(pkg))

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

/**
 * Framework dependencies without which the package cannot be the generated app.
 *
 * A floor, not a lockdown: a target legitimately carries whatever the template ships, and this
 * only asserts that the OwlMeans entry points it is built on are still declared. A tree that
 * dropped `@owlmeans/web-client` is not a Viable web app whatever else it contains.
 */
export const TARGET_REQUIRED_DEPS: Record<TargetPackage, readonly string[]> = {
  [TargetPackage.Common]: ['@owlmeans/context', '@owlmeans/entrypoint'],
  [TargetPackage.Backend]: ['@owlmeans/context', '@owlmeans/postgres-resource'],
  [TargetPackage.Api]: ['@owlmeans/server-app'],
  [TargetPackage.Web]: ['@owlmeans/web-client'],
  [TargetPackage.Worker]: ['@owlmeans/queue', '@owlmeans/redis-queue'],
}

/**
 * The workspace siblings each package must depend on — the edges that make the layout real.
 *
 * `api` and `worker` both reach the database through `backend`, which is the whole reason
 * `backend` is a library: two runtimes, one context factory, one set of resources. A `worker`
 * that stopped depending on `backend` is processing jobs against something else.
 */
export const TARGET_WORKSPACE_DEPS: Record<TargetPackage, readonly TargetPackage[]> = {
  [TargetPackage.Common]: [],
  [TargetPackage.Backend]: [TargetPackage.Common],
  [TargetPackage.Api]: [TargetPackage.Common, TargetPackage.Backend],
  [TargetPackage.Web]: [TargetPackage.Common],
  [TargetPackage.Worker]: [TargetPackage.Backend],
}

/** Everything one package must declare, once the root manifest has named the slug. */
export const targetRequiredDeps = (slug: string, pkg: TargetPackage): string[] => [
  ...TARGET_REQUIRED_DEPS[pkg],
  ...TARGET_WORKSPACE_DEPS[pkg].map(dep => targetPackageName(slug, dep)),
]

/**
 * Markers proving an entry file is still the framework's entry and not merely a file with the
 * right name.
 *
 * Substrings rather than digests, because a target's entrypoints are template-owned but not
 * frozen: the generator restores them (`WIRING_SOURCES`) and the template evolves. Each marker
 * names something the file cannot do its job without — the framework import it hands control
 * to, and the module it takes the context from. `packages/library/tests/integrity` runs the
 * whole manifest against the live template, so a template change that invalidates a marker
 * fails there rather than in a slot.
 */
export const TARGET_ENTRY_MARKERS: Record<string, string[]> = {
  [fileOf(TargetPackage.Common, 'src/index.ts')]: ['./entrypoints.js'],
  [fileOf(TargetPackage.Backend, 'src/index.ts')]: ['./context.js'],
  [fileOf(TargetPackage.Backend, 'src/context.ts')]: ['@owlmeans/context', 'makeContext'],
  [fileOf(TargetPackage.Api, 'src/index.ts')]: ['./owlmeans.js', 'initOwlMeans'],
  [fileOf(TargetPackage.Api, 'src/owlmeans.ts')]: ['@owlmeans/server-app', 'makeContext'],
  [fileOf(TargetPackage.Web, 'src/index.tsx')]: ['@owlmeans/web-client', 'renderApp', './owlmeans'],
  [fileOf(TargetPackage.Web, 'src/owlmeans.ts')]: ['makeContext', 'owlCtx'],
  // The worker binds nothing but its health port; what makes it a worker is that it listens.
  [fileOf(TargetPackage.Worker, 'src/index.ts')]: ['./owlmeans.js', 'initOwlMeans'],
  [fileOf(TargetPackage.Worker, 'src/owlmeans.ts')]: ['@owlmeans/queue', 'makeContext'],
  // The build configuration itself: what it reads and what it emits. These are the paths the
  // publisher spawns and serves, so a config that redirects either one is a different program.
  // Matched loosely enough to survive the `path.resolve(srcDir, …)` the template writes them
  // with, and strictly enough that an input or an output somewhere else fails.
  [fileOf(TargetPackage.Api, 'rollup.config.js')]: ['input:', 'index.ts', 'dist', 'index.js'],
  [fileOf(TargetPackage.Web, 'rollup.config.js')]: ['input:', 'index.tsx', 'dist', 'bundle.js'],
  [fileOf(TargetPackage.Worker, 'rollup.config.js')]: ['input:', 'index.ts', 'dist', 'index.js'],
}

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
