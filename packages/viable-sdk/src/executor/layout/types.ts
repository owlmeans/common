import type { AppDescriptor, SubProject, TargetLayout, TargetPaths } from '@owlmeans/viable-common'

/**
 * Where a target project's packages live, in ONE directory.
 *
 * Every member reads the directory again, per call: a re-initialization replaces the tree under a
 * running connector, and a remembered verdict would then resolve every path into a directory that
 * no longer exists.
 */
export interface LayoutHelper {
  /**
   * Read the directory and say which layout its target project has.
   *
   * An empty or half-installed tree answers `V1`, matching the publisher: a project that has not
   * been initialized yet resolves the paths it always did, and the answer flips by itself the
   * moment a v2 tree lands.
   *
   * Deliberately un-memoized. It is two `stat`s against a page cache the process touches
   * constantly, while a re-initialization replaces the tree wholesale under a running connector —
   * a remembered verdict would then resolve every path into a directory that no longer exists,
   * with a `posix_spawn` ENOENT as the only symptom.
   */
  detectLayout: () => TargetLayout
  /** Where every role lives in this directory's target project. */
  targetPaths: () => TargetPaths
  /**
   * The applications this tree serves, `main` first, then by index — read from the target's topology
   * record (`.agents/memory/topology.md`) per call. A v1 tree, a tree without the record, or a record
   * whose app map breaks a rule is the one app every project has: `main` at the root.
   */
  apps: () => AppDescriptor[]
  /**
   * Absolute path of the package that runs as an app's HTTP server — `main`'s (the layout's api
   * package) when `app` is absent or `main`, else that app's own (`sources/<app>-api` by default).
   */
  apiPath: (app?: string) => string
  /** Absolute path of the package whose `dist/` is served to a browser — per app, as {@link apiPath}. */
  webPath: (app?: string) => string
  /**
   * Absolute path of the package that runs as the target's queue worker, or `null` when this
   * layout has no such package at all.
   *
   * A path, not a verdict: it answers where a worker WOULD live and says nothing about whether one
   * is there. {@link LayoutHelper.hasWorker} is the disk read.
   */
  workerPath: () => string | null
  /**
   * Whether this target project has a queue worker.
   *
   * Read from disk rather than from a record, for the same reason the layout is: what runs is
   * whatever was generated, a re-initialization can replace it under a running connector, and a
   * remembered answer would supervise a package that is no longer there — or miss one that has
   * just arrived. The manifest and not the directory, because a half-finished install leaves the
   * directory behind.
   */
  hasWorker: () => boolean
  /**
   * Resolve a wire-level subproject role to the directory it names in this tree.
   *
   * `SubProject` is a ROLE and stays one: the vocabulary on the wire is not rewritten, it is
   * mapped, per layout. An unknown value — a role from a platform newer than this connector —
   * falls back to the role's own name, which fails visibly rather than resolving to some other
   * package's directory.
   */
  subprojectDir: (role: SubProject) => string
  /**
   * Absolute paths of the packages that must be built before anything that imports them, in
   * dependency order — see `TargetPaths.libraries`.
   *
   * Every bundled package keeps its dependencies external, so `<slug>-common` and (on v2)
   * `<slug>-backend` are resolved from `node_modules` at RUN time and followed to their `main`.
   * Nothing else builds them: the api, web and worker builds each run inside their own directory.
   * Missing directories are dropped — a build spawned into one that does not exist reports
   * `ENOENT … posix_spawn '/bin/sh'`, which blames the toolchain for a tree that is simply
   * incomplete.
   */
  libraryPaths: () => string[]
}
