import { ENTITY_RESOLVER } from '@owlmeans/auth-common'
import type { BasicContext } from '@owlmeans/context'
import { makeIdentityLinkingService } from '../src/service.js'
import { makeIdentityEventsService } from '../src/events.js'
import {
  AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_CREDENTIALS, AUTH_IDENTITY_EVENTS, AUTH_IDENTITY_ORG_ENTITY,
  AUTH_IDENTITY_PROFILE,
} from '../src/consts.js'
import type { IdentityEventsService } from '../src/types.js'

/**
 * The rows are stubbed rather than mocked — the linking service's whole behaviour is which record
 * it reads before it writes, so a stub that records writes is the subject, not a stand-in for it.
 */
export const stubResource = <T extends { id?: string }>(alias: string, seed: T[] = []) => {
  const items: T[] = [...seed]
  let next = seed.length + 1

  const matches = (record: any, where: any): boolean =>
    where == null || Object.entries(where).every(([key, value]) => record[key] === value)

  return {
    alias,
    items,
    list: async (where?: unknown) => ({ items: items.filter(item => matches(item, where)) }),
    load: async (where?: unknown) => items.find(item => matches(item, where)) ?? null,
    get: async (where?: unknown) => {
      const found = items.find(item => matches(item, where))
      if (found == null) throw new Error(`${alias}: not found`)
      return found
    },
    create: async (record: T) => {
      const stored = { ...record, id: record.id ?? `${alias}-${next++}` } as T
      items.push(stored)
      return stored
    },
    delete: async (id: string) => {
      const at = items.findIndex(item => item.id === id)
      if (at < 0) return null
      return items.splice(at, 1)[0]
    },
    registerContext: () => undefined,
  }
}

export interface CtxSeed {
  accounts?: any[]
  profiles?: any[]
  credentials?: any[]
  /** Register the identity-events service, as `appendAuthIdentityResources` does. */
  events?: boolean
}

export const makeCtx = (seed: CtxSeed = {}) => {
  const resources: Record<string, any> = {
    [AUTH_IDENTITY_ACCOUNT]: stubResource('account', seed.accounts),
    [AUTH_IDENTITY_PROFILE]: stubResource('profile', seed.profiles),
    [AUTH_IDENTITY_CREDENTIALS]: stubResource('credential', seed.credentials),
    [AUTH_IDENTITY_ORG_ENTITY]: stubResource('entity'),
  }
  const services: Record<string, unknown> = {}
  let minted = 0

  const ctx = {
    resources,
    resource: (alias: string) => resources[alias],
    hasService: (alias: string) => alias === ENTITY_RESOLVER || alias in services,
    service: (alias: string) => {
      if (alias in services) return services[alias]
      if (alias !== ENTITY_RESOLVER) throw new Error(`unexpected service ${alias}`)
      return {
        mintSlug: async () => `slug-${++minted}`,
        byId: async (id: string) => ({ id, slug: `slug-of-${id}` }),
      }
    },
  }

  if (seed.events === true) {
    const events = makeIdentityEventsService()
    events.registerContext(ctx as unknown as BasicContext<any>)
    services[AUTH_IDENTITY_EVENTS] = events
  }

  return ctx
}

export const eventsOf = (ctx: ReturnType<typeof makeCtx>): IdentityEventsService =>
  ctx.service(AUTH_IDENTITY_EVENTS) as IdentityEventsService

export const details = (type: string, sub: string) => ({
  type, service: type, clientId: type, userId: sub, username: 'person@example.org',
})

export const linkingFor = (ctx: unknown) => {
  const service = makeIdentityLinkingService()
  service.registerContext(ctx as never)
  return service
}
