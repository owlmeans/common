import { AccessLevel } from '../dev/consts.js'
import type { AreaDescriptor, ProjectTenancy } from './types.js'

/**
 * The KINDS of audience a generated application serves — and the keys of its four standard areas.
 *
 * The set of kinds is closed: four and only four. A product's own roles are not new kinds — they
 * fall into one of these: anyone acting on the product's business process from the inside is an
 * OPERATOR, anyone consuming the product's value as an end user is a USER. Navigation, access and
 * every analysis rule key off the kind, so a kind-keyed table ({@link AREA_PATHS},
 * {@link AREA_ACCESS}, {@link AREA_TIER}) stays total over exactly these values.
 *
 * Areas themselves are per-project data ({@link AreaDescriptor}): the four standard ones are keyed
 * by their kind ({@link STANDARD_AREAS}), and a custom area — only on an explicit request — is an
 * instance of one of these kinds under a key of its own. An `area` field everywhere keeps holding
 * the KIND; an optional `areaKey` beside it names a custom instance (absent ⇒ key = kind).
 */
export enum ProjectArea {
  /** Unauthenticated. The public face of the application. */
  Guest = 'guest',
  /** Signed-in end users — the front office. */
  User = 'user',
  /** The owner. Holds {@link ADMIN_PERMISSION} and passes every gate. */
  Admin = 'admin',
  /** Staff running the business process — the back office. */
  Operator = 'operator',
}

/**
 * Where each standard area lives in the URL of a project with no apps record — one frontend, four
 * prefixes (the legacy app map, `appMapHelper.legacy()`). A project split into apps addresses an
 * area through `appMapHelper.areaUrlOf`, which gives exactly these four for the legacy map and for
 * the default split alike.
 *
 * The guest area owns `/` because it is the only area an anonymous visitor can reach, so it
 * has to be what a bare hostname serves.
 */
export const AREA_PATHS: Record<ProjectArea, string> = {
  [ProjectArea.Guest]: '/',
  [ProjectArea.User]: '/frontoffice',
  [ProjectArea.Admin]: '/admin',
  [ProjectArea.Operator]: '/backoffice',
}

/** Areas in menu/footer order — guest first, then the authenticated ones. */
export const PROJECT_AREAS: ProjectArea[] = [
  ProjectArea.Guest, ProjectArea.User, ProjectArea.Admin, ProjectArea.Operator
]

/**
 * The prefix of an AREA entrypoint — the parent every screen of that area hangs under.
 *
 * An area is addressed like a screen and rendered by the same router, so it has to be
 * excluded explicitly wherever "the entrypoint of this screen" is being resolved — exactly
 * as {@link ALIAS_PREFIX_WEB_LAYOUT} is.
 */
export const ALIAS_PREFIX_WEB_AREA = 'web:area:'

/**
 * The owner's marker permission.
 *
 * It is a MARKER, not a scope: holding it means passing every gate, because the owner of a
 * project is not a role inside it. A "limited admin" is therefore not this — it is an
 * ordinary user holding some of the project's own permissions.
 *
 * Spelled as `<resource>--<action>` like every generated permission, on a resource name no
 * domain entity can take.
 */
export const ADMIN_PERMISSION = 'project--admin'

/**
 * The back office's marker permission.
 *
 * The operator area is where an organization's own staff work. Declared `{ guards: DEFAULT_GUARD }`
 * alone it would admit any signed-in person, which for a generated application means any visitor
 * who typed an email address. The per-screen gates story development adds narrow particular
 * screens; they cannot narrow the area, and a project with nothing developed yet has none of them
 * at all, so without the marker the whole back office stands open by construction.
 *
 * It is a MARKER like {@link ADMIN_PERMISSION}, but it is NOT a bypass: it says a person belongs in
 * the back office, and each screen's own permission still decides what they may do there. That AND
 * is expressed by the area declaring the marker and the screen declaring its own — never by adding
 * the marker to a screen's gate, where the OR between gate params would make it sufficient on its
 * own and the screen's permission would stop meaning anything.
 *
 * Granted by the platform to the owning organization's people, exactly as the owner marker is, and
 * to nobody else by default: a customer of the generated app is not staff.
 */
export const OPERATOR_PERMISSION = 'project--operator'

/**
 * The access an area implies for the screens under it.
 *
 * Screens INHERIT this from the area declaration and never restate it. Only the operator
 * area needs anything per screen — its gate names which permission that particular screen
 * demands, which is the one thing an area cannot know.
 */
export const AREA_ACCESS: Record<ProjectArea, AccessLevel> = {
  [ProjectArea.Guest]: AccessLevel.Guest,
  [ProjectArea.User]: AccessLevel.User,
  [ProjectArea.Admin]: AccessLevel.Admin,
  [ProjectArea.Operator]: AccessLevel.Permissioned,
}

/**
 * The grouping tag a story's area gives the permissions it declares.
 *
 * A TAG on the permission definition, never a segment of the permission's name. The gate treats a
 * name as one opaque string, so putting a tier inside it would buy nothing at request time while
 * making every existing permission a different permission — orphaning every grant already made
 * against it, with no way to migrate the grant across.
 *
 * Two areas declare nothing. Guest is public and needs no permission. Admin's whole rule is
 * {@link ADMIN_PERMISSION}, which the platform grants and no story ever registers.
 */
export const AREA_TIER: Record<ProjectArea, string | null> = {
  [ProjectArea.Guest]: null,
  [ProjectArea.User]: ProjectArea.User,
  [ProjectArea.Admin]: null,
  [ProjectArea.Operator]: ProjectArea.Operator,
}

/** The longest requester sentence a tenancy decision quotes — a card refuses a longer one. */
export const TENANCY_QUOTE_MAX = 1024

/** The longest word an origin's tenant facts carry — a label, a key field, a record name. */
export const ORIGIN_TENANCY_WORD_MAX = 64

/** The most key fields, or people records, an origin's tenant facts carry. */
export const ORIGIN_TENANCY_LIST_MAX = 8

/** A single-organization application — what every project is until a decision says otherwise. */
export const NO_TENANCY: ProjectTenancy = Object.freeze({ operators: false, users: false })

/**
 * The four standard areas, in menu order — what every project has unless its apps record says
 * otherwise. Keys are the kinds; the segments are the tails of {@link AREA_PATHS} (the guest area is
 * served at its app's root, so it carries `''`).
 */
export const STANDARD_AREAS: readonly AreaDescriptor[] = Object.freeze([
  Object.freeze({ key: ProjectArea.Guest, kind: ProjectArea.Guest, segment: '' }),
  Object.freeze({ key: ProjectArea.User, kind: ProjectArea.User, segment: 'frontoffice' }),
  Object.freeze({ key: ProjectArea.Admin, kind: ProjectArea.Admin, segment: 'admin' }),
  Object.freeze({ key: ProjectArea.Operator, kind: ProjectArea.Operator, segment: 'backoffice' }),
])

/**
 * What an area key may be: lower-case letters and digits in hyphen-separated words, starting with
 * a letter — never a double hyphen, because a custom area's marker permission is `project--<key>`
 * and `--` is that name's separator.
 */
export const AREA_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/** The longest area key. */
export const AREA_KEY_MAX = 32

/**
 * What an area's marker permission is spelled from: `project--<key>` — the resource every platform
 * marker shares ({@link ADMIN_PERMISSION}, {@link OPERATOR_PERMISSION}), the area key as its action.
 */
export const AREA_MARKER_PREFIX = 'project--'

/** What an area's path segment may be: one lower-case segment, or `''` for an app's home area. */
export const AREA_SEGMENT_PATTERN = /^(?:[a-z][a-z0-9-]{0,30})?$/

/** The longest label an area carries. */
export const AREA_LABEL_MAX = 64

/** What a person reads for an area of each kind when the area carries no label of its own. */
export const AREA_DEFAULT_LABELS: Record<ProjectArea, string> = {
  [ProjectArea.Guest]: 'Home',
  [ProjectArea.User]: 'My account',
  [ProjectArea.Admin]: 'Administration',
  [ProjectArea.Operator]: 'Back office',
}
