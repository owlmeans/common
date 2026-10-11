import type { Criteria, Sort } from '@owlmeans/resource'
import type { Document } from 'mongodb'

import type { MongoReference } from '../../types.js'

/** The portable criteria and sort vocabulary, as the documents a collection takes. */
export interface MongoCriteriaHelper {
  /**
   * Translate `Criteria<T>` into the filter a collection takes.
   *
   * Two passes: the shared operator vocabulary becomes mongo expressions, then
   * `mongoRefHelper.marshalCriteria` converts the values addressed at `_id` or at a declared
   * reference into `ObjectId`s and maps the `id` alias onto `_id`. Both halves are needed — a
   * criteria object carries string ids and portable operators, a collection stores neither.
   *
   * An empty result is an empty filter, which matches everything. Callers that must not act on
   * "everything" — `purge` — check for it themselves.
   *
   * @throws {UnsupportedArgumentError}
   */
  criteriaToFilter: (criteria: Criteria<any> | undefined, refs: Map<string, MongoReference>) => Document
  /**
   * Translate `Sort<T>[]` into a mongo sort document. A bare field name is ascending, and `id`
   * addresses `_id` — documents never store an `id` field, so sorting by the name records carry
   * would silently order by nothing.
   */
  sortToMongo: (sort?: Sort<any>[]) => Document | undefined
}
