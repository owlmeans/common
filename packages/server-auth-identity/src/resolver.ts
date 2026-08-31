import { appendContextual } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { EntityResolverService, OrgEntityRef } from '@owlmeans/auth-common'
import { ENTITY_RESOLVER, ENTITY_SLUG_PATTERN } from '@owlmeans/auth-common'
import { generateWordSlug, nextSlugCandidate } from '@owlmeans/basic-ids'
import type { OrgEntity, OrgEntityResource } from './types.js'
import { AUTH_IDENTITY_ORG_ENTITY, MAX_ENTITY_SLUG_ATTEMPTS } from './consts.js'

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

/** What a stored record id looks like. Anything else can only be a slug or a frozen key. */
const RECORD_ID = /^[0-9a-f]{24}$/i

/** A stored record as the contract exposes it. Persisted records always carry an id. */
const toRef = (entity: OrgEntity | null): OrgEntityRef | null =>
  entity == null ? null : {
    id: entity.id!, slug: entity.slug, formerSlugs: entity.formerSlugs, iamKey: entity.iamKey,
  }

interface CacheEntry {
  entity: OrgEntity | null
  at: number
}

export const makeEntityResolverService = (
  alias: string = ENTITY_RESOLVER
): EntityResolverService => {
  // Keyed by every name a caller might arrive with — id, slug, former slug, iamKey — so a hit
  // costs one lookup regardless of which one it was.
  const cache = new Map<string, CacheEntry>()
  const now = () => Date.now()

  const remember = (entity: OrgEntity | null, ...keys: string[]): OrgEntity | null => {
    const at = now()
    for (const key of keys) {
      if (key !== '') cache.set(key, { entity, at })
    }
    if (entity != null) {
      cache.set(entity.id!, { entity, at })
      cache.set(entity.slug, { entity, at })
      cache.set(entity.iamKey, { entity, at })
      for (const former of entity.formerSlugs ?? []) cache.set(former, { entity, at })
    }

    return entity
  }

  const forget = (entity: OrgEntity) => {
    for (const key of [entity.id, entity.slug, entity.iamKey, ...(entity.formerSlugs ?? [])]) {
      if (key != null) cache.delete(key)
    }
  }

  const resource = (): OrgEntityResource =>
    (service.ctx as Context).resource<OrgEntityResource>(AUTH_IDENTITY_ORG_ENTITY)

  const load = async (value: string): Promise<OrgEntity | null> => {
    const cached = cache.get(value)
    if (cached != null && now() - cached.at < CACHE_TTL) {
      return cached.entity
    }

    const res = resource()
    // Id first: an id is authoritative, so a slug that happens to look like some other entity's
    // id can never shadow it. Then the current slug, then the names it has retired, then the
    // frozen key external systems still quote.
    //
    // The shape test is not an optimisation. `load` reads its argument as a record id, and the
    // store turns that into an ObjectId unconditionally — so handing it a slug throws a driver
    // error out of what is meant to be a lookup that simply misses.
    const byId = RECORD_ID.test(value) ? await res.load(value) : null
    if (byId != null) return remember(byId, value)

    for (const field of ['slug', 'formerSlugs', 'iamKey'] as const) {
      const { items } = await res.list({ criteria: { [field]: value } as never, pager: { size: 1 } })
      if (items[0] != null) return remember(items[0], value)
    }

    return remember(null, value)
  }

  const service: EntityResolverService = appendContextual<EntityResolverService>(alias, {
    resolve: async value => toRef(await load(value)),

    byId: async id => {
      const entity = RECORD_ID.test(id) ? await resource().load(id) : null

      return toRef(remember(entity, id))
    },

    mintSlug: async () => {
      const res = resource()
      // A word slug is picked from 2^22 pairs, so a collision is rare — but "rare" is not "never"
      // once an installation has many organizations, and the numeric suffix keeps the readable
      // name rather than rerolling into an unrelated one.
      for (let attempt = 1; attempt <= MAX_ENTITY_SLUG_ATTEMPTS; ++attempt) {
        const base = generateWordSlug()
        for (let suffix = 1; suffix <= 3; ++suffix) {
          const candidate = nextSlugCandidate(base, suffix)
          const { items } = await res.list({
            criteria: { $or: [{ slug: candidate }, { formerSlugs: candidate }] } as never,
            pager: { size: 1 },
          })
          if (items.length === 0) return candidate
        }
      }

      throw new SyntaxError('entity:slug-exhausted')
    },

    rename: async (id, slug) => {
      if (!ENTITY_SLUG_PATTERN.test(slug)) {
        throw new SyntaxError(`entity:slug-malformed:${slug}`)
      }

      const res = resource()
      const entity = await res.get(id)
      if (entity.slug === slug) {
        return toRef(entity)!
      }

      // A slug another entity has ever answered to cannot be taken: tokens and third-party records
      // quoting it would start resolving to the wrong organization.
      const { items: taken } = await res.list({
        criteria: { $or: [{ slug }, { formerSlugs: slug }] } as never, pager: { size: 1 },
      })
      if (taken[0] != null && taken[0].id !== id) {
        throw new SyntaxError(`entity:slug-taken:${slug}`)
      }

      forget(entity)
      const formerSlugs = [...new Set([...(entity.formerSlugs ?? []), entity.slug])]
        .filter(former => former !== slug)
      const updated = await res.update({ ...entity, slug, formerSlugs, updatedAt: new Date() })

      return toRef(remember(updated))!
    },

    mintName: async (id, key, mint) => {
      const res = resource()
      const entity = await res.get(id)
      const existing = entity.names?.[key]
      // Read-before-mint is what freezes the name: the second caller gets the first caller's
      // answer, so a rename between the two cannot produce two names for one live resource.
      if (existing != null && existing !== '') {
        return existing
      }

      const minted = mint(toRef(entity)!)
      forget(entity)
      const updated = await res.update({
        ...entity, names: { ...entity.names, [key]: minted }, updatedAt: new Date(),
      })
      remember(updated)

      return updated.names?.[key] ?? minted
    },
  })

  return service
}
