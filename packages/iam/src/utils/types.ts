export interface HasPermissionOptions {
  /** Restrict the check to PermissionSets of this scope (the project's clientId). */
  scope?: string
  /** Resource-scoped check: the set must list this id — unless the set itself is unscoped. */
  resourceId?: string
  /**
   * The organization the request acts in. A set bound to an organization (one carrying
   * `entitySlug`) counts only when this names that same organization.
   */
  entitySlug?: string
}
