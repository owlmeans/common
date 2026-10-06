/**
 * How long a resolution is trusted without re-reading the registry.
 *
 * Every authenticated request resolves an entity, so an uncached resolver would put a database
 * round-trip in front of the whole API. The cost of the cache is a rename taking up to this long
 * to be seen by other replicas — which is survivable precisely because the old slug keeps
 * resolving through `formerSlugs` rather than failing.
 */
export const CACHE_TTL = 30_000
