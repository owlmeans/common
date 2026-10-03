import type { BasicContext } from '@owlmeans/context'
import { createLazyService } from '@owlmeans/context'
import { AUTH_IDENTITY_EVENTS } from './consts.js'
import type {
  EntityCreatedCallback, IdentityContext, IdentityEventsService, ProfileCreatedCallback,
} from './types.js'

export const makeIdentityEventsService = (
  alias: string = AUTH_IDENTITY_EVENTS
): IdentityEventsService => {
  const created: EntityCreatedCallback[] = []
  const profiles: ProfileCreatedCallback[] = []

  /**
   * Every listener, one after another, each awaited. The records already exist; failing here would
   * turn a listener's problem into a sign-in that never completes for a person who is registered.
   */
  const deliver = async <E>(
    listeners: Array<(event: E, ctx: IdentityContext) => Promise<void>>, event: E, what: string
  ): Promise<void> => {
    for (const callback of listeners) {
      try {
        await callback(event, service.assertCtx<IdentityContext['cfg'], IdentityContext>())
      } catch (error) {
        console.error(`${alias}: ${what} listener failed`, error)
      }
    }
  }

  const service: IdentityEventsService = createLazyService<IdentityEventsService>(alias, {
    onEntityCreated: callback => {
      created.push(callback)
    },

    propagateEntityCreated: async event => {
      await deliver(created, event, `entity-created(${event.entityId})`)
    },

    onProfileCreated: callback => {
      profiles.push(callback)
    },

    propagateProfileCreated: async event => {
      await deliver(profiles, event, `profile-created(${event.service}:${event.entityId})`)
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
