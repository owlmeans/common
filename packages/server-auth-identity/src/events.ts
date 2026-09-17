import type { BasicContext } from '@owlmeans/context'
import { createLazyService } from '@owlmeans/context'
import { AUTH_IDENTITY_EVENTS } from './consts.js'
import type { EntityCreatedCallback, IdentityContext, IdentityEventsService } from './types.js'

export const makeIdentityEventsService = (
  alias: string = AUTH_IDENTITY_EVENTS
): IdentityEventsService => {
  const created: EntityCreatedCallback[] = []

  const service: IdentityEventsService = createLazyService<IdentityEventsService>(alias, {
    onEntityCreated: callback => {
      created.push(callback)
    },

    propagateEntityCreated: async event => {
      for (const callback of created) {
        try {
          await callback(event, service.assertCtx<IdentityContext['cfg'], IdentityContext>())
        } catch (error) {
          // The entity, the account and the profile already exist; failing here would turn a
          // listener's problem into a sign-in that never completes for a person who is registered.
          console.error(`${alias}: entity-created listener failed for ${event.entityId}`, error)
        }
      }
    },
  })

  return service
}

/**
 * The identity-events service, or `null` where the context has none registered — so a caller
 * writes `identityEvents(ctx)?.onEntityCreated(...)` and a deployment without the seam pays nothing.
 */
export const identityEvents = (
  ctx: BasicContext<any>, alias: string = AUTH_IDENTITY_EVENTS
): IdentityEventsService | null =>
  ctx.hasService(alias) ? ctx.service<IdentityEventsService>(alias) : null
