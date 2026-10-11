import type { AbstractRequest, ResolvedEntity } from '@owlmeans/entrypoint'
import type { BasicContext } from '@owlmeans/context'
import { AuthenFailed, AuthorizationError, authHelper } from '@owlmeans/auth'
import type { EntityResolverService } from './types.js'
import { ENTITY_RESOLVER } from './consts.js'
import type { EntityScope } from './entity/types.js'

export const makeEntityScope = (req: AbstractRequest): EntityScope => {
  const entityKeyOf = (): string | undefined =>
    req.entity?.id ?? authHelper.entitySlugOf(req.auth)

  const requireEntityKey = (): string => {
    const key = entityKeyOf()
    if (key == null || key === '') {
      throw new AuthorizationError()
    }

    return key
  }

  const requireEntity = (): ResolvedEntity => {
    if (req.entity == null) {
      throw new AuthorizationError()
    }

    return req.entity
  }

  const attachEntity = async (context: BasicContext<any>): Promise<ResolvedEntity | undefined> => {
    const slug = authHelper.entitySlugOf(req.auth)
    if (req.entity != null) {
      if (slug != null && req.entity.slug === slug) {
        return req.entity
      }
      req.entity = undefined
    }

    if (slug == null || !context.hasService(ENTITY_RESOLVER)) {
      return undefined
    }

    const entity = await context.service<EntityResolverService>(ENTITY_RESOLVER).resolve(slug)
    if (entity == null) {
      throw new AuthenFailed('entity')
    }

    // Canonicalize: a request that arrived under a retired slug continues under the current one, so
    // nothing echoing the value back can re-publish a name the organization has dropped.
    req.auth!.entitySlug = entity.slug
    req.entity = entity

    return entity
  }

  return { entityKeyOf, requireEntityKey, requireEntity, attachEntity }
}

/** @deprecated compat:factory-refactor — use `makeEntityScope(req).entityKeyOf()` */
export const entityKeyOf = (req: AbstractRequest): string | undefined => makeEntityScope(req).entityKeyOf()

/** @deprecated compat:factory-refactor — use `makeEntityScope(req).requireEntityKey()` */
export const requireEntityKey = (req: AbstractRequest): string => makeEntityScope(req).requireEntityKey()

/** @deprecated compat:factory-refactor — use `makeEntityScope(request).attachEntity(context)` */
export const attachEntity = async (
  context: BasicContext<any>, request: AbstractRequest
): Promise<ResolvedEntity | undefined> => await makeEntityScope(request).attachEntity(context)
