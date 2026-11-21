import {
  AREA_DEFAULT_LABELS, AREA_KEY_MAX, AREA_KEY_PATTERN, AREA_LABEL_MAX, AREA_MARKER_PREFIX, AREA_SEGMENT_PATTERN, ProjectArea,
  STANDARD_AREAS,
} from '../areas/consts.js'
import type { AreaDescriptor, AreaKey } from '../areas/types.js'
import { TargetPackage } from '../integrity/consts.js'
import { SubProject } from '../slot/consts.js'
import type { TargetPackageDescriptor } from './types.js'
import {
  APP_API_SUFFIX, APP_DEFAULT_SPLIT, APP_NAME_PATTERN, APP_WEB_SUFFIX, MAIN_APP, MAIN_APP_API, MAIN_APP_WEB,
  RESERVED_APP_NAMES, RESERVED_MOUNTS, TARGET_APP_API_BASE, TARGET_APP_API_PORT_BASE, TARGET_APP_API_PORT_STEP,
  TARGET_APP_MARKER_PREFIX, TARGET_APP_MAX_APPS, TARGET_APP_MAX_INDEX, TARGET_APP_MOUNT_PATTERN,
  TARGET_APP_PRODUCTION_WEB_PORT_BASE, TARGET_APP_PRODUCTION_WEB_PORT_STEP, TARGET_APP_WEB_PORT_BASE,
  TARGET_APP_WEB_PORT_STEP, TARGET_AREA_MAX, TARGET_HEALTH_ROUTE,
} from './apps/consts.js'
import type {
  AppApiEnv, AppDescriptor, AppEndpoints, AppMap, AppMapHelper, AppRoute, AppServicePort, AppWebEnv, AppWebKind,
  SlotAppClaim,
} from './apps/types.js'

export const createAppMapHelper = (): AppMapHelper => {
  const KINDS = new Set<string>(Object.values(ProjectArea))
  const STANDARD_SEGMENTS = new Map<string, string>(STANDARD_AREAS.map(area => [area.key, area.segment]))

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value != null && typeof value === 'object' && !Array.isArray(value)

  const copyArea = (area: AreaDescriptor): AreaDescriptor => ({ ...area })

  const markerOf: AppMapHelper['markerOf'] = key => `${AREA_MARKER_PREFIX}${key}`

  const byIndex = <T extends SlotAppClaim>(apps: readonly T[]): T[] => [...apps].sort((a, b) => a.index - b.index)

  /** main is the one app at the host's root. */
  const isMain = (app: SlotAppClaim): boolean => app.mount === ''

  const legacyMain = (): AppDescriptor => ({
    name: MAIN_APP,
    mount: '',
    areas: STANDARD_AREAS.map(area => area.key),
    web: MAIN_APP_WEB,
    api: MAIN_APP_API,
    index: 0,
  })

  const legacy = (): AppMap => ({ areas: STANDARD_AREAS.map(copyArea), apps: [legacyMain()] })

  const of: AppMapHelper['of'] = ref => {
    const map = ref?.apps
    if (!isRecord(map) || !Array.isArray(map.apps) || map.apps.length === 0 || !Array.isArray(map.areas)) {
      return legacy()
    }

    return map
  }

  const narrowArea = (value: unknown): AreaDescriptor | null => {
    if (!isRecord(value)) return null
    const { key, kind, segment, label, marker } = value
    if (typeof key !== 'string' || typeof kind !== 'string' || !KINDS.has(kind) || typeof segment !== 'string') {
      return null
    }

    return {
      key,
      kind: kind as ProjectArea,
      segment,
      ...(typeof label === 'string' ? { label } : {}),
      ...(typeof marker === 'string' ? { marker } : {}),
    }
  }

  const narrowApp = (value: unknown): AppDescriptor | null => {
    if (!isRecord(value)) return null
    const { name, mount, areas, web, api, index } = value
    if (typeof name !== 'string' || typeof mount !== 'string' || typeof web !== 'string' || typeof api !== 'string') {
      return null
    }
    if (typeof index !== 'number' || !Number.isFinite(index)) return null
    if (!Array.isArray(areas) || !areas.every(area => typeof area === 'string')) return null

    return { name, mount, areas: [...areas as string[]], web, api, index }
  }

  const narrow: AppMapHelper['narrow'] = data => {
    if (!isRecord(data) || !Array.isArray(data.apps)) return null
    const apps = data.apps.map(narrowApp).filter((app): app is AppDescriptor => app != null)
    const areas = Array.isArray(data.areas)
      ? data.areas.map(narrowArea).filter((area): area is AreaDescriptor => area != null)
      : STANDARD_AREAS.map(copyArea)

    return { areas, apps }
  }

  const isStandardAreas: AppMapHelper['isStandardAreas'] = map =>
    map.areas.length === STANDARD_AREAS.length && STANDARD_AREAS.every(standard => {
      const area = map.areas.find(candidate => candidate.key === standard.key)

      return area != null && area.kind === standard.kind && area.segment === standard.segment
        && area.marker == null && (area.label == null || area.label === AREA_DEFAULT_LABELS[standard.kind])
    })

  const isLegacy: AppMapHelper['isLegacy'] = map => {
    if (map.apps.length !== 1 || !isStandardAreas(map)) return false
    const [main] = map.apps

    return main.name === MAIN_APP && main.mount === '' && main.index === 0
      && main.web === MAIN_APP_WEB && main.api === MAIN_APP_API
      && main.areas.length === STANDARD_AREAS.length && main.areas[0] === ProjectArea.Guest
      && STANDARD_AREAS.every(area => main.areas.includes(area.key))
  }

  const defaultFor: AppMapHelper['defaultFor'] = areas => {
    const given = new Set<string>(areas)
    const covered = STANDARD_AREAS.filter(area => area.key === ProjectArea.Guest || given.has(area.key))
    const apps: AppDescriptor[] = [{
      ...legacyMain(),
      areas: covered.filter(area => APP_DEFAULT_SPLIT[area.kind] == null).map(area => area.key),
    }]
    for (const [kind, target] of Object.entries(APP_DEFAULT_SPLIT)) {
      if (target == null || !given.has(kind)) continue
      apps.push({
        name: target.name,
        mount: target.mount,
        areas: [kind],
        web: `${target.name}${APP_WEB_SUFFIX}`,
        api: `${target.name}${APP_API_SUFFIX}`,
        index: apps.length,
      })
    }

    return { areas: covered.map(copyArea), apps }
  }

  const validate: AppMapHelper['validate'] = map => {
    if (!isRecord(map) || !Array.isArray(map.areas) || !Array.isArray(map.apps)) {
      return ['The app map must list its areas and its apps.']
    }
    const errors: string[] = []
    const areas = new Map<string, AreaDescriptor>()
    const segments = new Map<string, string>()

    if (map.areas.length > TARGET_AREA_MAX) errors.push(`A project has at most ${TARGET_AREA_MAX} areas.`)
    for (const area of map.areas) {
      const key = String(area?.key)
      if (typeof area?.key !== 'string' || !AREA_KEY_PATTERN.test(area.key) || area.key.length > AREA_KEY_MAX) {
        errors.push(`Area key "${key}" must be lower-case words joined by single hyphens, at most ${AREA_KEY_MAX} characters.`)
        continue
      }
      if (areas.has(key)) {
        errors.push(`Area "${key}" is listed twice.`)
        continue
      }
      areas.set(key, area)
      if (!KINDS.has(area.kind)) {
        errors.push(`Area "${key}" is of no known kind ("${String(area.kind)}").`)
      } else if (KINDS.has(key) && area.kind !== key) {
        errors.push(`Area "${key}" must be of the kind "${key}".`)
      }
      if (typeof area.segment !== 'string' || !AREA_SEGMENT_PATTERN.test(area.segment)) {
        errors.push(`Area "${key}" has an ill-shaped segment "${String(area.segment)}" — one lower-case path segment, or ''.`)
      } else if (area.segment !== '') {
        const holder = segments.get(area.segment)
        if (holder != null) errors.push(`Areas "${holder}" and "${key}" share the segment "${area.segment}".`)
        else segments.set(area.segment, key)
        if (RESERVED_MOUNTS.includes(area.segment) && STANDARD_SEGMENTS.get(key) !== area.segment) {
          errors.push(`Area "${key}" may not use the reserved segment "${area.segment}".`)
        }
      }
      if (area.label != null && (typeof area.label !== 'string' || area.label.trim() === '' || area.label.length > AREA_LABEL_MAX)) {
        errors.push(`Area "${key}" has a label that is empty or longer than ${AREA_LABEL_MAX} characters.`)
      }
      if (area.marker != null && area.marker !== markerOf(key)) {
        errors.push(`Area "${key}" may only carry the marker "${markerOf(key)}".`)
      } else if (area.marker != null && area.kind === ProjectArea.Guest) {
        errors.push(`Area "${key}" is public (a guest area) — it carries no marker.`)
      }
    }
    if (!areas.has(ProjectArea.Guest)) errors.push('The guest area is missing — it is what the bare host serves.')

    if (map.apps.length === 0) errors.push('The map has no app — "main" is required.')
    if (map.apps.length > TARGET_APP_MAX_APPS) errors.push(`A project has at most ${TARGET_APP_MAX_APPS} apps.`)
    const main = map.apps.find(app => app?.name === MAIN_APP) ?? null
    if (main == null) {
      errors.push(`The app "${MAIN_APP}" is missing.`)
    } else {
      if (main.mount !== '') errors.push(`"${MAIN_APP}" must be mounted at the host's root (mount '').`)
      if (main.index !== 0) errors.push(`"${MAIN_APP}" must hold index 0.`)
      if (main.web !== MAIN_APP_WEB || main.api !== MAIN_APP_API) {
        errors.push(`"${MAIN_APP}"'s packages must be "${MAIN_APP_WEB}" and "${MAIN_APP_API}".`)
      }
      if (!Array.isArray(main.areas) || main.areas[0] !== ProjectArea.Guest) {
        errors.push(`The guest area must be "${MAIN_APP}"'s home area (its first).`)
      }
    }

    const names = new Set<string>()
    const mounts = new Map<string, string>()
    const indices = new Map<number, string>()
    const dirs = new Map<string, string>()
    const owners = new Map<string, string>()
    for (const app of map.apps) {
      const name = String(app?.name)
      const label = `App "${name}"`
      if (typeof app?.name !== 'string' || !APP_NAME_PATTERN.test(app.name)) {
        errors.push(`${label}: a name is 2–16 lower-case letters and digits, starting with a letter.`)
      } else if (RESERVED_APP_NAMES.includes(app.name)) {
        errors.push(`${label}: the name is reserved.`)
      }
      if (names.has(name)) errors.push(`${label} is listed twice.`)
      names.add(name)

      if (app !== main) {
        if (app.mount === '') {
          errors.push(`${label}: only "${MAIN_APP}" is mounted at the host's root.`)
        } else if (typeof app.mount !== 'string' || !TARGET_APP_MOUNT_PATTERN.test(app.mount)) {
          errors.push(`${label}: the mount "${String(app.mount)}" is not one lower-case path segment.`)
        } else if (RESERVED_MOUNTS.includes(app.mount)) {
          errors.push(`${label}: the mount "/${app.mount}" is reserved.`)
        }
        if (!Number.isInteger(app.index) || app.index < 1 || app.index > TARGET_APP_MAX_INDEX) {
          errors.push(`${label}: the index ${String(app.index)} is outside 1..${TARGET_APP_MAX_INDEX}.`)
        }
        if (app.web !== `${name}${APP_WEB_SUFFIX}` || app.api !== `${name}${APP_API_SUFFIX}`) {
          errors.push(`${label}: its packages must be "${name}${APP_WEB_SUFFIX}" and "${name}${APP_API_SUFFIX}".`)
        }
      }
      if (typeof app.mount === 'string' && app.mount !== '') {
        const holder = mounts.get(app.mount)
        if (holder != null) errors.push(`Apps "${holder}" and "${name}" share the mount "/${app.mount}".`)
        else mounts.set(app.mount, name)
      }
      const holder = indices.get(app.index)
      if (holder != null) errors.push(`Apps "${holder}" and "${name}" share the index ${String(app.index)}.`)
      else indices.set(app.index, name)
      for (const dir of [app.web, app.api]) {
        const user = dirs.get(String(dir))
        if (user != null) errors.push(`Apps "${user}" and "${name}" share the package "${String(dir)}".`)
        else dirs.set(String(dir), name)
      }

      if (!Array.isArray(app.areas) || app.areas.length === 0) {
        errors.push(`${label} serves no area.`)
        continue
      }
      app.areas.forEach((key, at) => {
        const area = areas.get(key)
        if (area == null) errors.push(`${label} serves "${key}", which the map does not list.`)
        else if (at > 0 && area.segment === '') errors.push(`Area "${key}" is not ${label}'s home, so it needs a segment.`)
        const owner = owners.get(key)
        if (owner != null) errors.push(`Area "${key}" is served by both "${owner}" and "${name}".`)
        else owners.set(key, name)
        // The landing, the legal pages and the guest menu exist in main alone: so does every public area.
        if (area != null && area.kind === ProjectArea.Guest && key !== ProjectArea.Guest && app !== main) {
          errors.push(`Area "${key}" is a guest (public) area — only "${MAIN_APP}" serves public areas.`)
        }
      })
    }
    for (const key of areas.keys()) {
      if (!owners.has(key)) errors.push(`Area "${key}" is served by no app.`)
    }
    // A main area's own path must not sit under another app's mount, or that app shadows it.
    for (const key of main != null && Array.isArray(main.areas) ? main.areas.slice(1) : []) {
      const segment = areas.get(key)?.segment ?? ''
      const holder = mounts.get(segment)
      if (segment !== '' && holder != null && holder !== MAIN_APP) {
        errors.push(`"${MAIN_APP}"'s area "${key}" at /${segment} is shadowed by the app "${holder}" mounted there.`)
      }
    }

    return errors
  }

  const app: AppMapHelper['app'] = (map, name) => map.apps.find(candidate => candidate.name === name) ?? null

  const mainOf = (map: AppMap): AppDescriptor =>
    map.apps.find(candidate => candidate.name === MAIN_APP) ?? map.apps.find(isMain) ?? legacyMain()

  const homeAppOf: AppMapHelper['homeAppOf'] = (map, areaKey) =>
    map.apps.find(candidate => candidate.areas.includes(areaKey)) ?? mainOf(map)

  const areaOf: AppMapHelper['areaOf'] = (map, key) => {
    const listed = map.areas.find(area => area.key === key) ?? STANDARD_AREAS.find(area => area.key === key)

    return listed != null ? copyArea(listed) : { key, kind: ProjectArea.User, segment: key }
  }

  const kindOf: AppMapHelper['kindOf'] = (map, key) => areaOf(map, key).kind

  const hasArea: AppMapHelper['hasArea'] = (map, key) => typeof key === 'string' && key !== ''
    && (STANDARD_SEGMENTS.has(key) || (Array.isArray(map?.areas) ? map.areas : []).some(area => area?.key === key))

  const keysOf: AppMapHelper['keysOf'] = map => [
    ...STANDARD_AREAS.map(area => area.key),
    ...(Array.isArray(map?.areas) ? map.areas : [])
      .map(area => area?.key)
      .filter((key): key is string => typeof key === 'string' && !STANDARD_SEGMENTS.has(key)),
  ]

  const isHome = (map: AppMap, key: AreaKey): boolean => homeAppOf(map, key).areas[0] === key

  const areaRouteOf: AppMapHelper['areaRouteOf'] = (map, key) =>
    '/' + (isHome(map, key) ? '' : areaOf(map, key).segment)

  const areaUrlOf: AppMapHelper['areaUrlOf'] = (map, key) =>
    '/' + [homeAppOf(map, key).mount, isHome(map, key) ? '' : areaOf(map, key).segment]
      .filter(part => part !== '').join('/')

  const homeKeyOf: AppMapHelper['homeKeyOf'] = area => area.key === ProjectArea.Guest
    ? 'home'
    : `${area.key.replace(/-([a-z0-9])/g, (_match, ch: string) => ch.toUpperCase())}Home`

  const markedAreasOf: AppMapHelper['markedAreasOf'] = map => (Array.isArray(map?.areas) ? map.areas : [])
    .filter(area => typeof area?.marker === 'string' && area.marker !== '' && area.kind !== ProjectArea.Guest)
    .map(copyArea)

  const apiPort: AppMapHelper['apiPort'] = target => TARGET_APP_API_PORT_BASE + TARGET_APP_API_PORT_STEP * target.index

  const webPort: AppMapHelper['webPort'] = (target, kind: AppWebKind) => kind === 'production'
    ? TARGET_APP_PRODUCTION_WEB_PORT_BASE + TARGET_APP_PRODUCTION_WEB_PORT_STEP * target.index
    : TARGET_APP_WEB_PORT_BASE + TARGET_APP_WEB_PORT_STEP * target.index

  const apiBase: AppMapHelper['apiBase'] = target =>
    isMain(target) ? TARGET_APP_API_BASE : `${target.mount}/${TARGET_APP_API_BASE}`

  const appBase: AppMapHelper['appBase'] = target => isMain(target) ? '' : target.mount

  const webBuildBase: AppMapHelper['webBuildBase'] = target => isMain(target) ? '/' : `/${target.mount}`

  const apiEnvOf: AppMapHelper['apiEnvOf'] = (target): AppApiEnv => ({
    BACKEND_PORT: String(apiPort(target)),
    BACKEND_BASE_URL: apiBase(target),
    BASE_URL: appBase(target),
  })

  const webEnvOf: AppMapHelper['webEnvOf'] = (target): AppWebEnv => ({
    BACKEND_BASE_URL: apiBase(target),
    BASE_URL: webBuildBase(target),
  })

  const healthPath: AppMapHelper['healthPath'] = target => `/${apiBase(target)}/${TARGET_HEALTH_ROUTE}`

  const marker: AppMapHelper['marker'] = target => isMain(target) ? null : `${TARGET_APP_MARKER_PREFIX}${target.name}`

  const endpointsOf: AppMapHelper['endpointsOf'] = (target): AppEndpoints => ({
    app: target.name,
    mount: target.mount,
    apiPort: apiPort(target),
    webPort: webPort(target, 'preview'),
    productionWebPort: webPort(target, 'production'),
    apiBase: apiBase(target),
    webBase: webBuildBase(target),
  })

  const routes: AppMapHelper['routes'] = apps => apps
    .flatMap((target): AppRoute[] => [
      { path: `/${apiBase(target)}`, side: 'api', app: target.name },
      { path: isMain(target) ? '/' : `/${target.mount}`, side: 'web', app: target.name },
    ])
    .sort((a, b) => b.path.length - a.path.length || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  const servicePorts: AppMapHelper['servicePorts'] = (apps, kind) => byIndex(apps)
    .flatMap((target): AppServicePort[] => [
      { name: `api-${target.index}`, port: apiPort(target), target: apiPort(target) },
      { name: `web-${target.index}`, port: webPort(target, 'production'), target: webPort(target, kind) },
    ])

  const packagesOf: AppMapHelper['packagesOf'] = map => byIndex(map.apps.filter(target => !isMain(target)))
    .flatMap((target): TargetPackageDescriptor[] => [
      {
        name: target.api,
        roles: [SubProject.Api],
        kind: 'bundle',
        dependsOn: [TargetPackage.Common, TargetPackage.Backend],
        app: target.name,
        mount: target.mount,
      },
      {
        name: target.web,
        roles: [SubProject.Web, SubProject.Frontend],
        kind: 'bundle',
        dependsOn: [TargetPackage.Common],
        app: target.name,
        mount: target.mount,
      },
    ])

  const touchedBy: AppMapHelper['touchedBy'] = (map, areas) => {
    const touched = new Map<string, AppDescriptor>()
    for (const key of areas) {
      const home = homeAppOf(map, key)
      touched.set(home.name, home)
    }

    return byIndex([...touched.values()])
  }

  const nextIndex: AppMapHelper['nextIndex'] = map => {
    const used = new Set(map.apps.map(target => target.index))
    const top = Math.max(0, ...map.apps.map(target => target.index).filter(index => Number.isInteger(index)))
    if (top < TARGET_APP_MAX_INDEX) return top + 1
    for (let index = 1; index <= TARGET_APP_MAX_INDEX; index++) {
      if (!used.has(index)) return index
    }

    return null
  }

  const fromTopology: AppMapHelper['fromTopology'] = meta => {
    if (meta?.apps == null || meta.apps.length === 0) return [legacyMain()]
    const map: AppMap = { areas: meta.areas ?? STANDARD_AREAS.map(copyArea), apps: meta.apps }
    if (validate(map).length > 0) return [legacyMain()]

    return byIndex(meta.apps)
  }

  const claimsOf: AppMapHelper['claimsOf'] = map =>
    byIndex(map.apps).map(({ name, mount, index }) => ({ name, mount, index }))

  return {
    legacy, of, narrow, isLegacy, isStandardAreas, defaultFor, validate, app, homeAppOf, areaOf, kindOf, hasArea, keysOf,
    areaRouteOf, areaUrlOf, homeKeyOf, markerOf, markedAreasOf, endpointsOf, apiPort, webPort, apiBase, appBase, webBuildBase, apiEnvOf, webEnvOf,
    healthPath, marker, routes, servicePorts, packagesOf, touchedBy, nextIndex, fromTopology, claimsOf,
  }
}

export const appMapHelper = createAppMapHelper()
