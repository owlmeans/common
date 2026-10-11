import type { ProjectArea } from '../areas/consts.js'
import type { SubProject } from '../slot/consts.js'
import { topologyHelper } from './resolve.js'
import type { ResolvedTopology, TargetPackageDescriptor, TopologyDescriptor } from './types.js'

/** @deprecated compat:factory-refactor — use `topologyHelper.orderPackages(…)` */
export const orderPackages = (packages: TargetPackageDescriptor[]): TargetPackageDescriptor[] =>
  topologyHelper.orderPackages(packages)

/** @deprecated compat:factory-refactor — use `topologyHelper.resolveTopology(…)` */
export const resolveTopology = (topology: TopologyDescriptor): ResolvedTopology =>
  topologyHelper.resolveTopology(topology)

/** @deprecated compat:factory-refactor — use `topologyHelper.packageForRole(…)` */
export const packageForRole = (topology: ResolvedTopology, role: SubProject): TargetPackageDescriptor | null =>
  topologyHelper.packageForRole(topology, role)

/** @deprecated compat:factory-refactor — use `topologyHelper.packageForArea(…)` */
export const packageForArea = (
  topology: ResolvedTopology, role: SubProject, area: ProjectArea
): TargetPackageDescriptor | null => topologyHelper.packageForArea(topology, role, area)

/** @deprecated compat:factory-refactor — use `topologyHelper.packageDir(…)` */
export const packageDir = (topology: TopologyDescriptor, pkg: TargetPackageDescriptor): string =>
  topologyHelper.packageDir(topology, pkg)

/** @deprecated compat:factory-refactor — use `topologyHelper.withPackage(…)` */
export const withPackage = (topology: TopologyDescriptor, pkg: TargetPackageDescriptor): TopologyDescriptor =>
  topologyHelper.withPackage(topology, pkg)

/** @deprecated compat:factory-refactor — use `topologyHelper.sameTopology(…)` */
export const sameTopology = (a: TopologyDescriptor, b: TopologyDescriptor): boolean =>
  topologyHelper.sameTopology(a, b)
