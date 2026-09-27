import { SubProject } from '../slot/consts.js'
import { TOPOLOGY_VERSION } from './consts.js'
import { orderPackages } from './helpers.js'
import type { TargetPackageDescriptor, TargetPackageKind, TopologyDescriptor } from './types.js'

/** What `.agents/memory/topology.md` carries in its frontmatter. */
export interface TopologyMeta extends TopologyDescriptor {
  version: number
  updatedAt: string
}

const ROLES = new Set<string>(Object.values(SubProject))
const KINDS = new Set<TargetPackageKind>(['library', 'bundle'])

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/**
 * Read a package descriptor out of whatever the file held.
 *
 * Everything is narrowed rather than trusted: the file is on the target's volume, where a person,
 * a GitHub pull or a previous platform version may have written it. A descriptor that cannot be
 * narrowed is DROPPED, never repaired — a package with no name or no recognisable role would
 * otherwise resolve a path somewhere real and wrong.
 */
const parsePackage = (value: unknown): TargetPackageDescriptor | null => {
  if (value == null || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name === '' || name.includes('/') || name.startsWith('.')) return null
  const roles = asStrings(raw.roles).filter((role): role is SubProject => ROLES.has(role))
  if (roles.length === 0) return null
  const kind = KINDS.has(raw.kind as TargetPackageKind) ? raw.kind as TargetPackageKind : 'bundle'
  const areas = asStrings(raw.areas)
  const queues = asStrings(raw.queues)

  return {
    name,
    roles,
    kind,
    dependsOn: asStrings(raw.dependsOn),
    ...(areas.length > 0 ? { areas: areas as TargetPackageDescriptor['areas'] } : {}),
    ...(queues.length > 0 ? { queues } : {}),
  }
}

/**
 * Narrow a parsed frontmatter block into a topology, or answer `null`.
 *
 * `null` means "use the layout default", and every caller treats it that way. A topology file
 * written by a platform version this one cannot read must not stop a project from building — the
 * arrangement it describes is almost certainly still the default one.
 */
export const parseTopologyMeta = (data: unknown): TopologyDescriptor | null => {
  if (data == null || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  if (typeof raw.dir !== 'string' || raw.dir.trim() === '') return null
  const packages = Array.isArray(raw.packages)
    ? raw.packages.map(parsePackage).filter((pkg): pkg is TargetPackageDescriptor => pkg != null)
    : []
  if (packages.length === 0) return null

  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : 'recorded',
    dir: raw.dir.trim(),
    packages,
  }
}

export const topologyMeta = (topology: TopologyDescriptor): TopologyMeta => ({
  ...topology,
  packages: orderPackages(topology.packages),
  version: TOPOLOGY_VERSION,
  updatedAt: new Date().toISOString(),
})

/**
 * The body of `.agents/memory/topology.md` — what a model reads, and what a person reads.
 *
 * Rendered from the descriptor rather than maintained beside it, for the same reason the layout
 * tables are: a card that disagrees with the frontmatter teaches the wrong tree.
 */
export const renderTopologyCard = (topology: TopologyDescriptor): string => {
  const ordered = orderPackages(topology.packages)
  const rows = ordered.map(pkg => {
    const deps = pkg.dependsOn.length > 0 ? pkg.dependsOn.join(', ') : '—'
    const extra = [
      ...(pkg.areas != null ? [`areas: ${pkg.areas.join(', ')}`] : []),
      ...(pkg.queues != null ? [`queues: ${pkg.queues.join(', ')}`] : []),
    ].join('; ')

    return `| \`${topology.dir}/${pkg.name}\` | ${pkg.roles.join(', ')} | ${pkg.kind} | ${deps} | ${extra === '' ? '—' : extra} |`
  })

  return [
    '# Topology',
    '',
    'Which packages this project has, what each one is, and which compile against which.',
    'Built in the order of the table — a `library` must be built before anything importing it.',
    '',
    '| Package | Roles | Kind | Depends on | Notes |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n')
}
