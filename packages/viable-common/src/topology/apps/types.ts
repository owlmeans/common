import type { ProjectArea } from '../../areas/consts.js'
import type { AreaDescriptor, AreaKey } from '../../areas/types.js'
import type { TargetPackageDescriptor, TopologyDescriptor } from '../types.js'

/**
 * One APP of a target project: a web + api package pair served under its own path of the project's
 * one host, over the shared `common`, `backend` and `worker`.
 *
 * `main` is the app every project has — mount `''`, packages `web` and `api`, index 0 — and the only
 * app of a project with no apps record. Every other app is claimed once under an index 1..9 that is
 * never reused, because its ports derive from it.
 */
export interface AppDescriptor {
  /** `^[a-z][a-z0-9]{1,15}$` — no hyphen, so `<name>-web` is never ambiguous. */
  name: string
  /** One lower-case path segment, `''` for `main`. The app answers at `/<mount>` and `/<mount>/api`. */
  mount: string
  /** The area keys this app serves; `areas[0]` is its HOME area (its home screen carries `HOME`). */
  areas: AreaKey[]
  /** The web package's directory name under `sources/` — `web` for main, `<name>-web` otherwise. */
  web: string
  /** The api package's directory name under `sources/` — `api` for main, `<name>-api` otherwise. */
  api: string
  /** 0 for main, 1..9 otherwise; ports derive from it. */
  index: number
}

/** Where the default split puts one kind of area: an app of its own, at its own mount. */
export interface AppSplitTarget {
  name: string
  mount: string
}

/** A project's areas and the apps serving them. Absent everywhere ⇒ `appMapHelper.legacy()`. */
export interface AppMap {
  areas: AreaDescriptor[]
  apps: AppDescriptor[]
}

/**
 * The app map as the project card records it (`fields.apps`): the map plus where it came from.
 *
 * `by` says whether it is the platform's default split, a person's explicit request (then `quote` is
 * the requester's own sentence, verbatim) or the owner's later decision; `at` is when, an ISO time.
 */
export interface ViableAppsDecision extends AppMap {
  by: 'default' | 'request' | 'owner'
  quote?: string
  at: string
}

/**
 * The part of an app a SLOT pins (`slot.apps`): its name, its mount and the index its ports come
 * from. Also the least any runtime helper needs to address an app — an {@link AppDescriptor} is one.
 */
export interface SlotAppClaim {
  name: string
  mount: string
  index: number
}

/** Where one app answers, inside the slot and on the host. */
export interface AppEndpoints {
  app: string
  mount: string
  apiPort: number
  /** The preview web server's port. */
  webPort: number
  /** The production static server's port. */
  productionWebPort: number
  /** The api's base path, no leading slash — `api` or `<mount>/api`. */
  apiBase: string
  /** The web build's base — `/` or `/<mount>`. */
  webBase: string
}

// Kept as a type: a closed string union.
/** Which web server of an app is meant — the preview's (Rollup + reload) or production's static one. */
export type AppWebKind = 'preview' | 'production'

/** One path prefix of the host and the app side it reaches. */
export interface AppRoute {
  /** `/<mount>/api`, `/<mount>`, `/api` or `/`. */
  path: string
  side: 'web' | 'api'
  app: string
}

/** One port of the slot's Service, named `api-<index>` / `web-<index>` (≤ 15 characters). */
export interface AppServicePort {
  name: string
  port: number
  target: number
}

/** The environment an app's api process adds over the slot's own — main's is today's exactly. */
export interface AppApiEnv {
  BACKEND_PORT: string
  BACKEND_BASE_URL: string
  BASE_URL: string
}

/** The environment an app's web build adds over the slot's own — main's is today's exactly. */
export interface AppWebEnv {
  BACKEND_BASE_URL: string
  BASE_URL: string
}

/**
 * Everything about a project's apps that is a pure function of its app map — no IO, no context.
 *
 * Every runtime that must agree about an app (the agent, the publisher, the manager, the connector)
 * asks this one object, so a port, a base path or a route order is decided once.
 */
export interface AppMapHelper {
  /** The map of a project with no apps record: `main` at `''`, the four standard areas, guest first. */
  legacy: () => AppMap
  /** The map a card or a blueprint reference carries; absent or unusable ⇒ {@link legacy}. */
  of: (ref?: { apps?: AppMap | null } | null) => AppMap
  /**
   * Read a map out of untrusted data — a file's frontmatter, a wire body — STRUCTURALLY: entries
   * that are not shaped like an area or an app are dropped, rules are not applied ({@link validate}
   * does that). `areas` absent reads as the standard four. `null` when no `apps` list is present.
   */
  narrow: (data: unknown) => AppMap | null
  /** The map IS the legacy one: one app `main`, legacy-shaped, over exactly the standard areas. */
  isLegacy: (map: AppMap) => boolean
  /** The map's areas are exactly the four standard ones (keys = kinds, standard segments, no marker). */
  isStandardAreas: (map: AppMap) => boolean
  /**
   * The default split for the areas a project covers: guest + user → `main`, admin → `admin`
   * (mount `admin`), operator → `backoffice` (mount `backoffice`). Only the areas given (guest is
   * always added, first); unknown keys are ignored. Without admin and operator the answer is one
   * legacy-shaped `main` over the areas given.
   */
  defaultFor: (areas: AreaKey[]) => AppMap
  /** Every rule the map breaks, one sentence each; `[]` for a valid map. */
  validate: (map: AppMap) => string[]
  app: (map: AppMap, name: string) => AppDescriptor | null
  /** The app serving an area; `main` when no app lists it. */
  homeAppOf: (map: AppMap, areaKey: AreaKey) => AppDescriptor
  /**
   * The area under a key. A standard key the map does not list reads as its standard descriptor; an
   * unknown custom key reads as a signed-in user area at its own segment.
   */
  areaOf: (map: AppMap, key: AreaKey) => AreaDescriptor
  /**
   * The KIND of the area a key references — THE way every reader applying a kind rule (access, gates,
   * surface, analysis, scaffold defaults, the landing gate, navigation) gets one: never the key read as a
   * kind. A standard key is its own kind; a custom key is the kind the map gives it ({@link areaOf}).
   */
  kindOf: (map: AppMap, key: AreaKey) => ProjectArea
  /**
   * Whether `key` names an area of the project: a standard key always (an unlisted one reads as its
   * standard descriptor), a custom key only when the map lists it. What a writer checks a story's
   * `area` against before it is stored.
   */
  hasArea: (map: AppMap, key?: string | null) => boolean
  /**
   * The keys a story may reference on this map: the four standard keys in menu order, then the map's own
   * custom keys in map order — exactly the four standard keys for a map without a custom area.
   */
  keysOf: (map: AppMap) => AreaKey[]
  /** The area's route INSIDE its app's router: `/` for the app's home area, else `/<segment>`. */
  areaRouteOf: (map: AppMap, key: AreaKey) => string
  /**
   * The area's PUBLIC path on the host: `/` + join(mount, home ? '' : segment). The legacy map and
   * the default split both give exactly `AREA_PATHS`.
   */
  areaUrlOf: (map: AppMap, key: AreaKey) => string
  /** The area home screen's alias key: `home` for guest, else camel(key) + `Home` (`userHome`). */
  homeKeyOf: (area: AreaDescriptor) => string
  /** The marker permission an area under `key` may carry: `project--<key>`. */
  markerOf: (key: AreaKey) => string
  /**
   * The areas of the map that carry a marker — the permissions the project's client must declare (managed)
   * so the owner can grant them. `[]` for the legacy map and the default split.
   */
  markedAreasOf: (map: AppMap) => AreaDescriptor[]
  endpointsOf: (app: SlotAppClaim) => AppEndpoints
  /** `3000 + 10·index`. */
  apiPort: (app: SlotAppClaim) => number
  /** `5173 + index` (preview) / `8080 + index` (production). */
  webPort: (app: SlotAppClaim, kind: AppWebKind) => number
  /** `api` for main, `<mount>/api` otherwise — no leading slash. */
  apiBase: (app: SlotAppClaim) => string
  /** The api's `BASE_URL`: `''` for main, `<mount>` otherwise — never a leading slash. */
  appBase: (app: SlotAppClaim) => string
  /** The web build's `BASE_URL`: `/` for main, `/<mount>` otherwise. */
  webBuildBase: (app: SlotAppClaim) => string
  /** For main exactly today's publisher values: `{ BACKEND_PORT: '3000', BACKEND_BASE_URL: 'api', BASE_URL: '' }`. */
  apiEnvOf: (app: SlotAppClaim) => AppApiEnv
  /** For main exactly today's publisher values: `{ BACKEND_BASE_URL: 'api', BASE_URL: '/' }`. */
  webEnvOf: (app: SlotAppClaim) => AppWebEnv
  /** `/api/healtz` for main, `/<mount>/api/healtz` otherwise. */
  healthPath: (app: SlotAppClaim) => string
  /** The argv token telling an app's api process from its siblings; `null` for main. */
  marker: (app: SlotAppClaim) => string | null
  /** Every host prefix of the apps, longest first — `/<m>/api`, `/<m>`, …, `/api`, `/`. */
  routes: (apps: SlotAppClaim[]) => AppRoute[]
  /** The Service ports of the apps, in index order: `api-<i>` and `web-<i>` each. */
  servicePorts: (apps: SlotAppClaim[], kind: AppWebKind) => AppServicePort[]
  /** The topology packages of the EXTRA apps (`<app>-api`, `<app>-web`), each with `app` and `mount`. */
  packagesOf: (map: AppMap) => TargetPackageDescriptor[]
  /** The apps serving any of the areas, in index order. */
  touchedBy: (map: AppMap, areas: AreaKey[]) => AppDescriptor[]
  /** The next index to claim (one above the highest, else the lowest free); `null` when 1..9 are taken. */
  nextIndex: (map: AppMap) => number | null
  /** The apps a recorded topology names, main first; no or invalid apps ⇒ `[legacy main]`. */
  fromTopology: (meta: TopologyDescriptor | null) => AppDescriptor[]
  /** What a slot pins of each app, in index order. */
  claimsOf: (map: AppMap) => SlotAppClaim[]
}
