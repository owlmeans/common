import type { AccessLevel } from "./consts.js"

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
   * The gate parameters this entrypoint requires, written exactly as they appear in
   * `gate(OIDC_GATE, [...])`: `<resource>--<action>`, optionally suffixed `@<routeParam>` to bind
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
