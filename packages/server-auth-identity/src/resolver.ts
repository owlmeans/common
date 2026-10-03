import { appendContextual } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { Criteria } from '@owlmeans/resource'
import type { EntityResolverService, OrgEntityRef } from '@owlmeans/auth-common'
import { ENTITY_RESOLVER, ENTITY_SLUG_PATTERN } from '@owlmeans/auth-common'
import { generateWordSlug, nextSlugCandidate } from '@owlmeans/basic-ids'
import type { OrgEntity, OrgEntityResource } from './types.js'
import { AUTH_IDENTITY_ORG_ENTITY, MAX_ENTITY_SLUG_ATTEMPTS, MAX_GUARDED_UPDATE_ATTEMPTS } from './consts.js'
import { idFilter, isDuplicateKey } from './native.js'

type Context = ServerContext<ServerConfig>

/**
 * How long a resolution is trusted without re-reading the registry.
 *
 * Every authenticated request resolves an entity, so an uncached resolver would put a database
 * round-trip in front of the whole API. The cost of the cache is a rename taking up to this long
 * to be seen by other replicas — which is survivable precisely because the old slug keeps
 * resolving through `formerSlugs` rather than failing.
 */
const CACHE_TTL = 30_000

/**
 * A stored record as the contract exposes it. Persisted records always carry an id. The cache keeps
 * only this: the record itself carries groups and minted names nobody resolving a request needs.
 */
const toRef = (entity: OrgEntity | null): OrgEntityRef | null =>
  entity == null ? null : {
    id: entity.id!, slug: entity.slug, formerSlugs: entity.formerSlugs, iamKey: entity.iamKey,
  }

interface CacheEntry {
  entity: OrgEntityRef | null
  at: number
}

export const makeEntityResolverService = (
  alias: string = ENTITY_RESOLVER
): EntityResolverService => {
  // Keyed by every name a caller might arrive with — id, slug, former slug, iamKey — so a hit
  // costs one lookup regardless of which one it was.
  const cache = new Map<string, CacheEntry>()
  const now = () => Date.now()

  const remember = (entity: OrgEntityRef | null, ...keys: string[]): OrgEntityRef | null => {
    const at = now()
    for (const key of keys) {
      if (key !== '') cache.set(key, { entity, at })
    }
    if (entity != null) {
      cache.set(entity.id, { entity, at })
      cache.set(entity.slug, { entity, at })
      cache.set(entity.iamKey, { entity, at })
      for (const former of entity.formerSlugs ?? []) cache.set(former, { entity, at })
    }

    return entity
  }

  const forget = (entity: OrgEntityRef) => {
    for (const key of [entity.id, entity.slug, entity.iamKey, ...(entity.formerSlugs ?? [])]) {
      cache.delete(key)
    }
  }

  const resource = (): OrgEntityResource =>
    (service.ctx as Context).resource<OrgEntityResource>(AUTH_IDENTITY_ORG_ENTITY)

  const load = async (value: string): Promise<OrgEntityRef | null> => {
    const cached = cache.get(value)
    if (cached != null && now() - cached.at < CACHE_TTL) {
      return cached.entity
    }

    const res = resource()
    // Id first: an id is authoritative, so a slug that happens to look like some other entity's
    // id can never shadow it. A value that is not a record id simply misses. Then the current
    // slug, then the names it has retired, then the frozen key external systems still quote.
    const byId = await res.load(value)
    if (byId != null) return remember(toRef(byId), value)

    const candidates: Criteria<OrgEntity>[] = [
      { slug: value },
      { formerSlugs: { $contains: [value] } },
      { iamKey: value },
    ]
    for (const where of candidates) {
      const found = await res.load(where)
      if (found != null) return remember(toRef(found), value)
    }

    return remember(null, value)
  }

  const service: EntityResolverService = appendContextual<EntityResolverService>(alias, {
    resolve: async value => await load(value),

    byId: async id => remember(toRef(await resource().load(id)), id),

    mintSlug: async () => {
      const res = resource()
      // A word slug is picked from 2^22 pairs, so a collision is rare — but "rare" is not "never"
      // once an installation has many organizations, and the numeric suffix keeps the readable
      // name rather than rerolling into an unrelated one.
      for (let attempt = 1; attempt <= MAX_ENTITY_SLUG_ATTEMPTS; ++attempt) {
        const base = generateWordSlug()
        for (let suffix = 1; suffix <= 3; ++suffix) {
          const candidate = nextSlugCandidate(base, suffix)
          const taken = await res.load({
            $or: [{ slug: candidate }, { formerSlugs: { $contains: [candidate] } }],
          })
          if (taken == null) return candidate
        }
      }

      throw new SyntaxError('entity:slug-exhausted')
    },

    rename: async (id, slug) => {
      if (!ENTITY_SLUG_PATTERN.test(slug)) {
        throw new SyntaxError(`entity:slug-malformed:${slug}`)
      }

      const res = resource()
      for (let attempt = 0; attempt < MAX_GUARDED_UPDATE_ATTEMPTS; ++attempt) {
        const entity = toRef(await res.get(id))!
        if (entity.slug === slug) {
          return remember(entity)!
        }

        // A slug another entity has ever answered to cannot be taken: tokens and third-party
        // records quoting it would start resolving to the wrong organization.
        const taken = await res.load({
          $or: [{ slug }, { formerSlugs: { $contains: [slug] } }],
        })
        if (taken != null && taken.id !== id) {
          throw new SyntaxError(`entity:slug-taken:${slug}`)
        }

        const formerSlugs = [...new Set([...(entity.formerSlugs ?? []), entity.slug])]
          .filter(former => former !== slug)
        let renamed: boolean
        try {
          // Three fields, never the document: groups and minted names written since the read
          // above survive. Guarded on the slug that was read — `formerSlugs` moves only with it —
          // so a concurrent rename makes this match nothing instead of writing a stale list.
          const result = await res.collection.updateOne(
            { ...idFilter(res, id), slug: entity.slug },
            { $set: { slug, formerSlugs, updatedAt: new Date() } },
          )
          renamed = result.matchedCount > 0
        } catch (error) {
          // The unique index settles a race the read above could not see.
          if (isDuplicateKey(error)) throw new SyntaxError(`entity:slug-taken:${slug}`)
          throw error
        }

        forget(entity)
        if (renamed) {
          return remember(toRef(await res.get(id)))!
        }
      }

      throw new SyntaxError(`entity:rename-contended:${id}`)
    },

    mintName: async (id, key, mint) => {
      if (key === '' || key.includes('.') || key.startsWith('$')) {
        throw new SyntaxError(`entity:name-key-malformed:${key}`)
      }

      const res = resource()
      const entity = await res.get(id)
      const existing = entity.names?.[key]
      // Read-before-mint is what freezes the name: the second caller gets the first caller's
      // answer, so a rename between the two cannot produce two names for one live resource.
      if (existing != null && existing !== '') {
        return existing
      }

      const minted = mint(toRef(entity)!)
      // One field, guarded on still being unset: of two concurrent minters the first write wins,
      // and both answer what was stored.
      await res.collection.updateOne(
        { ...idFilter(res, id), [`names.${key}`]: { $in: [null, ''] } },
        { $set: { [`names.${key}`]: minted, updatedAt: new Date() } },
      )

      return (await res.get(id)).names?.[key] ?? minted
    },
  })

  return service
}
