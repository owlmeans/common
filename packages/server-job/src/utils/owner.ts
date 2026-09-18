import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import { AuthorizationError } from '@owlmeans/auth'
import type { Criteria } from '@owlmeans/resource'
import type { JobRecord } from '@owlmeans/queue'
import { DEFAULT_OWNER_FIELD } from '../consts.js'
import type { JobHandlerOptions } from '../types.js'

/**
 * The subject a job is attributed to.
 *
 * Profile first, user second — the same pair `@owlmeans/server-socket` addresses a connection by,
 * so a job enqueued for one profile of a multi-profile account is not visible to the others.
 */
export const jobOwnerOf = (req: AbstractRequest): string | undefined =>
  req.auth?.profileId ?? req.auth?.userId

/**
 * @throws {AuthorizationError} when the request carries no authenticated subject.
 */
export const requireJobOwner = (req: AbstractRequest): string => {
  const owner = jobOwnerOf(req)
  if (owner == null || owner === '') {
    throw new AuthorizationError()
  }

  return owner
}

export const ownerFieldOf = (opts?: JobHandlerOptions): string =>
  opts?.ownerField ?? DEFAULT_OWNER_FIELD

/** What one record says its owner is — the payload's own field, never a broker one. */
export const ownerOf = (record: JobRecord, opts?: JobHandlerOptions): unknown =>
  (record.data as Record<string, unknown> | undefined)?.[ownerFieldOf(opts)]

/**
 * Who this request reads the queue as: the owner every record must name, or `undefined` for a
 * request that reads it unscoped.
 *
 * `undefined` is reachable only through {@link JobHandlerOptions.admin}. Absent an admin check
 * every read is narrowed to the caller's own jobs and an anonymous request is refused, so a group
 * wired with no options at all is scoped rather than open.
 *
 * @throws {AuthorizationError}
 */
export const jobViewer = async <C extends BasicConfig, T extends BasicContext<C>>(
  req: AbstractRequest, ctx: T, opts?: JobHandlerOptions
): Promise<string | undefined> => {
  if (opts?.admin != null && await opts.admin(req, ctx as BasicContext<BasicConfig>)) {
    return undefined
  }

  return requireJobOwner(req)
}

/** The criteria one viewer reads the queue through; nothing to add when they read it unscoped. */
export const jobScope = (
  viewer: string | undefined, opts?: JobHandlerOptions
): Criteria<JobRecord> => viewer == null ? {} : { [`data.${ownerFieldOf(opts)}`]: viewer }
