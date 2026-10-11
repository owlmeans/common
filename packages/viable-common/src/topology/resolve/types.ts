import type { ProjectArea } from '../../areas/consts.js'
import type { TargetLayout } from '../../integrity/consts.js'
import type { SubProject } from '../../slot/consts.js'
import type { ResolvedTopology, TargetPackageDescriptor, TopologyDescriptor } from '../types.js'

/** A target's package arrangement: build order, the role index, and where each package lives. */
export interface TopologyHelper {
  /**
   * Order the packages so that nothing is built before what it compiles against.
   *
   * Kahn's algorithm, with two deliberate tolerances. An edge to a package the topology does not
   * hold is DROPPED rather than fatal — a project may declare a dependency on something a pull has
   * not brought in yet, and refusing to order the tree would take the whole build down over one
   * name. A cycle leaves its members unvisited, and they are appended in declaration order: a cycle
   * cannot be built correctly in any order, so the useful behaviour is to build it in the order
   * somebody wrote rather than to throw.
   */
  orderPackages: (packages: TargetPackageDescriptor[]) => TargetPackageDescriptor[]
  /** Resolve the derived halves — build order, library order and the role index. */
  resolveTopology: (topology: TopologyDescriptor) => ResolvedTopology
  /** The default topology for a layout already decided. */
  topologyOf: (layout: TargetLayout) => TopologyDescriptor
  /**
   * The directory a role names, or `null` when this topology has no package for it.
   *
   * `null` rather than the role's own name: a command aimed at a package the tree does not have must
   * fail where it is issued. Answering with a plausible directory runs it somewhere real and wrong,
   * which is how a type check once ran against the shared package instead of the one under repair.
   */
  packageForRole: (topology: ResolvedTopology, role: SubProject) => TargetPackageDescriptor | null
  /** Every package holding a role — more than one only where a topology splits that role. */
  packagesForRole: (topology: ResolvedTopology, role: SubProject) => TargetPackageDescriptor[]
  /** The package serving an area, for a topology that splits the browser app across several. */
  packageForArea: (topology: ResolvedTopology, role: SubProject, area: ProjectArea) => TargetPackageDescriptor | null
  /** `<dir>/<package>` — the only place a topology directory is composed. */
  packageDir: (topology: TopologyDescriptor, pkg: TargetPackageDescriptor) => string
  /**
   * Merge a package into a topology, by name.
   *
   * This is the ADOPTION path: a package that arrived with a GitHub pull is classified once and
   * recorded here, so the next run addresses the tree that exists rather than re-deriving one that
   * does not. Replacing by name rather than appending keeps a re-classification idempotent.
   */
  withPackage: (topology: TopologyDescriptor, pkg: TargetPackageDescriptor) => TopologyDescriptor
  /** Whether two topologies describe the same arrangement — used to skip a needless rewrite. */
  sameTopology: (a: TopologyDescriptor, b: TopologyDescriptor) => boolean
}
