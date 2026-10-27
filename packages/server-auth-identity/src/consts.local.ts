/**
 * How long a resolution is trusted without re-reading the registry.
 *
 * Every authenticated request resolves an entity, so an uncached resolver would put a database
 * round-trip in front of the whole API. The cost of the cache is a rename taking up to this long
 * to be seen by other replicas — which is survivable precisely because the old slug keeps
 * resolving through `formerSlugs` rather than failing.
 */
export const CACHE_TTL = 30_000

/**
 * The fields of an organization group a field-level update may write. `service` and `key` are the
 * group's identity and are never rewritten in place.
 */
export const ORG_GROUP_FIELDS = ['title', 'managed', 'permissions', 'bundles'] as const
