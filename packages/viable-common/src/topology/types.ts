import type { ProjectArea } from '../areas/consts.js'
import type { SubProject } from '../slot/consts.js'

/**
 * How a target's workspace packages are ARRANGED — which of them exist, what role each plays and
 * which compile against which.
 *
 * The layout tables this replaces ({@link LAYOUTS}, {@link ROLE_DIRS}) were two hand-written
 * records keyed by a closed `TargetLayout` enum, so "the target has five packages named
 * common/backend/api/web/worker" was not a fact ABOUT a project but a constant of the platform.
 * Everything the pipeline could ever generate had to fit those five names.
 *
 * A topology is that same information as DATA: a project carries one, the two shipped layouts are
 * just the two the platform writes by default, and the tables are derived from them rather than
 * spelled beside them. That is what lets a target grow a second web application, a library package
 * nobody planned, or the package a GitHub pull brought in.
 *
 * It is deliberately a DESCRIPTION and never a plan. Nothing here says a directory exists — a
 * caller that acts on a package still checks the disk, exactly as `workerPath` always has.
 */
export interface TargetPackageDescriptor {
  /**
   * The package's directory name under {@link TopologyDescriptor.dir}, and the tail of its npm
   * name (`<slug>-<name>`). Unique within a topology.
   */
  name: string
  /**
   * What this package IS, in the role vocabulary the wire already speaks.
   *
   * A list rather than a single value because one package may answer to more than one role in a
   * smaller arrangement — a target that serves its browser app from the same process that serves
   * its API is one package holding both `Api` and `Web`. The default topology gives every package
   * exactly one role.
   */
  roles: SubProject[]
  /**
   * `library` builds with `tsc -b` and is consumed through its `build/` output at RUN time;
   * `bundle` bundles itself and keeps every dependency external.
   *
   * The distinction is load-bearing rather than descriptive: a bundle resolves its libraries from
   * `node_modules` when the process starts, so a library that nothing built makes the bundle exit
   * with a message naming a missing dependency rather than a missing build.
   */
  kind: TargetPackageKind
  /** Sibling package NAMES this one compiles against. The build order is this graph, sorted. */
  dependsOn: string[]
  /**
   * For a package holding the `Web` role: which audiences it serves.
   *
   * Absent means all four. A topology that splits the areas across two browser applications is
   * the reason this exists; nothing generates one yet.
   */
  areas?: ProjectArea[]
  /** For a package holding the `Worker` role: which queues this process consumes. */
  queues?: string[]
}

export type TargetPackageKind = 'library' | 'bundle'

/**
 * One arrangement, named.
 *
 * `id` is what a project records; it is compared, never parsed.
 */
export interface TopologyDescriptor {
  id: string
  /** The directory holding the workspace packages — `sources`, or `packages` for a legacy tree. */
  dir: string
  packages: TargetPackageDescriptor[]
}

/**
 * A topology read back from a project, with the resolutions every consumer would otherwise redo.
 *
 * `build` and `libraries` are DERIVED — a topological sort of `dependsOn` — rather than declared,
 * because the two lists disagreeing with the graph is a whole class of outage (a library built
 * after the bundle that imports it) that nobody can see by reading either one.
 */
export interface ResolvedTopology extends TopologyDescriptor {
  /** Every package, in dependency order. */
  build: string[]
  /** The `library`-kind packages, in dependency order. */
  libraries: string[]
  /** Role → the packages holding it, in topology order. */
  byRole: Partial<Record<SubProject, TargetPackageDescriptor[]>>
}
