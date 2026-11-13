import { ProjectArea } from '../../areas/consts.js'
import { TARGET_API_BASE, TARGET_API_PORT, TARGET_WEB_PORT } from '../../slot/consts.js'
import type { AppSplitTarget, ViableAppsDecision } from './types.js'

/** The app every project has, and the only one of a project with no apps record. */
export const MAIN_APP = 'main'

/** What an app may be called — no hyphen, so `<name>-web` and `<name>-api` are never ambiguous. */
export const APP_NAME_PATTERN = /^[a-z][a-z0-9]{1,15}$/

/**
 * Names no app may take: the shared packages' and main's directory names. `main` itself stays valid
 * — it is the legacy app's name, and only the index-0 app at mount `''` may carry it.
 */
export const RESERVED_APP_NAMES: readonly string[] = Object.freeze(['common', 'backend', 'api', 'web', 'worker'])

/** What an app's mount may be: ONE lower-case path segment (`''` is main's alone). */
export const TARGET_APP_MOUNT_PATTERN = /^[a-z][a-z0-9-]{0,30}$/

/** A mount as a record stores it: one segment, or `''` for main. */
export const TARGET_APP_MOUNT_OR_ROOT_PATTERN = /^(?:[a-z][a-z0-9-]{0,30})?$/

/**
 * Mounts no app may take, and segments no area may take: the paths main's api, the sign-in hand-off
 * (the dispatcher, the surrogate login window, the framework's authentication screens), the legal
 * pages, the reload channel, the static assets and the platform's own routes already answer at — and
 * main's user area. Every app's own router answers at the sign-in paths too (each app signs in on its
 * own), so an area of any app is held to the list, a standard area at its standard segment excepted.
 */
export const RESERVED_MOUNTS: readonly string[] = Object.freeze([
  'api', 'dispatcher', 'consent', 'terms', 'privacy', 'cookies', '__reload', 'robots.txt', 'assets',
  'healtz', 'oidc', 'iam', 'frontoffice', 'marketing-consent', 'privacy-choices', 'surrogate', 'authentication',
])

/** The highest index an app may claim — index 10 would put its api on the boot check's port. */
export const TARGET_APP_MAX_INDEX = 9

/** The most apps one project has — main plus one per index. */
export const TARGET_APP_MAX_APPS = TARGET_APP_MAX_INDEX + 1

/** The most areas one project's map carries. */
export const TARGET_AREA_MAX = 16

/** The longest requester sentence an apps decision quotes. */
export const APPS_QUOTE_MAX = 1024

/** Who decided an app map: the platform's default split, a person's explicit request, the owner later. */
export const APPS_DECISION_SOURCES: readonly ViableAppsDecision['by'][] = Object.freeze(['default', 'request', 'owner'])

/** What an app's web/api package directory may be called. */
export const APP_PACKAGE_DIR_PATTERN = /^[a-z][a-z0-9-]{0,63}$/

/** main's packages — the legacy layout's web and api. */
export const MAIN_APP_WEB = 'web'
export const MAIN_APP_API = 'api'

/** An extra app's packages are `<name>` + these. */
export const APP_WEB_SUFFIX = '-web'
export const APP_API_SUFFIX = '-api'

/** Ports: api `3000 + 10·index`; preview web `5173 + index`; production web `8080 + index`. */
export const TARGET_APP_API_PORT_BASE = TARGET_API_PORT
export const TARGET_APP_API_PORT_STEP = 10
export const TARGET_APP_WEB_PORT_BASE = TARGET_WEB_PORT
export const TARGET_APP_WEB_PORT_STEP = 1
/** The production static server's port of main — the publisher's `FRONTEND_PORT`. */
export const TARGET_PRODUCTION_WEB_PORT = 8080
export const TARGET_APP_PRODUCTION_WEB_PORT_BASE = TARGET_PRODUCTION_WEB_PORT
export const TARGET_APP_PRODUCTION_WEB_PORT_STEP = 1

/** main's api base, no leading slash — the template's `BACKEND_BASE_URL`. */
export const TARGET_APP_API_BASE = TARGET_API_BASE

/** The target's health route, under an api base. */
export const TARGET_HEALTH_ROUTE = 'healtz'

/** The argv token prefix telling an app's api from its siblings: `--viable-app=<name>`. */
export const TARGET_APP_MARKER_PREFIX = '--viable-app='

/**
 * The default split for a new project: the signed-in back-of-house areas each get an app of their
 * own; guest and user stay in `main`.
 */
export const APP_DEFAULT_SPLIT: Readonly<Partial<Record<ProjectArea, AppSplitTarget>>> = Object.freeze({
  [ProjectArea.Admin]: Object.freeze({ name: 'admin', mount: 'admin' }),
  [ProjectArea.Operator]: Object.freeze({ name: 'backoffice', mount: 'backoffice' }),
})
