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
