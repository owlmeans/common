import { describe, expect, test } from 'bun:test'
import * as barrel from '../src/index.js'
import { ProjectArea, STANDARD_AREAS } from '../src/areas/consts.js'
import type { AreaDescriptor } from '../src/areas/types.js'
import { SubProject } from '../src/slot/consts.js'
import { appMapHelper } from '../src/topology/apps.js'
import { topologyCardHelper } from '../src/topology/card.js'
import { DEFAULT_TOPOLOGY } from '../src/topology/consts.js'
import { topologyHelper } from '../src/topology/resolve.js'
import { projectStructureHelper as structureHelper } from '../src/topology/structure.js'
import {
  STRUCTURE_KIND_PURPOSES, STRUCTURE_STOCK_PURPOSES, STRUCTURE_STOCK_WORKER_QUEUES, StructureIssueCode as Code,
  StructurePartKind as Kind,
} from '../src/topology/structure/consts.js'
import type { ProjectStructure, StructurePart } from '../src/topology/structure/types.js'
import type { AppMap } from '../src/topology/apps/types.js'
import type { TopologyDescriptor } from '../src/topology/types.js'

/**
 * A project's STRUCTURE is the larger view of what its app map already says: the stock `common`,
 * `backend`, `main` and `worker` plus any library, shared library, app, api, web or worker added. The
 * structure a project gets by default must be EXACTLY today's split (so nothing a project records or a
 * slot builds changes for it), and every rule the editor and the model are held to has a code.
 */
const at = '2026-11-24T10:00:00.000Z'
const ALL = [ProjectArea.User, ProjectArea.Admin, ProjectArea.Operator]

/** What the library's `applyStackApps` puts in `stack.topology` for a map — today's record. */
const appsTopology = (map: AppMap): TopologyDescriptor => {
  if (appMapHelper.isLegacy(map)) return DEFAULT_TOPOLOGY
  const extra = appMapHelper.packagesOf(map)
  const names = new Set(extra.map(pkg => pkg.name))

  return {
    ...DEFAULT_TOPOLOGY,
    packages: [...DEFAULT_TOPOLOGY.packages.filter(pkg => !names.has(pkg.name)), ...extra],
    areas: map.areas.map(area => ({ ...area })),
    apps: map.apps.map(app => ({ ...app, areas: [...app.areas] })),
  }
}

const part = (patch: Partial<StructurePart> & Pick<StructurePart, 'name' | 'kind'>): StructurePart => ({
  dependsOn: [], purpose: `The ${patch.name} part.`, ...patch,
})

const partner: AreaDescriptor = { key: 'partner', kind: ProjectArea.User, segment: 'partner' }

/** Every kind once: a library, a shared library, an api, a web calling main, an extra worker. */
const custom = (): ProjectStructure => {
  const base = structureHelper.defaultFor(ALL)

  return {
    areas: [...base.areas, partner],
    parts: [
      ...base.parts,
      part({ name: 'dates', kind: Kind.Library, dependsOn: ['common'] }),
      part({ name: 'billing', kind: Kind.Shared, dependsOn: ['common', 'dates'] }),
      part({ name: 'hooks', kind: Kind.Api, dependsOn: ['common', 'backend', 'billing'], mount: 'hooks' }),
      part({ name: 'portal', kind: Kind.Web, dependsOn: ['common', 'dates', 'main'], mount: 'portal', areas: ['partner'] }),
      part({ name: 'mailer', kind: Kind.Worker, dependsOn: ['common', 'backend'], queues: ['mail'] }),
    ],
  }
}

const codes = (structure: ProjectStructure, opts?: Parameters<typeof structureHelper.validate>[1]): Code[] =>
  structureHelper.validate(structure, opts).map(issue => issue.code)

const replacePart = (structure: ProjectStructure, name: string, patch: Partial<StructurePart>): ProjectStructure => ({
  ...structure, parts: structure.parts.map(p => p.name === name ? { ...p, ...patch } : p),
})

describe('viable-common - projectStructureHelper: the default is today\'s split', () => {
  test('defaultFor = the app map\'s default split as pairs over the stock parts, with default purposes', () => {
    const structure = structureHelper.defaultFor(ALL)
    expect(structure.parts.map(p => [p.name, p.kind])).toEqual([
      ['common', Kind.Common], ['backend', Kind.Shared], ['main', Kind.Pair], ['admin', Kind.Pair],
      ['backoffice', Kind.Pair], ['worker', Kind.Worker],
    ])
    expect(structure.parts.find(p => p.name === 'worker')?.queues).toBeUndefined()
    expect(structure.parts.find(p => p.name === 'common')?.purpose).toBe(STRUCTURE_STOCK_PURPOSES.common)
    expect(structure.parts.find(p => p.name === 'admin')?.purpose).toBe(STRUCTURE_KIND_PURPOSES[Kind.Pair])
    expect(structureHelper.appMapOf(structure)).toEqual(appMapHelper.defaultFor(ALL))
    expect(appMapHelper.validate(structureHelper.appMapOf(structure))).toEqual([])
    expect(structureHelper.validate(structure)).toEqual([])
    expect(structureHelper.isDerived(structure)).toBe(true)
  })

  test('the case\'s coverage areas decide the split; split: false keeps one main', () => {
    const bot = structureHelper.defaultFor([ProjectArea.User])
    expect(structureHelper.appMapOf(bot)).toEqual(appMapHelper.defaultFor([ProjectArea.User]))
    expect(bot.areas.map(area => area.key)).toEqual(['guest', 'user'])
    expect(bot.parts.filter(p => p.kind === Kind.Pair).map(p => p.name)).toEqual(['main'])

    const one = structureHelper.defaultFor(ALL, { split: false })
    expect(structureHelper.appMapOf(one)).toEqual(appMapHelper.legacy())
    expect(structureHelper.validate(one)).toEqual([])
    for (const areas of [[], [ProjectArea.User], [ProjectArea.User, ProjectArea.Admin], ALL]) {
      expect(appMapHelper.validate(structureHelper.appMapOf(structureHelper.defaultFor(areas)))).toEqual([])
      expect(structureHelper.validate(structureHelper.defaultFor(areas))).toEqual([])
    }
  })

  test('fromApps / fromCard / fromTopology read every record a project has', () => {
    const legacy = structureHelper.fromApps(appMapHelper.legacy())
    expect(structureHelper.fromCard(undefined)).toEqual(legacy)
    expect(structureHelper.fromCard({})).toEqual(legacy)
    expect(structureHelper.fromCard({ apps: { ...appMapHelper.defaultFor(ALL), by: 'default', at } } as never))
      .toEqual(structureHelper.defaultFor(ALL))
    const recorded = structureHelper.decisionFieldsOf(custom(), 'person', at).structure!
    expect(structureHelper.fromCard({ structure: recorded, apps: structureHelper.decisionFieldsOf(custom(), 'person', at).apps }))
      .toEqual(structureHelper.normalize(custom()))

    expect(structureHelper.fromTopology(null)).toEqual(legacy)
    expect(structureHelper.fromTopology(DEFAULT_TOPOLOGY)).toEqual(legacy)
    expect(structureHelper.fromTopology(appsTopology(appMapHelper.defaultFor(ALL)))).toEqual(structureHelper.defaultFor(ALL))
    // A recorded structure reads back with the purposes its packages carry, a default one elsewhere.
    const topology = structureHelper.topologyOf(custom(), DEFAULT_TOPOLOGY)
    const read = structureHelper.fromTopology(topology)
    expect(structureHelper.refOf(read)).toEqual(structureHelper.refOf(structureHelper.normalize(custom())))
    expect(read.parts.find(p => p.name === 'dates')?.purpose).toBe('The dates part.')
    // An invalid recorded structure falls back to the apps.
    const broken = { ...topology, structure: { ...topology.structure!, parts: topology.structure!.parts.filter(p => p.name !== 'common') } }
    expect(structureHelper.fromTopology(broken)).toEqual(structureHelper.defaultFor(ALL))
  })
})

describe('viable-common - projectStructureHelper.isDerived', () => {
  const base = structureHelper.defaultFor(ALL)

  test('the default split and the legacy one are derived — in any part order, edges in any order', () => {
    expect(structureHelper.isDerived(structureHelper.fromApps(appMapHelper.legacy()))).toBe(true)
    expect(structureHelper.isDerived({ ...base, parts: [...base.parts].reverse() })).toBe(true)
    expect(structureHelper.isDerived(replacePart(base, 'main', { dependsOn: ['backend', 'common'] }))).toBe(true)
    // A default purpose with stray spaces is still the default.
    expect(structureHelper.isDerived(replacePart(base, 'admin', { purpose: ` ${STRUCTURE_KIND_PURPOSES[Kind.Pair]} ` }))).toBe(true)
    // Absent indices are the ones normalize assigns, and the stock worker's explicit queue is its implicit one.
    expect(structureHelper.isDerived({ ...base, parts: base.parts.map(p => p.name === 'admin' || p.name === 'backoffice' ? { ...p, index: undefined } : p) }))
      .toBe(true)
    expect(structureHelper.isDerived(replacePart(base, 'worker', { queues: [...STRUCTURE_STOCK_WORKER_QUEUES] }))).toBe(true)
    // A ref compares keys only.
    expect(structureHelper.isDerived(structureHelper.refOf(base))).toBe(true)
  })

  test('a person\'s purpose, a new kind of part, an area off the pairs or a moved edge is not derived', () => {
    expect(structureHelper.isDerived(replacePart(base, 'main', { purpose: 'The storefront.' }))).toBe(false)
    expect(structureHelper.isDerived(custom())).toBe(false)
    expect(structureHelper.isDerived(structureHelper.refOf(custom()))).toBe(false)
    expect(structureHelper.isDerived({ ...base, parts: [...base.parts, part({ name: 'dates', kind: Kind.Library, purpose: STRUCTURE_KIND_PURPOSES[Kind.Library] })] }))
      .toBe(false)
    expect(structureHelper.isDerived(replacePart(base, 'main', { dependsOn: ['common', 'backend', 'admin'] }))).toBe(false)
    expect(structureHelper.isDerived(replacePart(base, 'worker', { queues: ['mail'] }))).toBe(false)
    expect(structureHelper.isDerived(null as never)).toBe(false)
  })
})

describe('viable-common - projectStructureHelper.topologyOf', () => {
  test('a derived structure gives exactly the app map\'s topology, and the card renders as it did', () => {
    for (const areas of [[], ALL, [ProjectArea.User, ProjectArea.Admin]]) {
      const structure = structureHelper.defaultFor(areas)
      const topology = structureHelper.topologyOf(structure, DEFAULT_TOPOLOGY)
      const expected = appsTopology(appMapHelper.defaultFor(areas))
      expect(topology).toEqual(expected)
      expect(topology.structure).toBeUndefined()
      expect(topology.packages.some(pkg => pkg.part != null)).toBe(false)
      expect(topologyCardHelper.renderTopologyCard(topology)).toBe(topologyCardHelper.renderTopologyCard(expected))
    }
    expect(structureHelper.topologyOf(structureHelper.fromApps(appMapHelper.legacy()), DEFAULT_TOPOLOGY)).toEqual(DEFAULT_TOPOLOGY)
  })

  test('any other structure gives every part its packages, edges and tags, libraries built first', () => {
    const topology = structureHelper.topologyOf(custom(), DEFAULT_TOPOLOGY)
    const byName = new Map(topology.packages.map(pkg => [pkg.name, pkg]))
    expect([...byName.keys()]).toEqual([
      'common', 'backend', 'api', 'web', 'worker', 'dates', 'billing', 'admin-api', 'admin-web', 'backoffice-api',
      'backoffice-web', 'hooks-api', 'portal-web', 'mailer-worker',
    ])
    expect(byName.get('dates')).toEqual({
      name: 'dates', roles: [SubProject.Common], kind: 'library', dependsOn: ['common'], part: 'dates', partKind: Kind.Library,
      purpose: 'The dates part.',
    })
    expect(byName.get('billing')).toMatchObject({ roles: [SubProject.Backend], kind: 'library', dependsOn: ['common', 'dates'] })
    expect(byName.get('hooks-api')).toMatchObject({
      roles: [SubProject.Api], kind: 'bundle', dependsOn: ['common', 'backend', 'billing'], app: 'hooks', mount: 'hooks', partKind: Kind.Api,
    })
    // A web compiles against its libraries only: the api it calls is no package edge.
    expect(byName.get('portal-web')).toMatchObject({
      roles: [SubProject.Web, SubProject.Frontend], kind: 'bundle', dependsOn: ['common', 'dates'], app: 'portal', mount: 'portal',
    })
    expect(byName.get('mailer-worker')).toMatchObject({ roles: [SubProject.Worker], kind: 'bundle', queues: ['mail'] })
    expect(byName.get('api')).toMatchObject({ dependsOn: ['common', 'backend'], part: 'main', partKind: Kind.Pair })
    expect(byName.get('web')).toMatchObject({ dependsOn: ['common'], part: 'main' })
    // The pairs stay the app map — main, admin and backoffice — and the structure rides beside them.
    expect(topology.apps?.map(app => app.name)).toEqual(['main', 'admin', 'backoffice'])
    expect(appMapHelper.fromTopology(topology).map(app => app.name)).toEqual(['main', 'admin', 'backoffice'])
    expect(topology.structure).toEqual(structureHelper.refOf(structureHelper.normalize(custom())))

    const build = topologyHelper.resolveTopology(topology).build
    expect(build.indexOf('dates')).toBeLessThan(build.indexOf('billing'))
    expect(build.indexOf('billing')).toBeLessThan(build.indexOf('hooks-api'))
    expect(build.indexOf('dates')).toBeLessThan(build.indexOf('portal-web'))
    expect(topologyHelper.resolveTopology(topology).libraries).toEqual(['common', 'backend', 'dates', 'billing'])
    expect(structureHelper.librariesOf(custom()).map(p => p.name)).toEqual(['common', 'backend', 'dates', 'billing'])
  })

  test('the topology card keeps the structure and the part tags through a write and a read', () => {
    const topology = structureHelper.topologyOf(custom(), DEFAULT_TOPOLOGY)
    const meta = topologyCardHelper.topologyMeta(topology)
    // What the platform's writer stores is plain data; the frontmatter reader's subset is `card-apps.spec`'s.
    const parsed = topologyCardHelper.parseTopologyMeta(JSON.parse(JSON.stringify(meta)))!
    expect(parsed.structure).toEqual(topology.structure)
    expect(parsed.packages.find(pkg => pkg.name === 'dates')).toMatchObject({ part: 'dates', partKind: Kind.Library, purpose: 'The dates part.' })
    expect(topologyHelper.sameTopology(parsed, meta)).toBe(true)
    const card = topologyCardHelper.renderTopologyCard(meta)
    expect(card).toContain('## Structure')
    expect(card).toContain('| portal | web | `sources/portal-web` | common, dates, main | partner | The portal part. |')
    expect(card).toContain('part: dates')
    // A structure that breaks a rule is dropped whole; the packages stay.
    const broken = topologyCardHelper.parseTopologyMeta({ ...meta, structure: { ...meta.structure, parts: meta.structure!.parts.slice(1) } })!
    expect(broken.structure).toBeUndefined()
    expect(broken.packages.length).toBe(meta.packages.length)
    expect(topologyHelper.sameTopology(broken, meta)).toBe(false)
  })
})

describe('viable-common - projectStructureHelper.validate', () => {
  const base = structureHelper.defaultFor(ALL)

  test('every kind once is valid; disabled kinds are refused beyond the stock parts', () => {
    expect(structureHelper.validate(custom())).toEqual([])
    expect(codes(base, { kinds: [Kind.Pair] })).toEqual([])
    const refused = structureHelper.validate(custom(), { kinds: [Kind.Pair] })
    expect(refused.filter(issue => issue.code === Code.KindDisabled).map(issue => issue.part)).toEqual(['dates', 'billing', 'hooks', 'portal', 'mailer'])
    expect(refused.every(issue => issue.message.endsWith('.'))).toBe(true)
  })

  test('the stock parts are fixed', () => {
    expect(codes({ ...base, parts: base.parts.filter(p => p.name !== 'worker') })).toEqual([Code.StockMissing])
    expect(codes(replacePart(base, 'backend', { kind: Kind.Library }))).toContain(Code.StockShape)
    expect(codes(replacePart(base, 'main', { mount: 'home' }))).toContain(Code.StockShape)
    expect(codes(replacePart(base, 'main', { index: 3 }))).toContain(Code.StockShape)
    expect(codes(replacePart(base, 'common', { dependsOn: ['backend'] }))).toContain(Code.StockShape)
    expect(codes(replacePart(base, 'worker', { index: 2 }))).toEqual([Code.StockShape])
    expect(codes({ ...base, parts: [...base.parts, part({ name: 'types', kind: Kind.Common })] })).toEqual([Code.KindReserved])
  })

  test('names, kinds and purposes', () => {
    expect(codes({ ...base, parts: [...base.parts, part({ name: 'Dates', kind: Kind.Library })] })).toEqual([Code.PartName])
    expect(codes({ ...base, parts: [...base.parts, part({ name: 'api', kind: Kind.Library })] })).toEqual([Code.PartNameReserved])
    expect(codes({ ...base, parts: [...base.parts, part({ name: 'admin', kind: Kind.Library })] })).toEqual([Code.PartDuplicate])
    expect(codes({ ...base, parts: [...base.parts, part({ name: 'dates', kind: 'module' as Kind })] })).toEqual([Code.PartKind])
    expect(codes(replacePart(base, 'admin', { purpose: '' }))).toEqual([Code.Purpose])
    expect(codes(replacePart(base, 'admin', { purpose: ' padded ' }))).toEqual([Code.Purpose])
    expect(codes(replacePart(base, 'admin', { purpose: 'x'.repeat(401) }))).toEqual([Code.Purpose])
    expect(codes(replacePart(base, 'admin', { purpose: undefined as never }))).toEqual([Code.Purpose])
    // A ref has no purposes to check.
    expect(structureHelper.validateRef(structureHelper.refOf(base))).toEqual([])
    expect(codes(null as never)).toEqual([Code.Shape])
    expect(codes({ ...base, parts: [...base.parts, 'x' as never] })).toEqual([Code.Shape])
  })

  test('mounts and indices: one segment each, unique, outside the reserved ones; one index space for the apps', () => {
    expect(codes(replacePart(base, 'admin', { mount: '' }))).toContain(Code.Mount)
    expect(codes(replacePart(base, 'admin', { mount: 'a/b' }))).toContain(Code.Mount)
    expect(codes(replacePart(base, 'admin', { mount: 'oidc' }))).toEqual([Code.MountReserved])
    expect(codes(replacePart(base, 'admin', { mount: 'backoffice' }))).toEqual([Code.MountDuplicate])
    expect(codes(replacePart(base, 'backend', { mount: 'x' }))).toEqual([Code.MountNotAllowed])
    expect(codes(replacePart(base, 'admin', { index: 10 }))).toEqual([Code.Index])
    expect(codes(replacePart(base, 'admin', { index: 1.5 }))).toEqual([Code.Index])
    expect(codes(replacePart(base, 'admin', { index: 2 }))).toEqual([Code.IndexDuplicate])
    // An api shares the apps' index space; a worker has its own.
    const api = { ...base, parts: [...base.parts, part({ name: 'hooks', kind: Kind.Api, dependsOn: ['common', 'backend'], mount: 'hooks', index: 2 })] }
    expect(codes(api)).toEqual([Code.IndexDuplicate])
    const worker = { ...base, parts: [...base.parts, part({ name: 'mailer', kind: Kind.Worker, dependsOn: ['common', 'backend'], index: 1 })] }
    expect(codes(worker)).toEqual([])
    expect(codes(replacePart(base, 'backend', { index: 1 }))).toEqual([Code.IndexNotAllowed])
    // An editor's payload may leave an app's index out.
    expect(codes(replacePart(base, 'admin', { index: undefined }))).toEqual([])
  })

  test('areas: one web each, the guest area main\'s home, keys known, segments well-formed', () => {
    expect(codes(replacePart(base, 'admin', { areas: ['operator'] }))).toEqual([Code.AreaTwoWebs, Code.AreaNoWeb])
    expect(codes(replacePart(base, 'admin', { areas: ['admin', 'nowhere'] }))).toEqual([Code.AreaUnknown])
    expect(codes(replacePart(base, 'admin', { areas: [] }))).toEqual([Code.AreasMissing, Code.AreaNoWeb])
    expect(codes(replacePart(base, 'main', { areas: ['user', 'guest'] }))).toEqual([Code.AreaNeedsSegment, Code.GuestWeb])
    expect(codes(replacePart(base, 'admin', { areas: ['admin', 'guest'] }))).toContain(Code.GuestWeb)
    expect(codes(replacePart(base, 'backend', { areas: ['admin'] }))).toEqual([Code.AreasNotAllowed])
    expect(codes(replacePart(base, 'main', { queues: ['jobs'] }))).toEqual([Code.QueuesNotAllowed])
    expect(codes({ ...base, areas: base.areas.filter(area => area.key !== 'guest') }).slice(0, 2)).toEqual([Code.GuestMissing, Code.AreaUnknown])
    expect(codes({ ...base, areas: [...base.areas, { key: 'Bad Key', kind: ProjectArea.User, segment: 'bad' }] })).toEqual([Code.AreaKey])
    expect(codes({ ...base, areas: [...base.areas, { ...STANDARD_AREAS[1] }] })).toEqual([Code.AreaDuplicate])
    expect(codes({ ...base, areas: base.areas.map(a => a.key === 'admin' ? { ...a, kind: ProjectArea.User } : a) })).toEqual([Code.AreaKind])
    const custom2 = (area: AreaDescriptor): ProjectStructure => ({
      areas: [...base.areas, area],
      parts: base.parts.map(p => p.name === 'main' ? { ...p, areas: [...p.areas!, area.key] } : p),
    })
    expect(codes(custom2({ key: 'reports', kind: ProjectArea.User, segment: 'Reports' }))).toEqual([Code.AreaSegment])
    // `/admin` is the admin app's mount too, so main's area there would be shadowed as well.
    expect(codes(custom2({ key: 'reports', kind: ProjectArea.User, segment: 'admin' }))).toEqual([Code.AreaSegmentDuplicate, Code.AreaShadowed])
    expect(codes(custom2({ key: 'reports', kind: ProjectArea.User, segment: 'frontoffice' })))
      .toEqual([Code.AreaSegmentDuplicate, Code.AreaSegmentReserved])
    expect(codes(custom2({ key: 'reports', kind: ProjectArea.User, segment: 'terms' }))).toEqual([Code.AreaSegmentReserved])
    expect(codes(custom2({ key: 'reports', kind: ProjectArea.User, segment: 'reports', label: ' ' }))).toEqual([Code.AreaLabel])
    expect(codes(custom2({ key: 'reports', kind: ProjectArea.User, segment: 'reports', marker: 'project--x' }))).toEqual([Code.AreaMarker])
    expect(codes(custom2({ key: 'reports', kind: ProjectArea.User, segment: 'admin2' }))).toEqual([])
    // main's area under another app's mount is shadowed.
    expect(codes(custom2({ key: 'reports', kind: ProjectArea.User, segment: 'hooks' }))).toEqual([])
    const shadowed = custom2({ key: 'reports', kind: ProjectArea.User, segment: 'hooks' })
    shadowed.parts.push(part({ name: 'hooks', kind: Kind.Api, dependsOn: ['common', 'backend'], mount: 'hooks' }))
    expect(codes(shadowed)).toEqual([Code.AreaShadowed])
    expect(codes({ ...base, areas: Array.from({ length: 17 }, (_, i) => ({ key: `a${i}`, kind: ProjectArea.User, segment: `a${i}` })) }))
      .toContain(Code.TooManyAreas)
  })

  test('edges: by kind, the required ones, one callee per web, one web per api, no cycle', () => {
    const with_ = (...parts: StructurePart[]): ProjectStructure => ({ areas: [...base.areas, partner], parts: [...base.parts, ...parts] })
    const portal = (dependsOn: string[]) => part({ name: 'portal', kind: Kind.Web, dependsOn, mount: 'portal', areas: ['partner'] })
    expect(codes(with_(portal(['common', 'main'])))).toEqual([])
    expect(codes(with_(portal(['common'])))).toEqual([Code.CallsMissing])
    expect(codes(with_(portal(['common', 'main', 'admin'])))).toEqual([Code.CallsMany])
    expect(codes(with_(portal(['common', 'backend', 'main'])))).toEqual([Code.EdgeKind])
    expect(codes(with_(portal(['main'])))).toEqual([Code.EdgeRequired])
    expect(codes(with_(portal(['common', 'main', 'main'])))).toEqual([Code.EdgeDuplicate])
    expect(codes(with_(portal(['common', 'main', 'portal'])))).toEqual([Code.EdgeSelf])
    expect(codes(with_(portal(['common', 'main', 'ghost'])))).toEqual([Code.EdgeUnknown])
    const hooks = part({ name: 'hooks', kind: Kind.Api, dependsOn: ['common', 'backend'], mount: 'hooks' })
    const second = { ...portal(['common', 'hooks']), name: 'partners', mount: 'partners', areas: ['extra'] }
    const twoWebs: ProjectStructure = {
      areas: [...base.areas, partner, { key: 'extra', kind: ProjectArea.User, segment: 'extra' }],
      parts: [...base.parts, hooks, portal(['common', 'hooks']), second],
    }
    expect(codes(twoWebs)).toEqual([Code.ApiCallers])
    expect(codes(replacePart(base, 'admin', { dependsOn: ['common'] }))).toEqual([Code.EdgeRequired])
    expect(codes(replacePart(base, 'admin', { dependsOn: ['common', 'backend', 'worker'] }))).toEqual([Code.EdgeKind])
    const libraries = (...parts: StructurePart[]): ProjectStructure => ({ ...base, parts: [...base.parts, ...parts] })
    expect(codes(libraries(part({ name: 'dates', kind: Kind.Library, dependsOn: ['backend'] })))).toEqual([Code.EdgeKind])
    expect(codes(libraries(
      part({ name: 'dates', kind: Kind.Library, dependsOn: ['money'] }),
      part({ name: 'money', kind: Kind.Library, dependsOn: ['dates'] }),
    ))).toEqual([Code.Cycle, Code.Cycle])
  })

  test('counts: at most 9 apps beside main, 9 workers beside the stock one, 24 parts; queues well-formed', () => {
    const apps = Array.from({ length: 10 }, (_, i) => part({ name: `app${i}`, kind: Kind.Api, dependsOn: ['common', 'backend'], mount: `app${i}` }))
    expect(codes({ ...structureHelper.defaultFor([]), parts: [...structureHelper.defaultFor([]).parts, ...apps] })).toEqual([Code.TooManyApps])
    const workers = Array.from({ length: 10 }, (_, i) => part({ name: `job${i}`, kind: Kind.Worker, dependsOn: ['common', 'backend'] }))
    expect(codes({ ...base, parts: [...base.parts, ...workers] })).toEqual([Code.TooManyWorkers])
    const libraries = Array.from({ length: 19 }, (_, i) => part({ name: `lib${i}`, kind: Kind.Library }))
    expect(codes({ ...base, parts: [...base.parts, ...libraries] })).toEqual([Code.TooManyParts])
    expect(codes(replacePart(base, 'worker', { queues: ['Mail'] }))).toEqual([Code.Queue])
    expect(codes(replacePart(base, 'worker', { queues: ['mail', 'mail'] }))).toEqual([Code.Queue])
    expect(codes(replacePart(base, 'worker', { queues: ['mail:send', 'reports-weekly'] }))).toEqual([])
  })
})

describe('viable-common - projectStructureHelper: settling, addressing and the card', () => {
  test('normalize assigns indices deterministically, never one taken, and adds the required edges', () => {
    const payload = custom()
    payload.parts = payload.parts.map(p => ({ ...p, index: p.name === 'main' ? undefined : p.index, mount: p.name === 'main' ? undefined : p.mount }))
    payload.parts = payload.parts.map(p => p.name === 'hooks' ? { ...p, dependsOn: ['billing'] } : p)
    const settled = structureHelper.normalize(payload, { taken: { apps: [3, 4] } })
    const indexOf = (name: string) => settled.parts.find(p => p.name === name)?.index
    expect([indexOf('main'), indexOf('admin'), indexOf('backoffice'), indexOf('hooks'), indexOf('portal')]).toEqual([0, 1, 2, 5, 6])
    expect(indexOf('worker')).toBe(0)
    expect(indexOf('mailer')).toBe(1)
    expect(settled.parts.find(p => p.name === 'main')?.mount).toBe('')
    expect(settled.parts.find(p => p.name === 'hooks')?.dependsOn).toEqual(['billing', 'common', 'backend'])
    expect(structureHelper.normalize(settled, { taken: { apps: [3, 4] } })).toEqual(settled)
    expect(structureHelper.validate(settled)).toEqual([])
    // The person's order of parts is kept; the input is not mutated.
    expect(settled.parts.map(p => p.name)).toEqual(payload.parts.map(p => p.name))
    expect(payload.parts.find(p => p.name === 'hooks')?.index).toBeUndefined()
  })

  test('apps, workers, edges and the area\'s web and api', () => {
    const structure = custom()
    expect(structureHelper.appsOf(structure).map(app => [app.name, app.kind, app.index, app.sides.web, app.sides.api, app.calls ?? null]))
      .toEqual([
        ['main', Kind.Pair, 0, 'web', 'api', null], ['admin', Kind.Pair, 1, 'admin-web', 'admin-api', null],
        ['backoffice', Kind.Pair, 2, 'backoffice-web', 'backoffice-api', null], ['hooks', Kind.Api, 3, null, 'hooks-api', null],
        ['portal', Kind.Web, 4, 'portal-web', null, 'main'],
      ])
    expect(structureHelper.workersOf(structure)).toEqual([
      { name: 'worker', package: 'worker', index: 0, queues: ['jobs'], stock: true },
      { name: 'mailer', package: 'mailer-worker', index: 1, queues: ['mail'], stock: false },
    ])
    expect(structureHelper.edgesOf(structure, 'portal')).toEqual({ packages: ['common', 'dates'], calls: 'main' })
    expect(structureHelper.edgesOf(structure, 'hooks')).toEqual({ packages: ['common', 'backend', 'billing'], calls: null })
    expect(structureHelper.edgesOf(structure, 'ghost')).toEqual({ packages: [], calls: null })
    expect(structureHelper.webOf(structure, 'partner')?.name).toBe('portal')
    expect(structureHelper.apiOf(structure, 'partner')?.name).toBe('main')
    expect(structureHelper.webOf(structure, 'admin')?.name).toBe('admin')
    expect(structureHelper.apiOf(structure, 'admin')?.name).toBe('admin')
    expect(structureHelper.webOf(structure, 'nowhere')).toBeNull()
    expect(structureHelper.packagesOf({ name: 'main', kind: Kind.Pair })).toEqual(['api', 'web'])
    expect(structureHelper.packagesOf({ name: 'mailer', kind: Kind.Worker })).toEqual(['mailer-worker'])
    expect(structureHelper.defaultPurposeOf({ name: 'worker', kind: Kind.Worker })).toBe(STRUCTURE_STOCK_PURPOSES.worker)
    expect(structureHelper.defaultPurposeOf({ name: 'mailer', kind: Kind.Worker })).toBe(STRUCTURE_KIND_PURPOSES[Kind.Worker])
  })

  test('decisionFieldsOf: apps always (by mapped), structure only when not derived', () => {
    expect(structureHelper.decisionFieldsOf(structureHelper.defaultFor(ALL), 'default', at))
      .toEqual({ apps: { ...appMapHelper.defaultFor(ALL), by: 'default', at } })
    expect(structureHelper.decisionFieldsOf(structureHelper.defaultFor(ALL), 'model', at, 'Split the admin.').apps)
      .toMatchObject({ by: 'request', quote: 'Split the admin.' })
    const fields = structureHelper.decisionFieldsOf(custom(), 'person', at)
    expect(fields.apps.by).toBe('owner')
    expect(appMapHelper.validate(fields.apps)).toEqual([])
    expect(fields.structure).toMatchObject({ by: 'person', at })
    expect(fields.structure!.parts.find(p => p.name === 'hooks')?.index).toBe(3)
    expect(structureHelper.refOf(fields.structure!)).toEqual(structureHelper.refOf(structureHelper.normalize(custom())))
  })

  test('the barrel exports the helper and its vocabulary', () => {
    expect(barrel.projectStructureHelper).toBe(structureHelper)
    expect(barrel.StructurePartKind.Library).toBe(Kind.Library)
    expect(Object.values(barrel.StructurePartKind)).toEqual(['common', 'shared', 'library', 'pair', 'api', 'web', 'worker'])
    expect(barrel.StructureIssueCode.Cycle).toBe(Code.Cycle)
  })
})
