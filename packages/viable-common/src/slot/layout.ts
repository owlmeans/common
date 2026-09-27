import { TargetLayout } from '../integrity/index.js'
import { packageForRole, resolveTopology, topologyOf } from '../topology/index.js'
import { SubProject } from './consts.js'

/**
 * Where each role lives, for one layout. Directory names are target-root-relative.
 *
 * The pure half of layout resolution. Whoever holds the tree — the publisher over a pod volume,
 * the connector over a directory on a developer's machine — adds the two filesystem probes that
 * pick the layout and turn these names into absolute paths. The TABLES are shared so the two
 * cannot disagree about what a role means.
 */
export interface TargetPaths {
  layout: TargetLayout
  /** The directory holding the workspace packages — `packages` or `sources`. */
  dir: string
  /** The package whose `dist/index.js` runs as the target's HTTP server. */
  api: string
  /** The package whose `dist/` is served to a browser. */
  web: string
  /** The shared library the other two compile against. */
  common: string
  /**
   * The package whose `dist/index.js` runs as the target's queue worker, when the target has one.
   *
   * Absent for v1, which had no such package and never will — a target's tree is the one it was
   * initialized with. Present for v2 as a NAME, not as a promise: every caller checks the disk
   * before acting on it.
   */
  worker?: string
  /**
   * Every package a full build runs, in dependency order.
   *
   * Longer than the three roles for v2, whose `backend` is a library that both `api` and `worker`
   * import. A caller skips whatever is not on disk — a target need not have a worker.
   */
  build: string[]
  /**
   * The packages built with `tsc -b` and consumed through their `build/` output, in dependency
   * order — never bundled, so their output has to be on disk at RUN time, not only at build time.
   *
   * The bundled packages keep every dependency external, so `bun dist/index.js` resolves
   * `project-backend` from `node_modules` at startup, follows its `main` to `build/index.js` — and
   * if nothing built it, Bun answers `Cannot find package 'project-backend'` and the target exits 1
   * with a message that names a dependency rather than a missing build.
   *
   * v1 got away without this list: it had ONE library and the template shipped its `build/`
   * prebuilt. v2 deleted those artifacts and added a second library, so every path that builds a
   * target has to build these first or it can never start.
   */
  libraries: string[]
}

/**
 * Where every role lives, per layout — DERIVED from that layout's topology.
 *
 * These were two hand-written records, and the pair could disagree with each other and with the
 * tree: `build` listed the packages in an order somebody maintained by hand beside the graph that
 * actually decides it, and `libraries` was a second copy of "which of these are built with
 * `tsc -b`". Both are now read off {@link LAYOUT_TOPOLOGIES}, so a package added to a topology
 * appears in the build order, in the library order and in the role map at once, or in none of them.
 *
 * The VALUES are unchanged, and `topology.spec.ts` pins them against the tables they replaced.
 */
const pathsOfTopology = (layout: TargetLayout): TargetPaths => {
  const topology = resolveTopology(topologyOf(layout))
  const dirOf = (role: SubProject): string | undefined => packageForRole(topology, role)?.name

  return {
    layout,
    dir: topology.dir,
    // The three roles every arrangement has. A topology without one is not a target, so the
    // fallback is the role's own name rather than a silent `undefined` reaching a path join.
    api: dirOf(SubProject.Api) ?? SubProject.Api,
    web: dirOf(SubProject.Web) ?? SubProject.Web,
    common: dirOf(SubProject.Common) ?? SubProject.Common,
    // A NAME, not a promise — every caller checks the disk before acting on it.
    ...(dirOf(SubProject.Worker) != null ? { worker: dirOf(SubProject.Worker) } : {}),
    build: topology.build,
    libraries: topology.libraries,
  }
}

export const LAYOUTS: Record<TargetLayout, TargetPaths> = {
  [TargetLayout.V1]: pathsOfTopology(TargetLayout.V1),
  [TargetLayout.V2]: pathsOfTopology(TargetLayout.V2),
}

/**
 * Role → directory, per layout. Total over {@link SubProject} in both layouts, deliberately.
 *
 * The v2 role names have v1 equivalents (`api` is v1's `backend`, `web` its `frontend`) and are
 * mapped to them, so a current sender talking to an old tree still reaches the right package. The
 * one role with no v1 equivalent is `worker`, and it maps to a directory that does not exist there
 * rather than to a plausible one: a command aimed at a package this tree does not have must fail
 * where it is issued. Answering `common` instead — which is what the missing entries used to do —
 * runs it somewhere real and wrong.
 *
 * Totality is what a topology cannot give on its own (it maps only the roles its packages hold),
 * so an unmapped role falls back to its own name here, which is that same visible failure.
 */
const roleDirsOfTopology = (layout: TargetLayout): Record<SubProject, string> => {
  const topology = resolveTopology(topologyOf(layout))

  return Object.values(SubProject).reduce<Record<SubProject, string>>((dirs, role) => {
    dirs[role] = packageForRole(topology, role)?.name ?? role

    return dirs
  }, {} as Record<SubProject, string>)
}

export const ROLE_DIRS: Record<TargetLayout, Record<SubProject, string>> = {
  [TargetLayout.V1]: roleDirsOfTopology(TargetLayout.V1),
  [TargetLayout.V2]: roleDirsOfTopology(TargetLayout.V2),
}

/**
 * The one marker per layout, chosen because it exists in that layout and in no other.
 *
 * `sources/api` cannot appear in a v1 tree and `packages/backend` cannot appear in a v2 one, so a
 * single `stat` settles it. Deliberately not `sources/` alone: v1 packages each have their own
 * `src`, and a directory name that differs by one letter is not something to hang a runtime path
 * resolution on. Ordered — the first marker found wins.
 */
export const LAYOUT_MARKERS: Array<[TargetLayout, string]> = [
  [TargetLayout.V2, 'sources/api'],
  [TargetLayout.V1, 'packages/backend'],
]

/**
 * Resolve a wire-level role to the directory it names in a given layout.
 *
 * An unknown value — a role from a sender newer than this reader — falls back to the role's own
 * name, which is the honest guess for a layout whose packages are named after their roles, and
 * which fails visibly rather than resolving to some other package's directory.
 */
export const subprojectDirOf = (layout: TargetLayout, role: SubProject): string =>
  ROLE_DIRS[layout][role] ?? role

/** Where every role lives, for a layout already decided. */
export const pathsOf = (layout: TargetLayout): TargetPaths => LAYOUTS[layout]
