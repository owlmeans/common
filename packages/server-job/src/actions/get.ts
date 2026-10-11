import type { EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import { handlers } from '@owlmeans/server-api'
import type { BoundEntrypointHandler } from '@owlmeans/server-entrypoint'
import type { Context, JobEntrypoints, JobHandlerOptions } from '../types.js'
import { makeJobPolicyHelper } from '../utils/index.js'

/**
 * One job.
 *
 * @throws {UnknownJob} for an id that is absent AND for one that belongs to someone else.
 */
export const getJob = (
  protocol: JobEntrypoints['get'],
  opts: JobHandlerOptions
): BoundEntrypointHandler<EntrypointProtocolDeclaration> => {
  const policy = makeJobPolicyHelper(opts)

  return handlers<Context>().params(protocol, async ({ id }, ctx, req) => {
    const resource = policy.jobsOf(ctx)
    const audience = await opts.policy.audience(req, ctx)
    const record = await policy.readExposedJob(resource, id, audience)
    return await opts.policy.map(record, audience)
  })
}
