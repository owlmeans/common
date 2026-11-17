import type { ErrorObject } from 'ajv'

/** A pruned copy of a refused answer, and the JSON pointers that were nulled or deleted. */
export interface PrunedAnswer<T> {
  value: T
  paths: string[]
}

/** One node of a JSON schema, as the pruner reads it. */
export interface SchemaNode {
  [keyword: string]: unknown
}

/** One edit of a pruned answer. */
export interface PruneTarget {
  segments: string[]
  /** `null`: the node allows null; `delete`: its object does not require the key. */
  action: 'null' | 'delete'
}

/** Dropping from a refused answer what its schema allows to be missing. */
export interface PruneUtils {
  /**
   * Prune `value` (never edited — a copy is answered) so that none of the schema's `errors` stays:
   * along each error's path (a `required` or `additionalProperties` error starts at the property's
   * own path), from the deepest node up, the first node that is `nullable` or allows type `null` is
   * set to `null`, else the first key its object does not require is deleted — an
   * `anyOf`/`oneOf`/`allOf` node as a whole, since no branch can be told. An array item is never
   * pruned, nor anything that holds one. `null` when some error has no such node; the caller still
   * validates what comes back.
   */
  prune: <T>(schema: unknown, value: T, errors: readonly ErrorObject[]) => PrunedAnswer<T> | null
}
