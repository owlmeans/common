import type { AbstractRequest, ResolvedEntity } from '@owlmeans/entrypoint'
import type { BasicContext } from '@owlmeans/context'
import { AuthenFailed, AuthorizationError, entitySlugOf } from '@owlmeans/auth'
import type { EntityResolverService } from './types.js'
import { ENTITY_RESOLVER } from './consts.js'

/**
 * The value a handler should store and query organization-scoped records by.
 *
 * Prefers the entity's stable id, which is the whole point of resolving one: records keyed by it
 * survive a rename untouched. Falls back to the slug on the token for deployments that register no
 * resolver — there the slug IS the only identifier the system has, and refusing to serve them
 * would break every installation backed by an external IAM.
 *
 * Never use this to compose a user-facing name (a hostname, a display label). Those want the
 * current slug, `req.entity?.slug`, precisely because it can change.
 */
export const entityKeyOf = (req: AbstractRequest): string | undefined =>
  req.entity?.id ?? entitySlugOf(req.auth)

/**
 * `entityKeyOf` for handlers that cannot proceed without an organization.
 *
 * @throws {AuthorizationError} when the request carries no organization at all.
 */
export const requireEntityKey = (req: AbstractRequest): string => {
  const key = entityKeyOf(req)
  if (key == null || key === '') {
    throw new AuthorizationError()
  }

  return key
}

/**
 * The full resolved entity, for handlers that need the slug or the frozen key as well as the id.
 *
 * @throws {AuthorizationError} when no resolver is registered or the entity did not resolve.
 */
export const requireEntity = (req: AbstractRequest): ResolvedEntity => {
  if (req.entity == null) {
    throw new AuthorizationError()
  }

  return req.entity
}

/**
 * Resolve the organization a just-authenticated request acts for, and attach it.
 *
 * Called wherever authentication is ESTABLISHED — the HTTP boundary, and any socket that
 * authenticates on its own once the connection is already open. Both need it for the same reason:
 * the token names the organization by a slug that can move, while everything downstream keys on
 * the record. A path that authenticates without calling this leaves `request.entity` empty, and
 * its handlers quietly fall back to comparing a slug against stored ids — which surfaces as "this
 * project does not exist" rather than as a missing resolution, and costs an afternoon to find.
 *
 * A no-op when no resolver is registered: such a deployment has no organization store, and the
 * slug is the only identifier it has.
 *
 * @throws {AuthenFailed} when the token names an organization that cannot be resolved.
 */
export const attachEntity = async (
  context: BasicContext<any>, request: AbstractRequest
): Promise<ResolvedEntity | undefined> => {
  const slug = entitySlugOf(request.auth)
  if (slug == null || !context.hasService(ENTITY_RESOLVER)) {
    return undefined
  }

  const entity = await context.service<EntityResolverService>(ENTITY_RESOLVER).resolve(slug)
  if (entity == null) {
    throw new AuthenFailed('entity')
  }

  // Canonicalize: a request that arrived under a retired slug continues under the current one, so
  // nothing echoing the value back can re-publish a name the organization has dropped.
  request.auth!.entitySlug = entity.slug
  request.entity = entity

  return entity
}
