import {
  AREA_KEY_MAX, AREA_KEY_PATTERN, AREA_LABEL_MAX, AREA_SEGMENT_PATTERN, ProjectArea, STANDARD_AREAS,
} from '../areas/consts.js'
import type { AreaDescriptor, AreaKey } from '../areas/types.js'
import { SubProject } from '../slot/consts.js'
import { appMapHelper } from './apps.js'
import {
  APP_API_SUFFIX, APP_NAME_PATTERN, APP_WEB_SUFFIX, MAIN_APP_API, MAIN_APP_WEB, RESERVED_MOUNTS, TARGET_APP_MOUNT_PATTERN,
} from './apps/consts.js'
import type { AppDescriptor, AppMap, ViableAppsDecision } from './apps/types.js'
import { topologyHelper } from './resolve.js'
import type { TargetPackageDescriptor, TopologyDescriptor } from './types.js'
import {
  STRUCTURE_APPS_BY, STRUCTURE_APPS_MAX, STRUCTURE_AREA_KINDS, STRUCTURE_AREAS_MAX, STRUCTURE_CALLABLE_KINDS,
  STRUCTURE_CHANGE_LIST_SEPARATOR, STRUCTURE_CHANGE_OPS, STRUCTURE_COMMON_PART, STRUCTURE_EDGE_RULES, STRUCTURE_INDEX_MAX, STRUCTURE_KIND_PURPOSES, STRUCTURE_LIBRARY_KINDS,
  STRUCTURE_MAIN_PART, STRUCTURE_MOUNTED_KINDS, STRUCTURE_PARTS_MAX, STRUCTURE_PURPOSE_MAX, STRUCTURE_PURPOSE_PATTERN,
  STRUCTURE_QUEUE_MAX, STRUCTURE_QUEUE_PATTERN, STRUCTURE_QUEUES_MAX, STRUCTURE_REQUIRED_EDGES, STRUCTURE_RESERVED_NAMES,
  STRUCTURE_SHARED_PART, STRUCTURE_STOCK_PARTS, STRUCTURE_STOCK_PURPOSES, STRUCTURE_STOCK_WORKER_QUEUES,
  STRUCTURE_WORKER_PART, STRUCTURE_WORKER_SUFFIX, STRUCTURE_WORKERS_MAX, StructureIssueCode, StructurePartKind,
} from './structure/consts.js'
import type {
  ProjectStructure, ProjectStructureHelper, StructureApp, StructureAppKind, StructureChange, StructureChangeOp, StructureIssue,
  StructureIssueParam, StructurePart, StructurePartKeys, StructureRef, StructureValidateOptions, StructureWorker,
  ViableStructureDecision,
} from './structure/types.js'
import type { StructurePartRead } from './structure/types.local.js'

export const createProjectStructureHelper = (): ProjectStructureHelper => {
  const KINDS = new Set<string>(Object.values(StructurePartKind))
  const AREA_KINDS = new Set<string>(Object.values(ProjectArea))
  const STANDARD_SEGMENTS = new Map<string, string>(STANDARD_AREAS.map(area => [area.key, area.segment]))

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value != null && typeof value === 'object' && !Array.isArray(value)

  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

  const unique = <T>(items: readonly T[]): T[] => [...new Set(items)]

  const copyArea = (area: AreaDescriptor): AreaDescriptor => ({ ...area })

  const isKind = (part: StructurePartKeys, kinds: readonly StructurePartKind[]): boolean => kinds.includes(part.kind)

  const isStock = (part: Pick<StructurePartKeys, 'name' | 'kind'>): boolean =>
    Object.hasOwn(STRUCTURE_STOCK_PARTS, part.name) && STRUCTURE_STOCK_PARTS[part.name] === part.kind

  const isMain = (part: Pick<StructurePartKeys, 'name' | 'kind'>): boolean =>
    part.name === STRUCTURE_MAIN_PART && part.kind === StructurePartKind.Pair

  const isStockWorker = (part: Pick<StructurePartKeys, 'name' | 'kind'>): boolean =>
    part.name === STRUCTURE_WORKER_PART && part.kind === StructurePartKind.Worker

  const isMounted = (part: StructurePartKeys): boolean => isKind(part, STRUCTURE_MOUNTED_KINDS)

  const isExtraWorker = (part: StructurePartKeys): boolean => part.kind === StructurePartKind.Worker && !isStockWorker(part)

  const byIndex = <T extends { index?: number }>(parts: readonly T[]): T[] =>
    [...parts].sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER))

  const defaultPurposeOf: ProjectStructureHelper['defaultPurposeOf'] = part =>
    isStock(part) ? STRUCTURE_STOCK_PURPOSES[part.name] : STRUCTURE_KIND_PURPOSES[part.kind] ?? ''

  const packagesOf: ProjectStructureHelper['packagesOf'] = part => {
    switch (part.kind) {
      case StructurePartKind.Common:
      case StructurePartKind.Library:
      case StructurePartKind.Shared:
        return [part.name]
      case StructurePartKind.Pair:
        return isMain(part) ? [MAIN_APP_API, MAIN_APP_WEB] : [`${part.name}${APP_API_SUFFIX}`, `${part.name}${APP_WEB_SUFFIX}`]
      case StructurePartKind.Api:
        return [`${part.name}${APP_API_SUFFIX}`]
      case StructurePartKind.Web:
        return [`${part.name}${APP_WEB_SUFFIX}`]
      case StructurePartKind.Worker:
        return isStockWorker(part) ? [STRUCTURE_WORKER_PART] : [`${part.name}${STRUCTURE_WORKER_SUFFIX}`]
      default:
        return []
    }
  }

  /** A worker's queues, an absent list resolved. */
  const queuesOf = (part: StructurePartKeys): string[] => {
    if (part.kind !== StructurePartKind.Worker) return []
    if (part.queues != null && part.queues.length > 0) return [...part.queues]

    return isStockWorker(part) ? [...STRUCTURE_STOCK_WORKER_QUEUES] : [part.name]
  }

  const keysOf = (part: StructurePartRead): StructurePartKeys => ({
    name: part.name,
    kind: part.kind,
    dependsOn: [...part.dependsOn],
    ...(part.mount != null ? { mount: part.mount } : {}),
    ...(part.index != null ? { index: part.index } : {}),
    ...(part.areas != null ? { areas: [...part.areas] } : {}),
    ...(part.queues != null ? { queues: [...part.queues] } : {}),
  })

  const copyPart = (part: StructurePartRead): StructurePartRead => ({
    ...keysOf(part),
    ...(typeof part.purpose === 'string' ? { purpose: part.purpose } : {}),
  })

  // ---- reading ----

  const narrowPart = (value: unknown): StructurePartRead | null => {
    if (!isRecord(value)) return null
    const { name, kind, dependsOn, mount, index, areas, queues, purpose } = value
    if (typeof name !== 'string' || typeof kind !== 'string' || !KINDS.has(kind)) return null

    return {
      name,
      kind: kind as StructurePartKind,
      dependsOn: strings(dependsOn),
      ...(typeof mount === 'string' ? { mount } : {}),
      ...(typeof index === 'number' && Number.isFinite(index) ? { index } : {}),
      ...(Array.isArray(areas) ? { areas: strings(areas) } : {}),
      ...(Array.isArray(queues) ? { queues: strings(queues) } : {}),
      ...(typeof purpose === 'string' ? { purpose } : {}),
    }
  }

  const narrow: ProjectStructureHelper['narrow'] = data => {
    if (!isRecord(data) || !Array.isArray(data.areas) || !Array.isArray(data.parts)) return null
    const areas = appMapHelper.narrow({ areas: data.areas, apps: [] })?.areas ?? []
    const parts = data.parts.map(narrowPart).filter((part): part is StructurePartRead => part != null)

    return { areas, parts }
  }

  // ---- settling ----

  /** One above the highest used, else the lowest free 1..9; `null` when all are used. */
  const nextFree = (used: Set<number>): number | null => {
    const top = Math.max(0, ...[...used].filter(index => Number.isInteger(index)))
    if (top < STRUCTURE_INDEX_MAX) return top + 1
    for (let index = 1; index <= STRUCTURE_INDEX_MAX; index++) {
      if (!used.has(index)) return index
    }

    return null
  }

  const assignIndices = (members: StructurePartRead[], taken: readonly number[]): void => {
    const used = new Set<number>([...taken, ...members.map(part => part.index).filter((index): index is number => index != null)])
    for (const part of members) {
      if (part.index != null) continue
      const next = nextFree(used)
      if (next == null) return
      part.index = next
      used.add(next)
    }
  }

  const settlePart = (part: StructurePartRead): StructurePartRead => {
    if (!isRecord(part)) return part
    const settled = copyPart(part)
    if (Array.isArray(part.dependsOn)) {
      const required = KINDS.has(part.kind) ? STRUCTURE_REQUIRED_EDGES[part.kind].filter(name => name !== part.name) : []
      settled.dependsOn = unique([...part.dependsOn, ...required.filter(name => !part.dependsOn.includes(name))])
    }
    if (settled.areas != null) settled.areas = unique(settled.areas)
    if (settled.queues != null) settled.queues = unique(settled.queues)
    if (typeof settled.purpose === 'string') settled.purpose = settled.purpose.trim()
    if (isMain(settled)) {
      settled.mount ??= ''
      settled.index ??= 0
    }
    if (isStockWorker(settled)) settled.index ??= 0

    return settled
  }

  const normalize: ProjectStructureHelper['normalize'] = (structure, opts) => {
    if (!isRecord(structure) || !Array.isArray(structure.parts) || !Array.isArray(structure.areas)) return structure
    const parts = (structure.parts as StructurePartRead[]).map(settlePart)
    const valid = parts.filter(part => isRecord(part))
    assignIndices(valid.filter(part => isMounted(part) && !isMain(part)), opts?.taken?.apps ?? [])
    assignIndices(valid.filter(isExtraWorker), opts?.taken?.workers ?? [])

    return { ...structure, areas: structure.areas.map(area => isRecord(area) ? copyArea(area) : area), parts } as typeof structure
  }

  const refOf: ProjectStructureHelper['refOf'] = structure => ({
    areas: structure.areas.map(copyArea),
    parts: structure.parts.map(keysOf),
  })

  // ---- the app map ----

  const appOf = (part: StructurePartKeys): AppDescriptor => {
    const main = isMain(part)

    return {
      name: part.name,
      mount: main ? '' : part.mount ?? '',
      areas: [...part.areas ?? []],
      web: main ? MAIN_APP_WEB : `${part.name}${APP_WEB_SUFFIX}`,
      api: main ? MAIN_APP_API : `${part.name}${APP_API_SUFFIX}`,
      index: main ? 0 : part.index ?? 0,
    }
  }

  const appMapOf: ProjectStructureHelper['appMapOf'] = structure => {
    const settled = normalize(structure)
    const pairs = byIndex(settled.parts.filter(part => part.kind === StructurePartKind.Pair))
    const served = new Set(pairs.flatMap(part => part.areas ?? []))

    return {
      areas: settled.areas.filter(area => served.has(area.key)).map(copyArea),
      apps: pairs.map(appOf),
    }
  }

  const stockPart = (name: string, kind: StructurePartKind, dependsOn: string[]): StructurePart =>
    ({ name, kind, dependsOn, purpose: defaultPurposeOf({ name, kind }) })

  const fromApps: ProjectStructureHelper['fromApps'] = map => ({
    areas: map.areas.map(copyArea),
    parts: [
      stockPart(STRUCTURE_COMMON_PART, StructurePartKind.Common, []),
      stockPart(STRUCTURE_SHARED_PART, StructurePartKind.Shared, [STRUCTURE_COMMON_PART]),
      ...[...map.apps].sort((a, b) => a.index - b.index).map((app): StructurePart => ({
        name: app.name,
        kind: StructurePartKind.Pair,
        dependsOn: [STRUCTURE_COMMON_PART, STRUCTURE_SHARED_PART],
        mount: app.mount,
        index: app.index,
        areas: [...app.areas],
        purpose: defaultPurposeOf({ name: app.name, kind: StructurePartKind.Pair }),
      })),
      stockPart(STRUCTURE_WORKER_PART, StructurePartKind.Worker, [STRUCTURE_COMMON_PART, STRUCTURE_SHARED_PART]),
    ],
  })

  /** One `main` over guest and the standard areas given. */
  const oneApp = (areas: AreaKey[]): AppMap => {
    const given = new Set<string>(areas)
    const covered = STANDARD_AREAS.filter(area => area.key === ProjectArea.Guest || given.has(area.key))

    return {
      areas: covered.map(copyArea),
      apps: [{ name: STRUCTURE_MAIN_PART, mount: '', areas: covered.map(area => area.key), web: MAIN_APP_WEB, api: MAIN_APP_API, index: 0 }],
    }
  }

  const defaultFor: ProjectStructureHelper['defaultFor'] = (areas, opts) =>
    fromApps(opts?.split === false ? oneApp(areas) : appMapHelper.defaultFor(areas))

  /** Parts with a purpose each — a default one where none was written. */
  const withPurposes = (ref: StructureRef, purposeOf: (part: StructurePartRead) => string | undefined): ProjectStructure => ({
    areas: ref.areas.map(copyArea),
    parts: (ref.parts as StructurePartRead[]).map(part => ({ ...keysOf(part), purpose: purposeOf(part) ?? defaultPurposeOf(part) })),
  })

  const fromMap = (areas: AreaDescriptor[] | undefined, apps: AppDescriptor[] | undefined | null): ProjectStructure => {
    if (apps == null || apps.length === 0) return fromApps(appMapHelper.legacy())
    const map: AppMap = { areas: areas ?? STANDARD_AREAS.map(copyArea), apps }

    return fromApps(appMapHelper.validate(map).length > 0 ? appMapHelper.legacy() : map)
  }

  const fromCard: ProjectStructureHelper['fromCard'] = fields => {
    const recorded = fields?.structure != null ? narrow(fields.structure) : null
    if (recorded != null && recorded.parts.length > 0) {
      return withPurposes(recorded, part => typeof part.purpose === 'string' ? part.purpose : undefined)
    }

    return fromApps(appMapHelper.of({ apps: fields?.apps ?? null }))
  }

  const fromTopology: ProjectStructureHelper['fromTopology'] = meta => {
    const recorded = meta?.structure != null ? narrow(meta.structure) : null
    if (recorded != null && recorded.parts.length > 0 && validateRef(recorded).length === 0) {
      return withPurposes(recorded, part => meta?.packages.find(pkg => pkg.part === part.name && pkg.purpose != null)?.purpose)
    }

    return fromMap(meta?.areas, meta?.apps)
  }

  // ---- comparing ----

  const sorted = (items: readonly string[]): string[] => [...items].sort()

  const sameKeys = (a: StructurePartKeys, b: StructurePartKeys): boolean =>
    a.kind === b.kind
    && (a.mount ?? null) === (b.mount ?? null)
    && (a.index ?? null) === (b.index ?? null)
    && JSON.stringify(a.areas ?? []) === JSON.stringify(b.areas ?? [])
    && JSON.stringify(sorted(a.dependsOn)) === JSON.stringify(sorted(b.dependsOn))
    && JSON.stringify(sorted(queuesOf(a))) === JSON.stringify(sorted(queuesOf(b)))

  const isDerived: ProjectStructureHelper['isDerived'] = structure => {
    const read = narrow(structure)
    if (read == null) return false
    const settled = normalize(read)
    const derived = normalize(fromApps(appMapOf(settled)))
    if (JSON.stringify(settled.areas) !== JSON.stringify(derived.areas)) return false
    if (settled.parts.length !== derived.parts.length) return false
    const byName = new Map((settled.parts as StructurePartRead[]).map(part => [part.name, part]))
    if (byName.size !== settled.parts.length) return false

    return derived.parts.every(expected => {
      const part = byName.get(expected.name)

      return part != null && sameKeys(part, expected) && (part.purpose == null || part.purpose === defaultPurposeOf(part))
    })
  }

  // ---- addressing ----

  const partsOf = (structure: StructureRef): Map<string, StructurePartKeys> =>
    new Map(structure.parts.map(part => [part.name, part]))

  const calleeOf = (part: StructurePartKeys, parts: Map<string, StructurePartKeys>): string | null =>
    part.kind !== StructurePartKind.Web
      ? null
      : part.dependsOn.find(dep => { const target = parts.get(dep); return target != null && isKind(target, STRUCTURE_CALLABLE_KINDS) }) ?? null

  /** The library packages a part compiles against — `dependsOn` entries naming common, library or shared parts. */
  const libraryDepsOf = (part: StructurePartKeys, parts: Map<string, StructurePartKeys>, kinds = STRUCTURE_LIBRARY_KINDS): string[] =>
    part.dependsOn.filter(dep => { const target = parts.get(dep); return target != null && isKind(target, kinds) })

  const edgesOf: ProjectStructureHelper['edgesOf'] = (structure, name) => {
    const parts = partsOf(structure)
    const part = parts.get(name)
    if (part == null) return { packages: [], calls: null }

    return { packages: libraryDepsOf(part, parts), calls: calleeOf(part, parts) }
  }

  const webOf: ProjectStructureHelper['webOf'] = (structure, area) =>
    structure.parts.find(part => isKind(part, STRUCTURE_AREA_KINDS) && (part.areas ?? []).includes(area)) ?? null

  const apiOf: ProjectStructureHelper['apiOf'] = (structure, area) => {
    const web = webOf(structure, area)
    if (web == null || web.kind === StructurePartKind.Pair) return web
    const parts = partsOf(structure)
    const callee = calleeOf(web, parts)

    return callee != null ? parts.get(callee) ?? null : null
  }

  const appsOf: ProjectStructureHelper['appsOf'] = structure => {
    const settled = normalize(structure)
    const parts = partsOf(settled)

    return byIndex(settled.parts.filter(isMounted)).map((part): StructureApp => {
      const app = appOf(part)
      const callee = calleeOf(part, parts)

      return {
        name: part.name,
        kind: part.kind as StructureAppKind,
        mount: app.mount,
        index: app.index,
        areas: part.kind === StructurePartKind.Api ? [] : app.areas,
        sides: {
          web: part.kind === StructurePartKind.Api ? null : app.web,
          api: part.kind === StructurePartKind.Web ? null : app.api,
        },
        ...(callee != null ? { calls: callee } : {}),
      }
    })
  }

  const workersOf: ProjectStructureHelper['workersOf'] = structure =>
    byIndex(normalize(structure).parts.filter(part => part.kind === StructurePartKind.Worker)).map((part): StructureWorker => ({
      name: part.name,
      package: packagesOf(part)[0],
      index: part.index ?? 0,
      queues: queuesOf(part),
      stock: isStockWorker(part),
    }))

  const librariesOf: ProjectStructureHelper['librariesOf'] = structure => {
    const parts = partsOf(structure)
    const libraries = structure.parts.filter(part => isKind(part, STRUCTURE_LIBRARY_KINDS))
    const order = topologyHelper.orderPackages(libraries.map((part): TargetPackageDescriptor => ({
      name: part.name, roles: [], kind: 'library', dependsOn: libraryDepsOf(part, parts),
    })))

    return order.map(pkg => keysOf(parts.get(pkg.name)!))
  }

  // ---- the topology ----

  /** The base without anything a structure or an app map decides. */
  const bare = (base: TopologyDescriptor): TopologyDescriptor => ({
    id: base.id,
    dir: base.dir,
    packages: base.packages.map(pkg => ({ ...pkg, roles: [...pkg.roles], dependsOn: [...pkg.dependsOn] })),
  })

  const topologyOf: ProjectStructureHelper['topologyOf'] = (structure, base) => {
    const settled = normalize(structure)
    const map = appMapOf(settled)
    const legacy = appMapHelper.isLegacy(map)
    const plain = bare(base)
    const pairs = legacy ? {} : { areas: map.areas, apps: map.apps }

    if (isDerived(settled)) {
      if (legacy) return plain
      const extra = appMapHelper.packagesOf(map)
      const names = new Set(extra.map(pkg => pkg.name))

      return { ...plain, packages: [...plain.packages.filter(pkg => !names.has(pkg.name)), ...extra], ...pairs }
    }

    const parts = partsOf(settled)
    const basePackage = (name: string, fallback: Omit<TargetPackageDescriptor, 'dependsOn'>): TargetPackageDescriptor => {
      const found = plain.packages.find(pkg => pkg.name === name)

      return found != null ? { ...found } : { ...fallback, dependsOn: [] }
    }

    const packagesFor = (part: StructurePartRead): TargetPackageDescriptor[] => {
      const tag = {
        part: part.name,
        partKind: part.kind,
        ...(typeof part.purpose === 'string' && part.purpose !== '' ? { purpose: part.purpose } : {}),
      }
      const deps = libraryDepsOf(part, parts)
      const webDeps = libraryDepsOf(part, parts, STRUCTURE_EDGE_RULES[StructurePartKind.Web])
      const at = { app: part.name, mount: part.mount ?? '' }
      const api = (name: string): TargetPackageDescriptor => ({ name, roles: [SubProject.Api], kind: 'bundle', dependsOn: deps })
      const web = (name: string): TargetPackageDescriptor =>
        ({ name, roles: [SubProject.Web, SubProject.Frontend], kind: 'bundle', dependsOn: webDeps })

      switch (part.kind) {
        case StructurePartKind.Common:
          return [{ ...basePackage(part.name, { name: part.name, roles: [SubProject.Common], kind: 'library' }), dependsOn: [], ...tag }]
        case StructurePartKind.Library:
          return [{ name: part.name, roles: [SubProject.Common], kind: 'library', dependsOn: deps, ...tag }]
        case StructurePartKind.Shared:
          return isStock(part)
            ? [{ ...basePackage(part.name, { name: part.name, roles: [SubProject.Backend], kind: 'library' }), dependsOn: deps, ...tag }]
            : [{ name: part.name, roles: [SubProject.Backend], kind: 'library', dependsOn: deps, ...tag }]
        case StructurePartKind.Pair:
          return isMain(part)
            ? [
              { ...basePackage(MAIN_APP_API, api(MAIN_APP_API)), dependsOn: deps, ...tag },
              { ...basePackage(MAIN_APP_WEB, web(MAIN_APP_WEB)), dependsOn: webDeps, ...tag },
            ]
            : [
              { ...api(`${part.name}${APP_API_SUFFIX}`), ...at, ...tag },
              { ...web(`${part.name}${APP_WEB_SUFFIX}`), ...at, ...tag },
            ]
        case StructurePartKind.Api:
          return [{ ...api(`${part.name}${APP_API_SUFFIX}`), ...at, ...tag }]
        case StructurePartKind.Web:
          return [{ ...web(`${part.name}${APP_WEB_SUFFIX}`), ...at, ...tag }]
        case StructurePartKind.Worker:
          return isStockWorker(part)
            ? [{
              ...basePackage(STRUCTURE_WORKER_PART, { name: STRUCTURE_WORKER_PART, roles: [SubProject.Worker], kind: 'bundle' }),
              dependsOn: deps,
              ...(part.queues != null && part.queues.length > 0 ? { queues: [...part.queues] } : {}),
              ...tag,
            }]
            : [{
              name: `${part.name}${STRUCTURE_WORKER_SUFFIX}`, roles: [SubProject.Worker], kind: 'bundle', dependsOn: deps,
              queues: queuesOf(part), ...tag,
            }]
        default:
          return []
      }
    }

    const rank = (part: StructurePartKeys): number => {
      if (part.kind === StructurePartKind.Common) return 0
      if (part.kind === StructurePartKind.Library) return 1
      if (part.kind === StructurePartKind.Shared) return isStock(part) ? 2 : 3
      if (isMounted(part)) return 4
      return isStockWorker(part) ? 5 : 6
    }
    const ordered = (settled.parts as StructurePartRead[])
      .map((part, at) => ({ part, at }))
      .sort((a, b) => rank(a.part) - rank(b.part)
        || (rank(a.part) >= 4 ? (a.part.index ?? 0) - (b.part.index ?? 0) : 0)
        || a.at - b.at)
      .map(({ part }) => part)
    const produced = ordered.flatMap(packagesFor)
    const byName = new Map(produced.map(pkg => [pkg.name, pkg]))
    const kept = new Set(plain.packages.map(pkg => pkg.name))

    return {
      ...plain,
      packages: [
        ...plain.packages.map(pkg => byName.get(pkg.name) ?? pkg),
        ...produced.filter(pkg => !kept.has(pkg.name)),
      ],
      ...pairs,
      structure: refOf(settled),
    }
  }

  // ---- the card ----

  const decisionFieldsOf: ProjectStructureHelper['decisionFieldsOf'] = (structure, by, at, quote) => {
    const settled = normalize(structure)
    const apps: ViableAppsDecision = { ...appMapOf(settled), by: STRUCTURE_APPS_BY[by], ...(quote != null ? { quote } : {}), at }
    if (isDerived(settled)) return { apps }
    const decision: ViableStructureDecision = {
      areas: settled.areas,
      parts: settled.parts,
      by,
      ...(quote != null ? { quote } : {}),
      at,
    }

    return { structure: decision, apps }
  }

  // ---- the diff ----

  const opRank = (op: StructureChangeOp): number => STRUCTURE_CHANGE_OPS.indexOf(op)

  /** A list value as a diff writes it; `undefined` for an empty list. */
  const listed = (items: readonly string[]): string | undefined =>
    items.length > 0 ? items.join(STRUCTURE_CHANGE_LIST_SEPARATOR) : undefined

  const purposeOf = (part: StructurePartRead): string | undefined =>
    typeof part.purpose === 'string' && part.purpose.trim() !== '' ? part.purpose.trim() : undefined

  /** One change, its absent values left out. */
  const change = (op: StructureChangeOp, part: string, from?: string, to?: string): StructureChange => ({
    op, part, ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}),
  })

  const diffPart = (before: StructurePartRead, after: StructurePartRead): StructureChange[] => {
    const name = after.name
    const changes: StructureChange[] = []
    if (before.kind !== after.kind) changes.push(change('kind', name, before.kind, after.kind))
    const was = purposeOf(before)
    const now = purposeOf(after)
    if (was !== undefined && now !== undefined && was !== now) changes.push(change('purpose', name, was, now))
    const areasBefore = listed(before.areas ?? [])
    const areasAfter = listed(after.areas ?? [])
    if (areasBefore !== areasAfter) changes.push(change('areas', name, areasBefore, areasAfter))
    if ((before.mount ?? null) !== (after.mount ?? null)) changes.push(change('mount', name, before.mount, after.mount))
    const dependsBefore = listed(sorted(unique(before.dependsOn)))
    const dependsAfter = listed(sorted(unique(after.dependsOn)))
    if (dependsBefore !== dependsAfter) changes.push(change('depends', name, dependsBefore, dependsAfter))
    const queuesBefore = listed(sorted(unique(queuesOf(before))))
    const queuesAfter = listed(sorted(unique(queuesOf(after))))
    if (queuesBefore !== queuesAfter) changes.push(change('queues', name, queuesBefore, queuesAfter))

    return changes
  }

  /** The parts of a side by name, the first of a repeated name kept. */
  const byNameOf = (structure: StructureRef): Map<string, StructurePartRead> => {
    const read = narrow(structure)
    const out = new Map<string, StructurePartRead>()
    for (const part of read != null ? normalize(read).parts as StructurePartRead[] : []) {
      if (!out.has(part.name)) out.set(part.name, part)
    }

    return out
  }

  const diff: ProjectStructureHelper['diff'] = (before, after) => {
    const was = byNameOf(before)
    const now = byNameOf(after)
    const changes: StructureChange[] = []
    for (const [name, part] of now) {
      const old = was.get(name)
      changes.push(...(old == null ? [change('add', name, undefined, part.kind)] : diffPart(old, part)))
    }
    for (const [name, part] of was) {
      if (!now.has(name)) changes.push(change('remove', name, part.kind))
    }

    return changes.sort((a, b) => (a.part < b.part ? -1 : a.part > b.part ? 1 : 0) || opRank(a.op) - opRank(b.op))
  }

  // ---- the rules ----

  const check = (structure: StructureRef, opts: StructureValidateOptions | undefined, purposes: boolean): StructureIssue[] => {
    const issues: StructureIssue[] = []
    const push = (code: StructureIssueCode, message: string, params?: Partial<Record<StructureIssueParam, string | number>>): void => {
      issues.push({
        code,
        ...(params?.part != null ? { part: String(params.part) } : {}),
        ...(params != null ? { params } : {}),
        message,
      })
    }
    if (!isRecord(structure) || !Array.isArray(structure.areas) || !Array.isArray(structure.parts)) {
      push(StructureIssueCode.Shape, 'The structure must list its areas and its parts.')

      return issues
    }

    // Areas.
    const areas = new Map<string, AreaDescriptor>()
    const segments = new Map<string, string>()
    if (structure.areas.length > STRUCTURE_AREAS_MAX) {
      push(StructureIssueCode.TooManyAreas, `A project has at most ${STRUCTURE_AREAS_MAX} areas.`, { max: STRUCTURE_AREAS_MAX })
    }
    for (const area of structure.areas) {
      if (!isRecord(area) || typeof area.key !== 'string' || !AREA_KEY_PATTERN.test(area.key) || area.key.length > AREA_KEY_MAX) {
        const key = isRecord(area) ? String(area.key) : String(area)
        push(StructureIssueCode.AreaKey,
          `Area key "${key}" must be lower-case words joined by single hyphens, at most ${AREA_KEY_MAX} characters.`, { area: key, max: AREA_KEY_MAX })
        continue
      }
      const key = area.key
      if (areas.has(key)) {
        push(StructureIssueCode.AreaDuplicate, `Area "${key}" is listed twice.`, { area: key })
        continue
      }
      areas.set(key, area)
      if (!AREA_KINDS.has(area.kind)) {
        push(StructureIssueCode.AreaKind, `Area "${key}" is of no known kind ("${String(area.kind)}").`, { area: key, kind: String(area.kind) })
      } else if (AREA_KINDS.has(key) && area.kind !== key) {
        push(StructureIssueCode.AreaKind, `Area "${key}" must be of the kind "${key}".`, { area: key, kind: String(area.kind) })
      }
      if (typeof area.segment !== 'string' || !AREA_SEGMENT_PATTERN.test(area.segment)) {
        push(StructureIssueCode.AreaSegment,
          `Area "${key}" has an ill-shaped segment "${String(area.segment)}" — one lower-case path segment, or ''.`, { area: key })
      } else if (area.segment !== '') {
        const holder = segments.get(area.segment)
        if (holder != null) {
          push(StructureIssueCode.AreaSegmentDuplicate, `Areas "${holder}" and "${key}" share the segment "${area.segment}".`,
            { area: key, other: holder, mount: area.segment })
        } else {
          segments.set(area.segment, key)
        }
        if (RESERVED_MOUNTS.includes(area.segment) && STANDARD_SEGMENTS.get(key) !== area.segment) {
          push(StructureIssueCode.AreaSegmentReserved, `Area "${key}" may not use the reserved segment "${area.segment}".`,
            { area: key, mount: area.segment })
        }
      }
      if (area.label != null && (typeof area.label !== 'string' || area.label.trim() === '' || area.label.length > AREA_LABEL_MAX)) {
        push(StructureIssueCode.AreaLabel, `Area "${key}" has a label that is empty or longer than ${AREA_LABEL_MAX} characters.`,
          { area: key, max: AREA_LABEL_MAX })
      }
      if (area.marker != null && area.marker !== appMapHelper.markerOf(key)) {
        push(StructureIssueCode.AreaMarker, `Area "${key}" may only carry the marker "${appMapHelper.markerOf(key)}".`, { area: key })
      } else if (area.marker != null && area.kind === ProjectArea.Guest) {
        push(StructureIssueCode.AreaMarker, `Area "${key}" is public (a guest area) — it carries no marker.`, { area: key })
      }
    }
    if (!areas.has(ProjectArea.Guest)) {
      push(StructureIssueCode.GuestMissing, 'The guest area is missing — it is what the bare host serves.', { area: ProjectArea.Guest })
    }

    // Parts, one by one.
    if (structure.parts.length > STRUCTURE_PARTS_MAX) {
      push(StructureIssueCode.TooManyParts, `A project has at most ${STRUCTURE_PARTS_MAX} parts.`, { max: STRUCTURE_PARTS_MAX })
    }
    const parts = new Map<string, StructurePartRead>()
    const mounts = new Map<string, string>()
    const appIndices = new Map<number, string>()
    const workerIndices = new Map<number, string>()
    for (const value of structure.parts as unknown[]) {
      if (!isRecord(value) || typeof value.name !== 'string' || !Array.isArray(value.dependsOn)) {
        push(StructureIssueCode.Shape, 'A part must be an object with a name, a kind and a dependsOn list.')
        continue
      }
      const part = value as unknown as StructurePartRead
      const name = part.name
      const label = `Part "${name}"`
      if (!APP_NAME_PATTERN.test(name)) {
        push(StructureIssueCode.PartName, `${label}: a name is 2–16 lower-case letters and digits, starting with a letter.`, { part: name })
      }
      if (parts.has(name)) {
        push(StructureIssueCode.PartDuplicate, `${label} is listed twice.`, { part: name })
        continue
      }
      if (!KINDS.has(part.kind)) {
        push(StructureIssueCode.PartKind, `${label} is of no known kind ("${String(part.kind)}").`, { part: name, kind: String(part.kind) })
        continue
      }
      parts.set(name, part)
      const kind = part.kind
      const stockKind = Object.hasOwn(STRUCTURE_STOCK_PARTS, name) ? STRUCTURE_STOCK_PARTS[name] : null
      if (stockKind != null && stockKind !== kind) {
        push(StructureIssueCode.StockShape, `${label} is a stock part of the kind "${stockKind}".`, { part: name, kind: stockKind })
      } else if (stockKind == null && STRUCTURE_RESERVED_NAMES.includes(name)) {
        push(StructureIssueCode.PartNameReserved, `${label}: the name is reserved.`, { part: name })
      }
      if (kind === StructurePartKind.Common && name !== STRUCTURE_COMMON_PART) {
        push(StructureIssueCode.KindReserved, `${label}: only the stock part "${STRUCTURE_COMMON_PART}" is of the kind common.`,
          { part: name, kind })
      }
      if (opts?.kinds != null && !isStock(part) && !opts.kinds.includes(kind)) {
        push(StructureIssueCode.KindDisabled, `${label}: parts of the kind "${kind}" are not available here.`, { part: name, kind })
      }
      if (purposes && (typeof part.purpose !== 'string' || part.purpose === '' || part.purpose.length > STRUCTURE_PURPOSE_MAX
        || !STRUCTURE_PURPOSE_PATTERN.test(part.purpose))) {
        push(StructureIssueCode.Purpose,
          `${label} needs a purpose — trimmed, 1 to ${STRUCTURE_PURPOSE_MAX} characters.`, { part: name, max: STRUCTURE_PURPOSE_MAX })
      }

      // Mount and index.
      if (isMounted(part)) {
        if (isMain(part)) {
          if ((part.mount ?? '') !== '' || (part.index ?? 0) !== 0) {
            push(StructureIssueCode.StockShape, `${label} is mounted at the host's root (mount '') with index 0.`, { part: name })
          }
        } else {
          if (typeof part.mount !== 'string' || part.mount === '' || !TARGET_APP_MOUNT_PATTERN.test(part.mount)) {
            push(StructureIssueCode.Mount, `${label}: the mount "${String(part.mount ?? '')}" is not one lower-case path segment.`,
              { part: name, mount: String(part.mount ?? '') })
          } else if (RESERVED_MOUNTS.includes(part.mount)) {
            push(StructureIssueCode.MountReserved, `${label}: the mount "/${part.mount}" is reserved.`, { part: name, mount: part.mount })
          } else {
            const holder = mounts.get(part.mount)
            if (holder != null) {
              push(StructureIssueCode.MountDuplicate, `Parts "${holder}" and "${name}" share the mount "/${part.mount}".`,
                { part: name, other: holder, mount: part.mount })
            } else {
              mounts.set(part.mount, name)
            }
          }
          if (part.index != null) {
            if (!Number.isInteger(part.index) || part.index < 1 || part.index > STRUCTURE_INDEX_MAX) {
              push(StructureIssueCode.Index, `${label}: the index ${String(part.index)} is outside 1..${STRUCTURE_INDEX_MAX}.`,
                { part: name, index: part.index, max: STRUCTURE_INDEX_MAX })
            } else {
              const holder = appIndices.get(part.index)
              if (holder != null) {
                push(StructureIssueCode.IndexDuplicate, `Parts "${holder}" and "${name}" share the index ${part.index}.`,
                  { part: name, other: holder, index: part.index })
              } else {
                appIndices.set(part.index, name)
              }
            }
          }
        }
      } else if (part.mount != null) {
        push(StructureIssueCode.MountNotAllowed, `${label}: a part of the kind "${kind}" has no mount.`, { part: name, kind })
      }
      if (kind === StructurePartKind.Worker) {
        if (isStockWorker(part)) {
          if ((part.index ?? 0) !== 0) push(StructureIssueCode.StockShape, `${label} holds the worker index 0.`, { part: name })
        } else if (part.index != null) {
          if (!Number.isInteger(part.index) || part.index < 1 || part.index > STRUCTURE_INDEX_MAX) {
            push(StructureIssueCode.Index, `${label}: the index ${String(part.index)} is outside 1..${STRUCTURE_INDEX_MAX}.`,
              { part: name, index: part.index, max: STRUCTURE_INDEX_MAX })
          } else {
            const holder = workerIndices.get(part.index)
            if (holder != null) {
              push(StructureIssueCode.IndexDuplicate, `Workers "${holder}" and "${name}" share the index ${part.index}.`,
                { part: name, other: holder, index: part.index })
            } else {
              workerIndices.set(part.index, name)
            }
          }
        }
      } else if (!isMounted(part) && part.index != null) {
        push(StructureIssueCode.IndexNotAllowed, `${label}: a part of the kind "${kind}" has no index.`, { part: name, kind })
      }

      // Areas and queues.
      if (isKind(part, STRUCTURE_AREA_KINDS)) {
        if (!Array.isArray(part.areas) || part.areas.length === 0) {
          push(StructureIssueCode.AreasMissing, `${label} serves no area.`, { part: name })
        } else {
          const listed = new Set<string>()
          for (const key of part.areas) {
            if (listed.has(key)) push(StructureIssueCode.AreaDuplicate, `${label} lists the area "${key}" twice.`, { part: name, area: key })
            listed.add(key)
            if (!areas.has(key)) {
              push(StructureIssueCode.AreaUnknown, `${label} serves "${key}", which the structure does not list.`, { part: name, area: key })
            }
          }
        }
      } else if (Array.isArray(part.areas) && part.areas.length > 0) {
        push(StructureIssueCode.AreasNotAllowed, `${label}: a part of the kind "${kind}" serves no area.`, { part: name, kind })
      }
      if (kind === StructurePartKind.Worker) {
        const queues = Array.isArray(part.queues) ? part.queues : []
        if (queues.length > STRUCTURE_QUEUES_MAX) {
          push(StructureIssueCode.Queue, `${label} lists more than ${STRUCTURE_QUEUES_MAX} queues.`, { part: name, max: STRUCTURE_QUEUES_MAX })
        }
        const seen = new Set<string>()
        for (const queue of queues) {
          if (typeof queue !== 'string' || !STRUCTURE_QUEUE_PATTERN.test(queue) || queue.length > STRUCTURE_QUEUE_MAX) {
            push(StructureIssueCode.Queue, `${label}: the queue "${String(queue)}" is not lower-case words joined by "-" or ":".`,
              { part: name, queue: String(queue) })
          } else if (seen.has(queue)) {
            push(StructureIssueCode.Queue, `${label} lists the queue "${queue}" twice.`, { part: name, queue })
          }
          seen.add(String(queue))
        }
      } else if (Array.isArray(part.queues) && part.queues.length > 0) {
        push(StructureIssueCode.QueuesNotAllowed, `${label}: only a worker consumes queues.`, { part: name, kind })
      }
    }

    // The stock parts and the counts.
    for (const [name, kind] of Object.entries(STRUCTURE_STOCK_PARTS)) {
      if (!parts.has(name)) push(StructureIssueCode.StockMissing, `The stock part "${name}" (${kind}) is missing.`, { part: name, kind })
    }
    const common = parts.get(STRUCTURE_COMMON_PART)
    if (common != null && common.kind === StructurePartKind.Common && common.dependsOn.length > 0) {
      push(StructureIssueCode.StockShape, `Part "${STRUCTURE_COMMON_PART}" depends on nothing.`, { part: STRUCTURE_COMMON_PART })
    }
    const extraApps = [...parts.values()].filter(part => isMounted(part) && !isMain(part)).length
    if (extraApps > STRUCTURE_APPS_MAX) {
      push(StructureIssueCode.TooManyApps, `A project has at most ${STRUCTURE_APPS_MAX} apps beside "${STRUCTURE_MAIN_PART}".`,
        { max: STRUCTURE_APPS_MAX })
    }
    const extraWorkers = [...parts.values()].filter(isExtraWorker).length
    if (extraWorkers > STRUCTURE_WORKERS_MAX) {
      push(StructureIssueCode.TooManyWorkers, `A project has at most ${STRUCTURE_WORKERS_MAX} workers beside "${STRUCTURE_WORKER_PART}".`,
        { max: STRUCTURE_WORKERS_MAX })
    }

    // Who serves each area.
    const owners = new Map<string, string>()
    for (const part of parts.values()) {
      if (!isKind(part, STRUCTURE_AREA_KINDS) || !Array.isArray(part.areas)) continue
      part.areas.forEach((key, at) => {
        const area = areas.get(key)
        if (area == null) return
        const owner = owners.get(key)
        if (owner != null && owner !== part.name) {
          push(StructureIssueCode.AreaTwoWebs, `Area "${key}" is served by both "${owner}" and "${part.name}".`,
            { area: key, part: part.name, other: owner })
        } else {
          owners.set(key, part.name)
        }
        if (at > 0 && area.segment === '') {
          push(StructureIssueCode.AreaNeedsSegment, `Area "${key}" is not the home of "${part.name}", so it needs a segment.`,
            { area: key, part: part.name })
        }
        if (area.kind === ProjectArea.Guest && !isMain(part)) {
          push(StructureIssueCode.GuestWeb, `Area "${key}" is a guest (public) area — only "${STRUCTURE_MAIN_PART}" serves public areas.`,
            { area: key, part: part.name })
        }
      })
    }
    for (const key of areas.keys()) {
      if (!owners.has(key)) push(StructureIssueCode.AreaNoWeb, `Area "${key}" is served by no app.`, { area: key })
    }
    const main = parts.get(STRUCTURE_MAIN_PART)
    if (main != null && isMain(main) && areas.has(ProjectArea.Guest) && (!Array.isArray(main.areas) || main.areas[0] !== ProjectArea.Guest)
      && !issues.some(issue => issue.code === StructureIssueCode.GuestWeb && issue.params?.area === ProjectArea.Guest)) {
      push(StructureIssueCode.GuestWeb, `The guest area must be "${STRUCTURE_MAIN_PART}"'s home area (its first).`,
        { area: ProjectArea.Guest, part: STRUCTURE_MAIN_PART })
    }
    for (const key of main != null && isMain(main) && Array.isArray(main.areas) ? main.areas.slice(1) : []) {
      const segment = areas.get(key)?.segment ?? ''
      const holder = mounts.get(segment)
      if (segment !== '' && holder != null) {
        push(StructureIssueCode.AreaShadowed,
          `"${STRUCTURE_MAIN_PART}"'s area "${key}" at /${segment} is shadowed by the part "${holder}" mounted there.`,
          { area: key, part: holder, mount: segment })
      }
    }

    // Edges.
    const callers = new Map<string, string[]>()
    for (const part of parts.values()) {
      const seen = new Set<string>()
      const calls: string[] = []
      for (const dep of part.dependsOn) {
        if (typeof dep !== 'string') continue
        if (seen.has(dep)) {
          push(StructureIssueCode.EdgeDuplicate, `Part "${part.name}" names "${dep}" twice.`, { part: part.name, target: dep })
          continue
        }
        seen.add(dep)
        if (dep === part.name) {
          push(StructureIssueCode.EdgeSelf, `Part "${part.name}" depends on itself.`, { part: part.name })
          continue
        }
        const target = parts.get(dep)
        if (target == null) {
          push(StructureIssueCode.EdgeUnknown, `Part "${part.name}" depends on "${dep}", which the structure does not hold.`,
            { part: part.name, target: dep })
          continue
        }
        if (part.kind === StructurePartKind.Web && isKind(target, STRUCTURE_CALLABLE_KINDS)) {
          calls.push(dep)
          continue
        }
        if (!STRUCTURE_EDGE_RULES[part.kind].includes(target.kind)) {
          push(StructureIssueCode.EdgeKind, `Part "${part.name}" (${part.kind}) may not depend on "${dep}" (${target.kind}).`,
            { part: part.name, target: dep, kind: target.kind })
        }
      }
      for (const required of STRUCTURE_REQUIRED_EDGES[part.kind]) {
        if (required !== part.name && parts.has(required) && !seen.has(required)) {
          push(StructureIssueCode.EdgeRequired, `Part "${part.name}" must depend on "${required}".`, { part: part.name, target: required })
        }
      }
      if (part.kind === StructurePartKind.Web) {
        if (calls.length === 0) {
          push(StructureIssueCode.CallsMissing, `Part "${part.name}" (web) must name the one api or pair it calls.`, { part: part.name })
        } else if (calls.length > 1) {
          push(StructureIssueCode.CallsMany, `Part "${part.name}" (web) calls ${calls.length} parts — exactly one api or pair.`,
            { part: part.name, target: calls.join(', ') })
        }
        for (const callee of calls) callers.set(callee, [...callers.get(callee) ?? [], part.name])
      }
    }
    for (const [callee, webs] of callers) {
      if (parts.get(callee)?.kind === StructurePartKind.Api && webs.length > 1) {
        push(StructureIssueCode.ApiCallers, `Part "${callee}" (api) is called by ${webs.length} webs — at most one.`,
          { part: callee, other: webs.join(', ') })
      }
    }

    // Cycles.
    const state = new Map<string, 'visiting' | 'done'>()
    const cyclic = new Set<string>()
    const visit = (name: string, trail: string[]): void => {
      if (state.get(name) === 'done') return
      if (state.get(name) === 'visiting') {
        const start = trail.indexOf(name)
        for (const member of trail.slice(start)) cyclic.add(member)
        return
      }
      state.set(name, 'visiting')
      for (const dep of parts.get(name)?.dependsOn ?? []) {
        if (dep !== name && parts.has(dep)) visit(dep, [...trail, name])
      }
      state.set(name, 'done')
    }
    for (const name of parts.keys()) visit(name, [])
    for (const name of cyclic) {
      push(StructureIssueCode.Cycle, `Part "${name}" sits on a dependency cycle.`, { part: name })
    }

    // The pairs' map — a safety net for a rule no code above names.
    if (issues.length === 0) {
      for (const message of appMapHelper.validate(appMapOf(structure))) push(StructureIssueCode.AppMap, message)
    }

    return issues
  }

  const validateRef: ProjectStructureHelper['validateRef'] = (structure, opts) => check(structure, opts, false)

  const validate: ProjectStructureHelper['validate'] = (structure, opts) => check(structure, opts, true)

  return {
    defaultFor, fromApps, fromCard, fromTopology, narrow, isDerived, validate, validateRef, normalize, refOf, appMapOf,
    topologyOf, appsOf, workersOf, librariesOf, edgesOf, webOf, apiOf, packagesOf, defaultPurposeOf, decisionFieldsOf, diff,
  }
}

export const projectStructureHelper = createProjectStructureHelper()
