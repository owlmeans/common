import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { AREA_PATHS, ProjectArea, PROJECT_AREAS, STANDARD_AREAS } from '../src/areas/consts.js'
import {
  TARGET_API_BASE, TARGET_API_PORT, TARGET_BOOTCHECK_PORT, TARGET_WEB_PORT, TARGET_WORKER_PORT,
} from '../src/slot/consts.js'
import { SubProject } from '../src/slot/consts.js'
import { appMapHelper } from '../src/topology/apps.js'
import {
  MAIN_APP, RESERVED_MOUNTS, TARGET_APP_MAX_INDEX, TARGET_PRODUCTION_WEB_PORT,
} from '../src/topology/apps/consts.js'
import type { AppDescriptor, AppMap } from '../src/topology/apps/types.js'
import { DEFAULT_TOPOLOGY } from '../src/topology/consts.js'
import { AppDescriptorSchema, AreaDescriptorSchema, SlotAppClaimSchema, ViableAppsDecisionSchema } from '../src/topology/schemas.js'
import * as barrel from '../src/index.js'

const ALL = [ProjectArea.Guest, ProjectArea.User, ProjectArea.Admin, ProjectArea.Operator]
const split = (): AppMap => appMapHelper.defaultFor(ALL)
const appOf = (map: AppMap, name: string): AppDescriptor => appMapHelper.app(map, name)!

describe('viable-common - the legacy app map', () => {
  test('is main at the root over the four standard areas, guest first', () => {
    expect(appMapHelper.legacy()).toEqual({
      areas: [
        { key: 'guest', kind: 'guest', segment: '' },
        { key: 'user', kind: 'user', segment: 'frontoffice' },
        { key: 'admin', kind: 'admin', segment: 'admin' },
        { key: 'operator', kind: 'operator', segment: 'backoffice' },
      ],
      apps: [{ name: 'main', mount: '', areas: ['guest', 'user', 'admin', 'operator'], web: 'web', api: 'api', index: 0 }],
    })
    expect(appMapHelper.validate(appMapHelper.legacy())).toEqual([])
    expect(appMapHelper.isLegacy(appMapHelper.legacy())).toBe(true)
    expect(appMapHelper.isStandardAreas(appMapHelper.legacy())).toBe(true)
  })

  test('the standard areas are the kinds, in menu order, with the tails of AREA_PATHS', () => {
    expect(STANDARD_AREAS.map(area => area.key)).toEqual(PROJECT_AREAS)
    for (const area of STANDARD_AREAS) {
      expect(area.kind).toBe(area.key as ProjectArea)
      expect(`/${area.segment}`).toBe(AREA_PATHS[area.kind])
    }
  })

  test('a fresh copy every call — a caller mutating it changes nobody else', () => {
    const first = appMapHelper.legacy()
    first.apps[0].areas.pop()
    first.areas[0].segment = 'x'
    expect(appMapHelper.legacy()).toEqual(appMapHelper.of(null))
    expect(STANDARD_AREAS[0].segment).toBe('')
  })

  test('absent or unusable ⇒ legacy; a present map is returned as recorded', () => {
    for (const ref of [undefined, null, {}, { apps: null }, { apps: { areas: [], apps: [] } }]) {
      expect(appMapHelper.of(ref as never)).toEqual(appMapHelper.legacy())
    }
    const map = split()
    expect(appMapHelper.of({ apps: map })).toBe(map)
  })

  test('every area URL is exactly AREA_PATHS', () => {
    for (const area of ALL) expect(appMapHelper.areaUrlOf(appMapHelper.legacy(), area)).toBe(AREA_PATHS[area])
  })
})

describe('viable-common - the default split', () => {
  test('guest + user stay in main, admin and operator get an app of their own', () => {
    const map = split()
    expect(map.apps).toEqual([
      { name: 'main', mount: '', areas: ['guest', 'user'], web: 'web', api: 'api', index: 0 },
      { name: 'admin', mount: 'admin', areas: ['admin'], web: 'admin-web', api: 'admin-api', index: 1 },
      { name: 'backoffice', mount: 'backoffice', areas: ['operator'], web: 'backoffice-web', api: 'backoffice-api', index: 2 },
    ])
    expect(map.areas).toEqual([...STANDARD_AREAS])
    expect(appMapHelper.validate(map)).toEqual([])
    expect(appMapHelper.isLegacy(map)).toBe(false)
    expect(appMapHelper.isStandardAreas(map)).toBe(true)
  })

  test('the split gives exactly AREA_PATHS too — and each app home sits at its mount', () => {
    const map = split()
    for (const area of ALL) expect(appMapHelper.areaUrlOf(map, area)).toBe(AREA_PATHS[area])
    expect(appMapHelper.areaRouteOf(map, ProjectArea.Guest)).toBe('/')
    expect(appMapHelper.areaRouteOf(map, ProjectArea.User)).toBe('/frontoffice')
    expect(appMapHelper.areaRouteOf(map, ProjectArea.Admin)).toBe('/')
    expect(appMapHelper.areaRouteOf(map, ProjectArea.Operator)).toBe('/')
  })

  test('only the areas given; guest is always added, first; unknown keys are ignored', () => {
    const withoutAdmin = appMapHelper.defaultFor(['operator', 'user', 'partner'])
    expect(withoutAdmin.areas.map(area => area.key)).toEqual(['guest', 'user', 'operator'])
    expect(withoutAdmin.apps.map(app => [app.name, app.index, app.areas])).toEqual([
      ['main', 0, ['guest', 'user']], ['backoffice', 1, ['operator']],
    ])
    expect(appMapHelper.validate(withoutAdmin)).toEqual([])
  })

  test('without admin and operator: one legacy-shaped main over the areas given', () => {
    const map = appMapHelper.defaultFor(['user'])
    expect(map.apps).toEqual([{ name: 'main', mount: '', areas: ['guest', 'user'], web: 'web', api: 'api', index: 0 }])
    expect(appMapHelper.validate(map)).toEqual([])
    expect(appMapHelper.defaultFor([]).apps).toEqual([{ ...map.apps[0], areas: ['guest'] }])
  })

  test('an area no app lists is addressed in main, at its standard path', () => {
    const map = appMapHelper.defaultFor(['user', 'operator'])
    expect(appMapHelper.homeAppOf(map, ProjectArea.Admin).name).toBe(MAIN_APP)
    expect(appMapHelper.areaUrlOf(map, ProjectArea.Admin)).toBe('/admin')
    expect(appMapHelper.areaOf(map, 'partner')).toEqual({ key: 'partner', kind: ProjectArea.User, segment: 'partner' })
    expect(appMapHelper.kindOf(map, ProjectArea.Operator)).toBe(ProjectArea.Operator)
  })
})

describe('viable-common - where an app answers', () => {
  test('main answers exactly where the target always has', () => {
    const main = appMapHelper.legacy().apps[0]
    expect(appMapHelper.apiPort(main)).toBe(TARGET_API_PORT)
    expect(appMapHelper.webPort(main, 'preview')).toBe(TARGET_WEB_PORT)
    expect(appMapHelper.webPort(main, 'production')).toBe(TARGET_PRODUCTION_WEB_PORT)
    expect(appMapHelper.apiBase(main)).toBe(TARGET_API_BASE)
    expect(appMapHelper.appBase(main)).toBe('')
    expect(appMapHelper.webBuildBase(main)).toBe('/')
    expect(appMapHelper.healthPath(main)).toBe('/api/healtz')
    expect(appMapHelper.marker(main)).toBeNull()
    // The publisher's `_backendEnv` / `_frontendEnv` values, verbatim.
    expect(appMapHelper.apiEnvOf(main)).toEqual({ BACKEND_PORT: '3000', BACKEND_BASE_URL: 'api', BASE_URL: '' })
    expect(appMapHelper.webEnvOf(main)).toEqual({ BACKEND_BASE_URL: 'api', BASE_URL: '/' })
    expect(appMapHelper.endpointsOf(main)).toEqual({
      app: 'main', mount: '', apiPort: 3000, webPort: 5173, productionWebPort: 8080, apiBase: 'api', webBase: '/',
    })
  })

  test('an extra app answers under its mount, on ports from its index', () => {
    const admin = appOf(split(), 'admin')
    expect(appMapHelper.endpointsOf(admin)).toEqual({
      app: 'admin', mount: 'admin', apiPort: 3010, webPort: 5174, productionWebPort: 8081, apiBase: 'admin/api', webBase: '/admin',
    })
    expect(appMapHelper.apiEnvOf(admin)).toEqual({ BACKEND_PORT: '3010', BACKEND_BASE_URL: 'admin/api', BASE_URL: 'admin' })
    expect(appMapHelper.webEnvOf(admin)).toEqual({ BACKEND_BASE_URL: 'admin/api', BASE_URL: '/admin' })
    expect(appMapHelper.healthPath(admin)).toBe('/admin/api/healtz')
    expect(appMapHelper.marker(admin)).toBe('--viable-app=admin')
  })

  test('no app port ever lands on the worker or the boot check', () => {
    for (let index = 0; index <= TARGET_APP_MAX_INDEX; index++) {
      const port = appMapHelper.apiPort({ name: 'x', mount: index === 0 ? '' : 'x', index })
      expect([TARGET_WORKER_PORT, TARGET_BOOTCHECK_PORT]).not.toContain(port)
    }
  })

  test('routes go longest prefix first, ending with main', () => {
    expect(appMapHelper.routes(appMapHelper.claimsOf(split()))).toEqual([
      { path: '/backoffice/api', side: 'api', app: 'backoffice' },
      { path: '/backoffice', side: 'web', app: 'backoffice' },
      { path: '/admin/api', side: 'api', app: 'admin' },
      { path: '/admin', side: 'web', app: 'admin' },
      { path: '/api', side: 'api', app: 'main' },
      { path: '/', side: 'web', app: 'main' },
    ])
    expect(appMapHelper.routes(appMapHelper.legacy().apps)).toEqual([
      { path: '/api', side: 'api', app: 'main' }, { path: '/', side: 'web', app: 'main' },
    ])
  })

  test('service ports are api-<i> / web-<i>, in index order, never longer than 15 characters', () => {
    const preview = appMapHelper.servicePorts([...appMapHelper.claimsOf(split())].reverse(), 'preview')
    expect(preview).toEqual([
      { name: 'api-0', port: 3000, target: 3000 }, { name: 'web-0', port: 8080, target: 5173 },
      { name: 'api-1', port: 3010, target: 3010 }, { name: 'web-1', port: 8081, target: 5174 },
      { name: 'api-2', port: 3020, target: 3020 }, { name: 'web-2', port: 8082, target: 5175 },
    ])
    expect(appMapHelper.servicePorts([appOf(split(), 'admin')], 'production'))
      .toEqual([{ name: 'api-1', port: 3010, target: 3010 }, { name: 'web-1', port: 8081, target: 8081 }])
    const widest = appMapHelper.servicePorts([{ name: 'x', mount: 'x', index: TARGET_APP_MAX_INDEX }], 'preview')
    for (const port of widest) expect(port.name.length).toBeLessThanOrEqual(15)
  })
})

describe('viable-common - the app map in the topology', () => {
  test('the extra apps become topology packages; main adds none', () => {
    expect(appMapHelper.packagesOf(appMapHelper.legacy())).toEqual([])
    expect(appMapHelper.packagesOf(split())).toEqual([
      { name: 'admin-api', roles: [SubProject.Api], kind: 'bundle', dependsOn: ['common', 'backend'], app: 'admin', mount: 'admin' },
      { name: 'admin-web', roles: [SubProject.Web, SubProject.Frontend], kind: 'bundle', dependsOn: ['common'], app: 'admin', mount: 'admin' },
      { name: 'backoffice-api', roles: [SubProject.Api], kind: 'bundle', dependsOn: ['common', 'backend'], app: 'backoffice', mount: 'backoffice' },
      { name: 'backoffice-web', roles: [SubProject.Web, SubProject.Frontend], kind: 'bundle', dependsOn: ['common'], app: 'backoffice', mount: 'backoffice' },
    ])
  })

  test('a recorded topology without apps, or with an invalid list, is main alone', () => {
    const main = appMapHelper.legacy().apps
    expect(appMapHelper.fromTopology(null)).toEqual(main)
    expect(appMapHelper.fromTopology(DEFAULT_TOPOLOGY)).toEqual(main)
    expect(appMapHelper.fromTopology({ ...DEFAULT_TOPOLOGY, apps: [] })).toEqual(main)
    const broken = split()
    broken.apps[1].mount = 'api'
    expect(appMapHelper.fromTopology({ ...DEFAULT_TOPOLOGY, ...broken })).toEqual(main)
  })

  test('a valid recorded split comes back main first, in index order', () => {
    const map = split()
    expect(appMapHelper.fromTopology({ ...DEFAULT_TOPOLOGY, areas: map.areas, apps: [...map.apps].reverse() })).toEqual(map.apps)
    // `areas` absent reads as the standard four.
    expect(appMapHelper.fromTopology({ ...DEFAULT_TOPOLOGY, apps: map.apps })).toEqual(map.apps)
  })

  test('claims are name, mount and index, in index order', () => {
    expect(appMapHelper.claimsOf(appMapHelper.legacy())).toEqual([{ name: 'main', mount: '', index: 0 }])
    expect(appMapHelper.claimsOf(split()).map(claim => claim.name)).toEqual(['main', 'admin', 'backoffice'])
  })

  test('the next index is one above the highest, then the lowest free, then none', () => {
    expect(appMapHelper.nextIndex(appMapHelper.legacy())).toBe(1)
    expect(appMapHelper.nextIndex(split())).toBe(3)
    const full = appMapHelper.legacy()
    full.apps.push({ name: 'nine', mount: 'nine', areas: [], web: 'nine-web', api: 'nine-api', index: 9 })
    full.apps.push({ name: 'two', mount: 'two', areas: [], web: 'two-web', api: 'two-api', index: 2 })
    expect(appMapHelper.nextIndex(full)).toBe(1)
    for (let index = 1; index <= TARGET_APP_MAX_INDEX; index++) {
      full.apps.push({ name: `a${index}`, mount: `a${index}`, areas: [], web: '', api: '', index })
    }
    expect(appMapHelper.nextIndex(full)).toBeNull()
  })

  test('the apps a story reaches — an unlisted area falls to main', () => {
    expect(appMapHelper.touchedBy(split(), ['operator', 'user']).map(app => app.name)).toEqual(['main', 'backoffice'])
    expect(appMapHelper.touchedBy(appMapHelper.legacy(), ALL).map(app => app.name)).toEqual(['main'])
    expect(appMapHelper.touchedBy(split(), [])).toEqual([])
  })

  test('home aliases follow the template: home, userHome, adminHome, operatorHome, camel for a custom key', () => {
    expect(STANDARD_AREAS.map(area => appMapHelper.homeKeyOf(area))).toEqual(['home', 'userHome', 'adminHome', 'operatorHome'])
    expect(appMapHelper.homeKeyOf({ key: 'partner-portal', kind: ProjectArea.User, segment: 'partners' })).toBe('partnerPortalHome')
  })

  test('the marker of an area, and the areas carrying one — none on the legacy map or the default split', () => {
    expect(appMapHelper.markerOf('field-ops')).toBe('project--field-ops')
    expect(appMapHelper.markedAreasOf(appMapHelper.legacy())).toEqual([])
    expect(appMapHelper.markedAreasOf(split())).toEqual([])
    const map = split()
    map.areas.push({ key: 'field-ops', kind: ProjectArea.Operator, segment: 'field', marker: 'project--field-ops' })
    map.areas.push({ key: 'partners', kind: ProjectArea.User, segment: 'partners' })
    expect(appMapHelper.markedAreasOf(map)).toEqual([
      { key: 'field-ops', kind: ProjectArea.Operator, segment: 'field', marker: 'project--field-ops' },
    ])
    // A story's own area: kept only for a custom key the map lists, of the story's kind.
    expect(appMapHelper.customKeyOf(map, ProjectArea.Operator, 'field-ops')).toBe('field-ops')
    expect(appMapHelper.customKeyOf(map, ProjectArea.User, 'field-ops')).toBeNull()
    expect(appMapHelper.customKeyOf(map, ProjectArea.User, 'nowhere')).toBeNull()
    expect(appMapHelper.customKeyOf(map, ProjectArea.User, 'user')).toBeNull()
    expect(appMapHelper.customKeyOf(map, ProjectArea.User, null)).toBeNull()
  })
})

describe('viable-common - app map validation', () => {
  const broken = (mutate: (map: AppMap) => void): string[] => {
    const map = split()
    mutate(map)

    return appMapHelper.validate(map)
  }
  const refuses = (mutate: (map: AppMap) => void, fragment: string): void => {
    const errors = broken(mutate)
    expect(errors.some(error => error.includes(fragment))).toBe(true)
  }

  test('guest belongs to main and is its home', () => {
    refuses(map => { map.apps[0].areas = ['user', 'guest'] }, 'guest area must be "main"\'s home')
    refuses(map => { map.apps[0].areas = ['user']; map.apps[1].areas.push('guest') }, 'guest area must be "main"\'s home')
    refuses(map => { map.areas = map.areas.filter(area => area.key !== 'guest'); map.apps[0].areas = ['user'] }, 'guest area is missing')
  })

  test('main exists at the root with index 0 and the legacy packages', () => {
    refuses(map => { map.apps[0].name = 'home' }, 'The app "main" is missing')
    refuses(map => { map.apps[0].mount = 'main' }, 'must be mounted at the host\'s root')
    refuses(map => { map.apps[0].index = 3 }, 'must hold index 0')
    refuses(map => { map.apps[0].web = 'main-web' }, 'packages must be "web" and "api"')
  })

  test('names, mounts, indices and packages are unique and well-formed', () => {
    refuses(map => { map.apps[2].name = 'admin'; map.apps[2].web = 'admin-web'; map.apps[2].api = 'admin-api' }, 'is listed twice')
    refuses(map => { map.apps[2].mount = 'admin' }, 'share the mount "/admin"')
    refuses(map => { map.apps[2].index = 1 }, 'share the index 1')
    refuses(map => { map.apps[1].name = 'Admin' }, 'a name is 2–16 lower-case letters')
    refuses(map => { map.apps[1].name = 'my-admin' }, 'a name is 2–16 lower-case letters')
    refuses(map => { map.apps[1].name = 'worker'; map.apps[1].web = 'worker-web'; map.apps[1].api = 'worker-api' }, 'the name is reserved')
    refuses(map => { map.apps[1].web = 'panel-web' }, 'its packages must be "admin-web" and "admin-api"')
  })

  test('reserved and ill-shaped mounts, an index outside 1..9, a second root', () => {
    for (const mount of ['api', 'dispatcher', 'frontoffice', 'assets', 'healtz', 'marketing-consent']) {
      expect(RESERVED_MOUNTS).toContain(mount)
      refuses(map => { map.apps[1].mount = mount }, 'is reserved')
    }
    // Reserved too, and not even a mount's shape.
    refuses(map => { map.apps[1].mount = '__reload' }, 'not one lower-case path segment')
    refuses(map => { map.apps[1].mount = 'Admin' }, 'not one lower-case path segment')
    refuses(map => { map.apps[1].mount = 'admin/panel' }, 'not one lower-case path segment')
    refuses(map => { map.apps[1].mount = '' }, 'only "main" is mounted at the host\'s root')
    refuses(map => { map.apps[1].index = 0 }, 'outside 1..9')
    refuses(map => { map.apps[1].index = 10 }, 'outside 1..9')
    refuses(map => { map.apps[1].index = 1.5 }, 'outside 1..9')
  })

  test('one app per area, every app area listed, every listed area served', () => {
    refuses(map => { map.apps[1].areas.push('user') }, 'served by both "main" and "admin"')
    refuses(map => { map.apps[1].areas.push('partner') }, 'serves "partner", which the map does not list')
    refuses(map => { map.apps[2].areas = [] }, 'serves no area')
    refuses(map => { map.areas.push({ key: 'partner', kind: ProjectArea.User, segment: 'partners' }) }, 'served by no app')
  })

  test('area keys, kinds, segments, labels and markers', () => {
    refuses(map => { map.areas[1].key = 'User' }, 'lower-case words joined by single hyphens')
    refuses(map => { map.areas.push({ key: 'a--b', kind: ProjectArea.User, segment: 'ab' }) }, 'lower-case words joined by single hyphens')
    refuses(map => { map.areas.push({ ...map.areas[1] }) }, 'is listed twice')
    refuses(map => { map.areas[1].kind = ProjectArea.Operator }, 'must be of the kind "user"')
    refuses(map => { map.areas[1].kind = 'partner' as ProjectArea }, 'of no known kind')
    refuses(map => { map.areas[1].segment = 'Front office' }, 'ill-shaped segment')
    refuses(map => { map.areas[3].segment = 'frontoffice' }, 'share the segment "frontoffice"')
    refuses(map => { map.areas[1].segment = 'api' }, 'reserved segment "api"')
    refuses(map => { map.areas[1].segment = '' }, 'needs a segment')
    refuses(map => { map.areas[1].label = 'x'.repeat(65) }, 'label')
    refuses(map => { map.areas[1].marker = 'project--admin' }, 'may only carry the marker "project--user"')
    expect(broken(map => { map.areas[1].label = 'My account'; map.areas[1].marker = 'project--user' })).toEqual([])
  })

  test('a public (guest-kind) area lives in main and carries no marker', () => {
    refuses(map => {
      map.areas.push({ key: 'showroom', kind: ProjectArea.Guest, segment: 'showroom' })
      map.apps[1].areas.push('showroom')
    }, 'only "main" serves public areas')
    refuses(map => {
      map.areas.push({ key: 'showroom', kind: ProjectArea.Guest, segment: 'showroom', marker: 'project--showroom' })
      map.apps[0].areas.push('showroom')
    }, 'carries no marker')
    expect(broken(map => {
      map.areas.push({ key: 'showroom', kind: ProjectArea.Guest, segment: 'showroom' })
      map.apps[0].areas.push('showroom')
    })).toEqual([])
  })

  test('a main area\'s own path never sits under another app\'s mount', () => {
    refuses(map => {
      map.areas.push({ key: 'reports', kind: ProjectArea.User, segment: 'reports' })
      map.apps[0].areas.push('reports')
      map.apps[1].mount = 'reports'
    }, 'is shadowed by the app "admin"')
  })

  test('at most ten apps, and nothing that is not a map', () => {
    refuses(map => {
      for (let index = 3; index <= 11; index++) {
        map.apps.push({ name: `app${index}`, mount: `m${index}`, areas: [], web: `app${index}-web`, api: `app${index}-api`, index })
      }
    }, 'at most 10 apps')
    expect(appMapHelper.validate(null as never)).toEqual(['The app map must list its areas and its apps.'])
  })
})

describe('viable-common - reading an app map out of untrusted data', () => {
  test('keeps what is shaped like an area or an app, and nothing else', () => {
    const map = split()
    expect(appMapHelper.narrow({ apps: map.apps, areas: map.areas })).toEqual(map)
    expect(appMapHelper.narrow({ apps: [...map.apps, { name: 'x' }, 7, null], areas: [...map.areas, { key: 'x', kind: 'nope', segment: '' }] }))
      .toEqual(map)
    // Areas absent read as the standard four; no `apps` list is no map at all.
    expect(appMapHelper.narrow({ apps: map.apps })?.areas).toEqual([...STANDARD_AREAS])
    expect(appMapHelper.narrow({ areas: map.areas })).toBeNull()
    expect(appMapHelper.narrow('apps')).toBeNull()
  })
})

describe('viable-common - the app-map record schemas', () => {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const decision = ajv.compile(ViableAppsDecisionSchema)
  const at = '2026-11-11T10:00:00.000Z'

  test('the legacy map and the default split are storable decisions', () => {
    expect(decision({ ...appMapHelper.legacy(), by: 'default', at })).toBe(true)
    expect(decision({ ...split(), by: 'request', quote: 'An admin app of its own.', at })).toBe(true)
    expect(decision({ ...split(), by: 'owner', quote: null, at })).toBe(true)
  })

  test('a decision refuses a stray key, an unknown decider, a fractional index and an ill-formed name', () => {
    expect(decision({ ...split(), by: 'default', at, reason: 'x' })).toBe(false)
    expect(decision({ ...split(), by: 'model', at })).toBe(false)
    expect(decision({ ...split(), by: 'default' })).toBe(false)
    const fractional = split()
    fractional.apps[1].index = 1.5
    expect(decision({ ...fractional, by: 'default', at })).toBe(false)
    const hyphen = split()
    hyphen.apps[1].name = 'my-admin'
    expect(decision({ ...hyphen, by: 'default', at })).toBe(false)
  })

  test('index is a number with multipleOf 1, never an integer type', () => {
    expect((AppDescriptorSchema as { properties: { index: Record<string, unknown> } }).properties.index)
      .toEqual({ type: 'number', minimum: 0, maximum: TARGET_APP_MAX_INDEX, multipleOf: 1 })
    expect(JSON.stringify([AreaDescriptorSchema, AppDescriptorSchema, SlotAppClaimSchema, ViableAppsDecisionSchema]))
      .not.toContain('"integer"')
  })

  test('a slot claim is closed and loose: no pattern refuses a name an agent may claim later', () => {
    const claim = ajv.compile(SlotAppClaimSchema)
    expect(claim({ name: 'main', mount: '', index: 0 })).toBe(true)
    expect(claim({ name: 'Future-App', mount: 'some/where', index: 12 })).toBe(true)
    expect(claim({ name: 'main', mount: '', index: 0, web: 'web' })).toBe(false)
    expect(claim({ name: 'main', mount: '', index: 0.5 })).toBe(false)
  })

  test('the barrel carries the vocabulary', () => {
    expect(barrel.appMapHelper).toBe(appMapHelper)
    expect(barrel.MAIN_APP).toBe('main')
    expect(barrel.STANDARD_AREAS).toBe(STANDARD_AREAS)
    expect(typeof barrel.ViableAppsDecisionSchema).toBe('object')
  })
})
