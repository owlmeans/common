import { AccessLevel } from '../dev/consts.js'

/**
 * The audiences a generated application serves.
 *
 * Every application has these four and only these four. A product's own roles are not new
 * areas — they fall into one of these: anyone acting on the product's business process from
 * the inside is an OPERATOR, anyone consuming the product's value as an end user is a USER.
 * The set is closed so that navigation, access and preview all key off the same vocabulary;
 * an application that needs a fifth audience needs a permission, not an area.
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
 * Where each area lives in the URL. One frontend, four prefixes — never four applications.
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
 * as {@link ALIAS_PREFIX_WEB_LAYOUT} was.
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
 * The operator area is where an organization's own staff work, and until this existed it was
 * declared `{ guards: DEFAULT_GUARD }` alone — any signed-in person, which for a generated application
 * means any visitor who typed an email address. The per-screen gates story development adds narrow
 * particular screens; they cannot narrow the area, and a project with nothing developed yet has
 * none of them at all, so the whole back office stood open by construction.
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
