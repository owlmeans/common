import { createService } from '@owlmeans/context'
import type { BasicConfig, BasicContext, Contextual } from '@owlmeans/context'
import { MAILER_SERVICE } from './consts.js'
import { createConsoleMailerTransport } from './console.js'
import type { MailerAppendOptions, MailerHostService, MailerTransport, MailMessage } from './types.js'

/**
 * Every host registered on a context, by alias. Process-wide on purpose: a host is reachable here
 * from the moment `registerService` binds it, while `context.service()` still refuses an
 * uninitialized service — which is when transport packages register, from `makeContext`.
 */
const hosts = new WeakMap<BasicContext<any>, Map<string, MailerHostService>>()

/**
 * The mailer host under `alias`: a `MailerService` whose `send` goes to the most recently
 * registered transport, or to a console transport while none is. It runs that transport's `init`
 * while the context initializes.
 */
export const createMailerService = (alias: string = MAILER_SERVICE): MailerHostService => {
  const fallback = createConsoleMailerTransport()
  const transports = new Map<string, MailerTransport>()
  let selected: MailerTransport | undefined

  const active = (): MailerTransport => selected ?? fallback

  const service: MailerHostService = createService<MailerHostService>(alias, {
    register: (transport: MailerTransport): void => {
      transports.set(transport.id, transport)
      selected = transport
    },

    get: (id: string): MailerTransport | undefined =>
      transports.get(id) ?? (id === fallback.id ? fallback : undefined),

    active,

    send: async (message: MailMessage): Promise<void> => {
      await active().send(message)
    },
  }, current => async () => {
    await active().init?.()
    current.initialized = true
  })

  // Record the host on the context that registers it, so `ensureMailerService` finds a host
  // registered directly with `registerService` as well as one it created itself.
  const registerContext = service.registerContext
  service.registerContext = <T extends Contextual, C extends BasicConfig>(context: BasicContext<C>): T => {
    const byAlias = hosts.get(context) ?? new Map<string, MailerHostService>()
    byAlias.set(alias, service)
    hosts.set(context, byAlias)

    return registerContext<T, C>(context)
  }

  return service
}

/**
 * The mailer host under `alias` on `ctx`, registering one when the alias is free. Idempotent, and
 * safe from `makeContext` (before the context initializes). Throws when another kind of service —
 * a standalone transport registered under the alias — already holds it.
 */
export const ensureMailerService = (ctx: BasicContext<any>, alias: string = MAILER_SERVICE): MailerHostService => {
  const known = hosts.get(ctx)?.get(alias)
  if (known != null) {
    return known
  }
  if (ctx.hasService(alias)) {
    throw new SyntaxError(
      `mailer: ${alias} is held by a service that is not a mailer host — register transports with `
      + 'appendMailerTransport instead of registering a mailer service under that alias'
    )
  }
  const host = createMailerService(alias)
  ctx.registerService(host)

  return host
}

/** Register `transport` with the host (`opts.alias`, `MAILER_SERVICE` by default) and return it. */
export const appendMailerTransport = <T extends MailerTransport>(
  ctx: BasicContext<any>, transport: T, opts: MailerAppendOptions = {}
): T => {
  ensureMailerService(ctx, opts.alias).register(transport)

  return transport
}
