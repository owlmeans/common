/**
 * Operators mongo speaks natively and that mean the same thing here as they do in SQL and in
 * the in-memory engine. Everything else in the shared vocabulary is rewritten below into a
 * mongo expression with the same meaning — a criteria object has to answer identically
 * whichever store it reaches.
 */
export const NATIVE = new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$regex'])

/** What the SERVER reports about an index rather than what a declaration asks for — never a
 *  reason to recreate one. `collation` is here because a collection's default collation is
 *  reported on every index in it, including the ones declared without any. */
export const REPORTED_FIELDS = new Set([
  'v', 'ns', 'name', 'collation', 'textIndexVersion', '2dsphereIndexVersion', 'background'
])

// Collection names must use only alphanumeric characters, underscore, and hyphen — no
// colons or other delimiters. This guard enforces the rule for every collection created
// through makeMongoResource across all projects (common/internal/app), failing fast at
// initialization rather than silently creating a badly-named collection.
export const VALID_COLLECTION_NAME = /^[a-zA-Z0-9_-]+$/

/**
 * The only shape a stored reference is converted from. Deliberately stricter than
 * `ObjectId.isValid`, which also accepts any 12 character string and would silently
 * swallow short business keys.
 */
export const HEX24 = /^[0-9a-fA-F]{24}$/

/**
 * Operators whose operand is never an id — a 24 hex string under `$regex` is a pattern,
 * not a reference.
 */
export const OPAQUE_OPERATORS = ['$regex', '$options', '$type', '$size', '$mod', '$exists', '$where']

export const LOGICAL_OPERATORS = ['$and', '$or', '$nor']
