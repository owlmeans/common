/** The aliases one planning tree answers under — every one derived from the mount's base alias. */
export interface PlanningAliases {
  readonly base: string
  readonly schema: { readonly list: string }
  readonly card: {
    readonly list: string
    readonly summary: string
    readonly get: string
    readonly transitions: string
    readonly specifications: string
  }
  readonly spec: { readonly get: string, readonly revisions: string }
  readonly link: { readonly list: string }
  readonly transition: { readonly get: string }
  readonly execute: string
  readonly commit: { readonly get: string, readonly events: string }
}

/** The aliases of the leaves a tree gains with `definitions: true`. */
export interface PlanningDefinitionAliases {
  readonly define: string
}

export interface PlanningAliasHelper {
  /**
   * The aliases one planning tree answers under, derived from the mount's base alias.
   *
   * Two mounts of the tree in one deployment are two base aliases, never two copies of this table —
   * which is why nothing here is a global constant.
   */
  planningAliases: (base: string) => PlanningAliases
  /**
   * The aliases of the leaves a tree gains with `definitions: true` — kept apart from
   * {@link PlanningAliasHelper.planningAliases} so a tree declared without them names no alias it
   * does not declare.
   */
  planningDefinitionAliases: (base: string) => PlanningDefinitionAliases
}
