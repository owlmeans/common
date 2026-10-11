import type { AccessLevel, PermissionDefault } from "./consts.js"

export interface SourceFile {
  path: string
  code: string
}

export interface PossibleSourceFile extends Partial<SourceFile> {
  path: string
}

export interface FileBlock {
  files: string[]
  why?: string
}

export interface AccessBlock {
  /**
   * The gate parameters this protocol requires, written exactly as they appear in its
   * `gate: { alias: OIDC_GATE, params: [...] }` option: `<resource>--<action>`, optionally suffixed
   * `@<routeParam>` to bind
   * the check to one resource instance.
   *
   * The selector lives in the STRING rather than in a sibling field, because that is what the model
   * produces however the field is described to it — and because the array is then the gate's
   * argument verbatim, so what was described and what gets written cannot disagree about scoping.
   *
   * The `@` is the gate's syntax alone. It is stripped before a permission is registered or granted:
   * a definition stored under a name containing one is a key nothing looks up, and every grant made
   * against it is a silent no-op.
   */
  permissions: string[]
  level: AccessLevel
  /** Gate params safe for every newly signed-in user; a subset of permissions. */
  defaultEnabledPermissions?: string[]
  /**
   * The default class of each permission this block names, keyed by the gate param with its
   * `@<routeParam>` selector stripped — the name the definition is registered under.
   *
   * Written by CODE, never by a model: `AccessBlockSchema` does not carry it, so a model answer
   * never holds one, and what decides it is the project's tenancy and the area, not a reading of
   * the story.
   */
  defaults?: Record<string, PermissionDefault>
  /**
   * Whether the permissions of this block are bound to the organization being acted in, rather than
   * held everywhere. Written by code, like {@link AccessBlock.defaults}.
   */
  entityScoped?: boolean
}

/**
 * Access rules keyed by ENTRYPOINT ALIAS — never by URL or route path. The alias prefix decides
 * which side a rule is applied on (`api:` = endpoint, anything else = screen); see
 * `ALIAS_PREFIX_API`.
 */
export interface AccessList extends Record<string, AccessBlock> {
}

/** One entrypoint as the pipeline refers to it: the alias to address it by, and where it lands. */
export interface EntrypointRef {
  alias: string
  path: string
}
