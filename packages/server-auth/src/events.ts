import { createLazyService } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { logger } from '@owlmeans/log'
import { AUTH_EVENTS } from './consts.js'
import type { AuthenticatedListener, AuthEventsService } from './events/types.js'

const log = logger('server-auth')

export const makeAuthEventsService = (alias: string = AUTH_EVENTS): AuthEventsService => {
  const authenticated: AuthenticatedListener[] = []

  const service: AuthEventsService = createLazyService<AuthEventsService>(alias, {
    onAuthenticated: listener => {
      authenticated.push(listener)
    },

    propagateAuthenticated: async auth => {
      const ctx = service.assertCtx<ServerConfig, ServerContext<ServerConfig>>()
      for (const listener of authenticated) {
        try {
          // A copy each: one listener's edits never reach the next one.
          await listener({ ...auth }, ctx)
        } catch (error) {
          log.error('Sign-in listener failed', { alias, profileId: auth.profileId, error }, { event: 'auth.listener-failed' })
        }
      }
    },
  })

  return service
}

/** Register the auth events service unless the context already has one under `alias`. */
export const appendAuthEventsService = <T extends BasicContext<any>>(ctx: T, alias: string = AUTH_EVENTS): T => {
  if (!ctx.hasService(alias)) {
    ctx.registerService(makeAuthEventsService(alias))
  }

  return ctx
}

/**
 * The auth events service, or `null` where the context has none — so a caller writes
 * `authEvents(ctx)?.onAuthenticated(...)` and a context without the seam pays nothing.
 */
export const authEvents = (ctx: BasicContext<any>, alias: string = AUTH_EVENTS): AuthEventsService | null =>
  ctx.hasService(alias) ? ctx.service<AuthEventsService>(alias) : null
