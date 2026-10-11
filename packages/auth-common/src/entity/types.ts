import type { BasicContext } from '@owlmeans/context'
import type { ResolvedEntity } from '@owlmeans/entrypoint'

/** The organization entity one request acts for — built once at the top of a handler, never stored. */
export interface EntityScope {
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
  entityKeyOf: () => string | undefined
  /**
   * `entityKeyOf` for handlers that cannot proceed without an organization.
   *
   * @throws {AuthorizationError} when the request carries no organization at all.
   */
  requireEntityKey: () => string
  /**
   * The full resolved entity, for handlers that need the slug or the frozen key as well as the id.
   *
   * @throws {AuthorizationError} when no resolver is registered or the entity did not resolve.
   */
  requireEntity: () => ResolvedEntity
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
   * An entity the guard already attached is kept while its slug is exactly the token's: a guard
   * whose authority names the organization itself (an OIDC session of a tenanted client) is the only
   * source such a deployment has, because the registry that owns the organization is not its own.
   * One whose slug differs is never trusted — it is dropped, and resolution proceeds as if it had
   * not been there.
   *
   * Otherwise a no-op when no resolver is registered: such a deployment has no organization store,
   * and the slug is the only identifier it has.
   *
   * @throws {AuthenFailed} when the token names an organization that cannot be resolved.
   */
  attachEntity: (context: BasicContext<any>) => Promise<ResolvedEntity | undefined>
}
