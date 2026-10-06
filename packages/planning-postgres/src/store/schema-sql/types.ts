/** The schema table's own statements over one runner — the write's own transaction. */
export interface SchemaSqlHelper {
  /** The scope's uniqueness expression — the one the `…_scope` index is built on. */
  scopeTarget: () => string
  /**
   * Bump an organization's schema revision — its private `head` row, created at 1 — and answer the
   * new value. Runs inside the write's own transaction, so the revision moves exactly when it commits.
   */
  bumpRevision: (entityId: string, at: string, id: () => string) => Promise<number>
  /** Remove the layers of the given projects inside a transaction; answers how many records went. */
  purgeSchemaLayers: (entityId: string, projects: readonly string[]) => Promise<number>
}
