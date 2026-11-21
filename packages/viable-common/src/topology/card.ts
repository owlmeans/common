import { STANDARD_AREAS } from '../areas/consts.js'
import { SubProject } from '../slot/consts.js'
import { yamlUtils } from '../utils/yaml.js'
import { appMapHelper } from './apps.js'
import { APP_NAME_PATTERN, TARGET_APP_MOUNT_PATTERN } from './apps/consts.js'
import { TOPOLOGY_VERSION } from './consts.js'
import { topologyHelper } from './resolve.js'
import type { TargetPackageDescriptor, TargetPackageKind, TopologyDescriptor, TopologyMeta } from './types.js'
import { KINDS, ROLES } from './consts.local.js'
import type { TopologyCardHelper } from './card/types.js'

export const createTopologyCardHelper = (): TopologyCardHelper => {
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
    const app = typeof raw.app === 'string' && APP_NAME_PATTERN.test(raw.app) ? raw.app : null
    const mount = typeof raw.mount === 'string' && TARGET_APP_MOUNT_PATTERN.test(raw.mount) ? raw.mount : null

    return {
      name,
      roles,
      kind,
      dependsOn: asStrings(raw.dependsOn),
      ...(areas.length > 0 ? { areas: areas as TargetPackageDescriptor['areas'] } : {}),
      ...(queues.length > 0 ? { queues } : {}),
      ...(app != null ? { app } : {}),
      ...(mount != null ? { mount } : {}),
    }
  }

  /**
   * The record's app map, only when it is whole: every entry narrows and the map passes every rule.
   * Anything less is NO apps — a consumer then serves `main` alone, the arrangement every project
   * had before apps existed — rather than a partly trusted list.
   */
  const parseApps = (raw: Record<string, unknown>): Pick<TopologyDescriptor, 'areas' | 'apps'> => {
    if (!Array.isArray(raw.apps)) return {}
    const map = appMapHelper.narrow(raw)
    if (map == null || map.apps.length !== raw.apps.length) return {}
    if (Array.isArray(raw.areas) && map.areas.length !== raw.areas.length) return {}
    if (appMapHelper.validate(map).length > 0) return {}

    return Array.isArray(raw.areas) ? { areas: map.areas, apps: map.apps } : { apps: map.apps }
  }

  const parseTopologyMeta = (data: unknown): TopologyDescriptor | null => {
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
      ...parseApps(raw),
    }
  }

  const frontmatterOf = (source: string): unknown => yamlUtils.frontmatterOf(source)

  const parseTopologyFile = (source: string): TopologyDescriptor | null => parseTopologyMeta(frontmatterOf(source))

  const topologyMeta = (topology: TopologyDescriptor): TopologyMeta => ({
    ...topology,
    packages: topologyHelper.orderPackages(topology.packages),
    version: TOPOLOGY_VERSION,
    updatedAt: new Date().toISOString(),
  })

  const renderTopologyCard = (topology: TopologyDescriptor): string => {
    const ordered = topologyHelper.orderPackages(topology.packages)
    const rows = ordered.map(pkg => {
      const deps = pkg.dependsOn.length > 0 ? pkg.dependsOn.join(', ') : '—'
      const extra = [
        ...(pkg.areas != null ? [`areas: ${pkg.areas.join(', ')}`] : []),
        ...(pkg.queues != null ? [`queues: ${pkg.queues.join(', ')}`] : []),
        ...(pkg.app != null ? [`app: ${pkg.app}`] : []),
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
      ...renderApps(topology),
    ].join('\n')
  }

  /** The apps table — only for a project split into apps; a one-app record renders as it always has. */
  const renderApps = (topology: TopologyDescriptor): string[] => {
    if (topology.apps == null || topology.apps.length < 2) return []
    const map = { areas: topology.areas ?? STANDARD_AREAS.map(area => ({ ...area })), apps: topology.apps }
    const rows = [...topology.apps].sort((a, b) => a.index - b.index).map(app => {
      const path = app.mount === '' ? '/' : `/${app.mount}`
      const areas = app.areas.map(key => `${key} (${appMapHelper.areaUrlOf(map, key)})`).join(', ')

      return `| ${app.name} | \`${path}\` | ${areas} | \`${topology.dir}/${app.web}\` | \`${topology.dir}/${app.api}\` |`
    })

    return [
      '## Apps',
      '',
      'One host, one path per app: each app is a web + api pair under its own path (`<path>` and',
      '`<path>/api`), over the shared packages above. An area belongs to exactly one app.',
      '',
      '| App | Path | Areas (URL) | Web | Api |',
      '|---|---|---|---|---|',
      ...rows,
      '',
    ]
  }

  return { parseTopologyMeta, frontmatterOf, parseTopologyFile, topologyMeta, renderTopologyCard }
}

export const topologyCardHelper = createTopologyCardHelper()

/** @deprecated compat:factory-refactor — use `topologyCardHelper.parseTopologyMeta(…)` */
export const parseTopologyMeta = (data: unknown): TopologyDescriptor | null => topologyCardHelper.parseTopologyMeta(data)

/** @deprecated compat:factory-refactor — use `topologyCardHelper.topologyMeta(…)` */
export const topologyMeta = (topology: TopologyDescriptor): TopologyMeta => topologyCardHelper.topologyMeta(topology)

/** @deprecated compat:factory-refactor — use `topologyCardHelper.renderTopologyCard(…)` */
export const renderTopologyCard = (topology: TopologyDescriptor): string => topologyCardHelper.renderTopologyCard(topology)
