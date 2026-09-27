import fs from 'node:fs'
import path from 'node:path'

import { LAYOUT_MARKERS, LAYOUTS, subprojectDirOf, TargetLayout } from '@owlmeans/viable-common'
import type { SubProject, TargetPaths } from '@owlmeans/viable-common'

/**
 * Where a target project's packages live, in THIS directory.
 *
 * The tables — which role is which directory, what a full build runs, which packages must be
 * built before anything imports them — belong to `@owlmeans/viable-common`, because the publisher
 * answers the same questions over a pod volume. What lives here is the pair of filesystem probes
 * that pick a layout and turn a package name into an absolute path.
 *
 * Platform vs target: this describes a TARGET project's directory shape. Nothing about the SDK's
 * own repository is v1 or v2.
 */

const MARKERS: Array<[TargetLayout, string]> = LAYOUT_MARKERS.map(
  ([layout, marker]) => [layout, path.join(...marker.split('/'))]
)

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
export const detectLayout = (dir: string): TargetLayout => {
  for (const [layout, marker] of MARKERS) {
    if (fs.existsSync(path.join(dir, marker))) {
      return layout
    }
  }

  return TargetLayout.V1
}

/** Where every role lives in this directory's target project. */
export const targetPaths = (dir: string): TargetPaths => LAYOUTS[detectLayout(dir)]

/** Absolute path of the package that runs as the target's HTTP server. */
export const apiPath = (dir: string): string => {
  const paths = targetPaths(dir)

  return path.resolve(dir, paths.dir, paths.api)
}

/** Absolute path of the package whose `dist/` is served to a browser. */
export const webPath = (dir: string): string => {
  const paths = targetPaths(dir)

  return path.resolve(dir, paths.dir, paths.web)
}

/**
 * Absolute path of the package that runs as the target's queue worker, or `null` when this
 * layout has no such package at all.
 *
 * A path, not a verdict: it answers where a worker WOULD live and says nothing about whether one
 * is there. {@link hasWorker} is the disk read.
 */
export const workerPath = (dir: string): string | null => {
  const paths = targetPaths(dir)

  return paths.worker == null ? null : path.resolve(dir, paths.dir, paths.worker)
}

/**
 * Whether this target project has a queue worker.
 *
 * Read from disk rather than from a record, for the same reason the layout is: what runs is
 * whatever was generated, a re-initialization can replace it under a running connector, and a
 * remembered answer would supervise a package that is no longer there — or miss one that has
 * just arrived. The manifest and not the directory, because a half-finished install leaves the
 * directory behind.
 */
export const hasWorker = (dir: string): boolean => {
  const worker = workerPath(dir)

  return worker != null && fs.existsSync(path.join(worker, 'package.json'))
}

/**
 * Resolve a wire-level subproject role to the directory it names in this tree.
 *
 * `SubProject` is a ROLE and stays one: the vocabulary on the wire is not rewritten, it is
 * mapped, per layout. An unknown value — a role from a platform newer than this connector —
 * falls back to the role's own name, which fails visibly rather than resolving to some other
 * package's directory.
 */
export const subprojectDir = (dir: string, role: SubProject): string =>
  subprojectDirOf(detectLayout(dir), role)

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
export const libraryPaths = (dir: string): string[] => {
  const paths = targetPaths(dir)

  return paths.libraries
    .map(pkg => path.resolve(dir, paths.dir, pkg))
    .filter(library => fs.existsSync(library))
}
