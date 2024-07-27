import { assertContext, createLazyService } from '@owlmeans/context'
import { DEFAULT_ALIAS, defDeps } from './consts.js'
import type { DIDService, DIDServiceAppend, DIDServiceDeps } from './types.js'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import type { KeyMetaResource, KeyPairResource, MasterResource } from '@owlmeans/did'
import { DIDInitializationError, makeWallet, MASTER } from '@owlmeans/did'
import { appendClientResource } from '@owlmeans/client-resource'

export const makeWalletService = (alias: string = DEFAULT_ALIAS, deps?: DIDServiceDeps): DIDService => {
  const location = `did-service:${alias}`
  deps = deps ?? defDeps

  const service: DIDService = createLazyService<DIDService>(alias, {
    exists: async () => {
      const context = assertContext(service.ctx, location) as ClientContext
      const resource = context.resource<MasterResource>(deps.master)

      return null != await resource.load(MASTER)
    },

    create: async opts => {
      const context = assertContext(service.ctx, location) as ClientContext

      if (await service.exists()) {
        throw new DIDInitializationError('exists:service')
      }

      return service.wallet = await makeWallet({
        keys: context.resource<KeyPairResource>(deps.keys),
        meta: context.resource<KeyMetaResource>(deps.meta),
        master: context.resource<MasterResource>(deps.master)
      }, { force: true, ...opts })
    },

    intialize: async () => {
      const context = assertContext(service.ctx, location) as ClientContext

      return service.wallet = await makeWallet({
        keys: context.resource<KeyPairResource>(deps.keys),
        meta: context.resource<KeyMetaResource>(deps.meta),
        master: context.resource<MasterResource>(deps.master)
      })
    },

    get: () => service.wallet
  }, service => async () => {
    const context = assertContext(service.ctx, location) as ClientContext
    await context.resource(deps.keys).init?.()
    if (service.wallet == null && await service.exists()) {
      await service.intialize()
    }
    service.initialized = true
  })

  return service
}

export const appendDidService = <
  C extends ClientConfig, T extends ClientContext<C>
>(ctx: T, alias: string = DEFAULT_ALIAS): T & DIDServiceAppend => {
  const context = ctx as T & DIDServiceAppend

  const deps: DIDServiceDeps = {
    keys: `${alias}-keys`,
    meta: `${alias}-meta`,
    master: `${alias}-master`
  }

  Object.values(deps).forEach(dep => appendClientResource<C, T>(context, dep))

  const service = makeWalletService(alias, deps)
  context.registerService(service)

  if (context.getDidService == null) {
    context.getDidService = (_alias?: string) => context.service<DIDService>(_alias ?? alias)
  }

  return context
}
