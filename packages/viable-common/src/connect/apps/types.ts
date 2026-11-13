import type { AppMap } from '../../topology/apps/types.js'

/**
 * One application of a project as a connector reads it: where it answers on the project's host, the
 * areas it serves and — for a cloud preview — what its interface build and its server are doing.
 *
 * Every live field is a plain string and optional: this view crosses a version skew, a newer platform
 * may answer a phase or a verdict an older connector has never heard of, and a project whose tree
 * lives on somebody's machine carries none of them (the platform never claims to know about a process
 * it does not supervise).
 */
export interface ConnectAppView {
  /** `main`, or an app the project's map names (`^[a-z][a-z0-9]{1,15}$`). */
  name: string
  /** One path segment, `''` for `main` — the app answers at `/<mount>` and its api at `/<mount>/api`. */
  mount: string
  /** The area keys this app serves; the first is its home area. */
  areas: string[]
  /** It is the project's `main` app — the one at the host's root. */
  main: boolean
  /** Where the app answers: the preview's address under the mount, or the local server's. */
  url?: string
  /** The interface build's verdict — `pending`, `ok`, `stale` or `failed` today. */
  build?: string
  /** The server's phase — `idle`, `building`, `starting`, `running`, `crashed`, `failed` or `waiting` today. */
  backend?: string
  /** Why the server is not serving, capped — a build error, a start error or what it waits for. */
  cause?: string
  /** What kind of cause — `build`, `start` or `config` today. */
  causeKind?: string
  /** Work for this app is still in flight (a build, a start, a wait the publisher will end itself). */
  pending?: boolean
}

/**
 * One AREA of a project as a connector reads it — what a story's `area` names, and where it lives.
 *
 * Plain strings for the version skew: a newer platform may answer a kind an older connector has never
 * heard of.
 */
export interface ConnectAreaView {
  /** The area's key — the value a story's `area` takes (`create_story`, the planning routes). */
  key: string
  /** Its kind — `guest`, `user`, `admin` or `operator` today; access and surface follow it. */
  kind: string
  /** Its path segment inside its app; `''` for an app's home area at the app's root. */
  segment: string
  /** The app serving it, by name. */
  app: string
  /** Its public path on the project's host — `/`, `/frontoffice`, `/admin`, `/partners`. */
  path: string
  /** What a person reads for it, when the area carries a label of its own. */
  label?: string
  /** The permission a signed-in custom area demands (`project--<key>`); absent — its kind's gate alone. */
  marker?: string
}

/**
 * A project's applications — the answer of `connect.project.apps` and of a per-app restart.
 *
 * `recorded` false is the project every project without an apps record is: one app, `main`, over the
 * four standard areas. `local` is a project whose tree lives on a developer's machine: the map alone.
 */
export interface ConnectAppsView {
  projectId: string
  local: boolean
  /** The project records its apps (its card's decision, or its preview's claim). */
  recorded: boolean
  /** Every app, `main` first, then by index. */
  apps: ConnectAppView[]
  /**
   * Every area of the project, the four standard ones first, then the map's own in map order — absent
   * from a platform answering before areas were listed.
   */
  areas?: ConnectAreaView[]
  /** The one worker of a split project, when the preview reports it. */
  worker?: { phase?: string }
}

/** `connect.sandbox.restartApp`'s path: the project, and one of its apps by name. */
export interface ConnectAppParams {
  id: string
  app: string
}

/**
 * `connect.sandbox.restartApp`'s body: which sides of the app to restart. Absent fields are the
 * platform's default — the app's server (api) alone.
 */
export interface ConnectAppRestartBody {
  api?: boolean
  web?: boolean
}

/** The parts of the apps view that are a pure function of the project's app map. */
export interface ConnectAppsHelper {
  /**
   * Every area a story may reference on the map (`appMapHelper.keysOf`) as the view lists it: key,
   * kind, segment, serving app, public path, and the label and marker it carries.
   */
  areasOf: (map: AppMap) => ConnectAreaView[]
}
