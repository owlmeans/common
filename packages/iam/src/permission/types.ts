import type { GateParamProblem } from '../gate/types.js'

/** A permission NAME taken apart. Never carries a selector — `@` is the gate's syntax alone. */
export interface ParsedPermissionName {
  /** The whole name, exactly as it must be stored and granted. */
  name: string
  /** What IAM stores as `resource`. The whole name when there is no action separator. */
  resource: string
  /** What IAM stores as `action`. Absent for a bare, unsplittable legacy name. */
  action?: string
  /** Set when the argument carried an `@` — which a NAME never legally does. */
  problem?: GateParamProblem
}

/** Permission NAMES: `<resource>--<action>`, never carrying a gate selector. */
export interface PermissionNameHelper {
  /**
   * Read a permission NAME.
   *
   * The name is `<resource>--<action>`, with TWO hyphens. One hyphen is not a separator: `enquiry-view`
   * is a resource called `enquiry-view` carrying no action, and it must keep parsing that way — a name
   * already granted somewhere cannot be re-interpreted without orphaning the grant.
   *
   * A name never carries a gate selector. `@` is the gate's syntax, and a name containing one is
   * exactly the corruption this function exists to make visible, so it is reported through `problem`
   * rather than quietly split.
   */
  parsePermissionName: (name: string) => ParsedPermissionName
  /** Compose a permission name. The inverse of `parsePermissionName`. */
  composePermissionName: (parts: { resource: string, action?: string }) => string
  /** True when the value is a usable permission name — well-formed and carrying no gate selector. */
  isPermissionName: (value: string) => boolean
}
