import { TargetLayout } from '../integrity/consts.js'
import type { ProjectArea } from '../areas/consts.js'
import type { SubProject } from '../slot/consts.js'
import { LAYOUT_TOPOLOGIES, DEFAULT_TOPOLOGY } from './consts.js'
import type {
  ResolvedTopology, TargetPackageDescriptor, TopologyDescriptor,
} from './types.js'

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
export const orderPackages = (packages: TargetPackageDescriptor[]): TargetPackageDescriptor[] => {
  const known = new Set(packages.map(pkg => pkg.name))
  const index = new Map(packages.map((pkg, at) => [pkg.name, at]))
  const pending = new Map(packages.map(pkg => [
    pkg.name, pkg.dependsOn.filter(dep => known.has(dep) && dep !== pkg.name).length,
  ]))
  const dependents = new Map<string, string[]>()
  for (const pkg of packages) {
    for (const dep of pkg.dependsOn) {
      if (!known.has(dep) || dep === pkg.name) continue
      dependents.set(dep, [...dependents.get(dep) ?? [], pkg.name])
    }
  }

  const byName = new Map(packages.map(pkg => [pkg.name, pkg]))
  const out: TargetPackageDescriptor[] = []
  // Ready packages are taken in DECLARATION order, not in the order they became ready. Both are
  // correct builds; only one is the same list every time and the same list a person wrote, and
  // this order is compared against the shipped layout tables by a test.
  const ready = packages.filter(pkg => pending.get(pkg.name) === 0).map(pkg => pkg.name)
  const take = (): string | undefined => {
    if (ready.length === 0) return undefined
    let at = 0
    for (let i = 1; i < ready.length; i++) {
      if ((index.get(ready[i]) ?? 0) < (index.get(ready[at]) ?? 0)) at = i
    }

    return ready.splice(at, 1)[0]
  }

  for (let name = take(); name != null; name = take()) {
    const pkg = byName.get(name)
    if (pkg == null) continue
    out.push(pkg)
    for (const next of dependents.get(name) ?? []) {
      const left = (pending.get(next) ?? 0) - 1
      pending.set(next, left)
      if (left === 0) ready.push(next)
    }
  }

  const seen = new Set(out.map(pkg => pkg.name))

  return [...out, ...packages.filter(pkg => !seen.has(pkg.name))]
}

/** Resolve the derived halves — build order, library order and the role index. */
export const resolveTopology = (topology: TopologyDescriptor): ResolvedTopology => {
  const ordered = orderPackages(topology.packages)
  const byRole: Partial<Record<SubProject, TargetPackageDescriptor[]>> = {}
  for (const pkg of ordered) {
    for (const role of pkg.roles) {
      byRole[role] = [...byRole[role] ?? [], pkg]
    }
  }

  return {
    ...topology,
    packages: ordered,
    build: ordered.map(pkg => pkg.name),
    libraries: ordered.filter(pkg => pkg.kind === 'library').map(pkg => pkg.name),
    byRole,
  }
}

/** The default topology for a layout already decided. */
export const topologyOf = (layout: TargetLayout): TopologyDescriptor =>
  LAYOUT_TOPOLOGIES[layout] ?? DEFAULT_TOPOLOGY

/**
 * The directory a role names, or `null` when this topology has no package for it.
 *
 * `null` rather than the role's own name: a command aimed at a package the tree does not have must
 * fail where it is issued. Answering with a plausible directory runs it somewhere real and wrong,
 * which is how a type check once ran against the shared package instead of the one under repair.
 */
export const packageForRole = (
  topology: ResolvedTopology, role: SubProject
): TargetPackageDescriptor | null => topology.byRole[role]?.[0] ?? null

/** Every package holding a role — more than one only where a topology splits that role. */
export const packagesForRole = (
  topology: ResolvedTopology, role: SubProject
): TargetPackageDescriptor[] => topology.byRole[role] ?? []

/** The package serving an area, for a topology that splits the browser app across several. */
export const packageForArea = (
  topology: ResolvedTopology, role: SubProject, area: ProjectArea
): TargetPackageDescriptor | null => {
  const candidates = packagesForRole(topology, role)
  return candidates.find(pkg => pkg.areas?.includes(area) === true)
    ?? candidates.find(pkg => pkg.areas == null)
    ?? candidates[0]
    ?? null
}

/** `<dir>/<package>` — the only place a topology directory is composed. */
export const packageDir = (topology: TopologyDescriptor, pkg: TargetPackageDescriptor): string =>
  `${topology.dir}/${pkg.name}`

/**
 * Merge a package into a topology, by name.
 *
 * This is the ADOPTION path: a package that arrived with a GitHub pull is classified once and
 * recorded here, so the next run addresses the tree that exists rather than re-deriving one that
 * does not. Replacing by name rather than appending keeps a re-classification idempotent.
 */
export const withPackage = (
  topology: TopologyDescriptor, pkg: TargetPackageDescriptor
): TopologyDescriptor => ({
  ...topology,
  packages: topology.packages.some(known => known.name === pkg.name)
    ? topology.packages.map(known => known.name === pkg.name ? pkg : known)
    : [...topology.packages, pkg],
})

/** Whether two topologies describe the same arrangement — used to skip a needless rewrite. */
export const sameTopology = (a: TopologyDescriptor, b: TopologyDescriptor): boolean =>
  JSON.stringify(orderPackages(a.packages)) === JSON.stringify(orderPackages(b.packages))
    && a.dir === b.dir
