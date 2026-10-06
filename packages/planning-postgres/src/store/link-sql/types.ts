import type { Relationship, RelationshipWhere } from '@owlmeans/planning'
import type { ListResult } from '@owlmeans/resource'

/** The link table's own statements over one runner — so they run inside a fold's transaction. */
export interface LinkSqlHelper {
  /** Edges by fixed fields — this package's own statement, so it runs inside a fold's transaction. */
  listLinks: (where: RelationshipWhere) => Promise<ListResult<Relationship>>
  /** One edge per `(from, to, type)`: an existing one is answered as it is. */
  putLink: (link: Relationship, id: () => string) => Promise<Relationship>
  /** @throws {PlanningError} `links:drop-empty` for a where naming nothing but the organization */
  dropLinks: (where: RelationshipWhere) => Promise<number>
}
