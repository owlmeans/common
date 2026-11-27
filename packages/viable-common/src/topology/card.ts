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
import { projectStructureHelper } from './structure.js'
import { STRUCTURE_PURPOSE_MAX, StructurePartKind } from './structure/consts.js'

export const createTopologyCardHelper = (): TopologyCardHelper => {
  const PART_KINDS = new Set<string>(Object.values(StructurePartKind))

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
    const part = typeof raw.part === 'string' && APP_NAME_PATTERN.test(raw.part) ? raw.part : null
    const partKind = typeof raw.partKind === 'string' && PART_KINDS.has(raw.partKind) ? raw.partKind as StructurePartKind : null
    const purpose = typeof raw.purpose === 'string' && raw.purpose.trim() !== '' && raw.purpose.length <= STRUCTURE_PURPOSE_MAX
      ? raw.purpose.trim()
      : null

    return {
      name,
      roles,
      kind,
      dependsOn: asStrings(raw.dependsOn),
      ...(areas.length > 0 ? { areas: areas as TargetPackageDescriptor['areas'] } : {}),
      ...(queues.length > 0 ? { queues } : {}),
      ...(app != null ? { app } : {}),
      ...(mount != null ? { mount } : {}),
      ...(part != null ? { part } : {}),
      ...(part != null && partKind != null ? { partKind } : {}),
      ...(part != null && purpose != null ? { purpose } : {}),
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

  /**
   * The record's structure, only when it is whole: every area and part narrows and the structure
   * passes every rule (purposes aside — those live on the packages). Anything less is NO structure:
   * the packages and the apps then say what the tree is, as they did before structures existed.
   */
  const parseStructure = (raw: Record<string, unknown>): Pick<TopologyDescriptor, 'structure'> => {
    if (raw.structure == null || typeof raw.structure !== 'object') return {}
    const source = raw.structure as Record<string, unknown>
    const structure = projectStructureHelper.narrow(source)
    if (structure == null || !Array.isArray(source.areas) || !Array.isArray(source.parts)) return {}
    if (structure.areas.length !== source.areas.length || structure.parts.length !== source.parts.length) return {}
    if (projectStructureHelper.validateRef(structure).length > 0) return {}

    return { structure: projectStructureHelper.refOf(structure) }
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
      ...parseStructure(raw),
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
        ...(pkg.part != null ? [`part: ${pkg.part}`] : []),
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
      ...renderStructure(topology),
    ].join('\n')
  }

  /** The parts table — only for a record carrying a structure; any other record renders as it always has. */
  const renderStructure = (topology: TopologyDescriptor): string[] => {
    if (topology.structure == null) return []
    const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ')
    const rows = topology.structure.parts.map(part => {
      const packages = projectStructureHelper.packagesOf(part).map(name => `\`${topology.dir}/${name}\``).join(', ')
      const deps = part.dependsOn.length > 0 ? part.dependsOn.join(', ') : '—'
      const areas = part.areas != null && part.areas.length > 0 ? part.areas.join(', ') : '—'
      const purpose = topology.packages.find(pkg => pkg.part === part.name && pkg.purpose != null)?.purpose ?? '—'

      return `| ${part.name} | ${part.kind} | ${packages} | ${deps} | ${areas} | ${cell(purpose)} |`
    })

    return [
      '## Structure',
      '',
      'The parts this project is made of, what each is for and which it depends on. A web part names',
      'the one api or pair it calls among its dependencies; that is the API its screens use.',
      '',
      '| Part | Kind | Packages | Depends on | Areas | Purpose |',
      '|---|---|---|---|---|---|',
      ...rows,
      '',
    ]
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
