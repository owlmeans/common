import type { ClientModule } from '@owlmeans/client-module'
import { DEFAULT_ALIAS } from './consts.js'
import type { Config, Context, ProvidedWLSet, WlWebService } from './types.js'
import { createService } from '@owlmeans/context'
import { WL_PROVIDE } from '@owlmeans/wled'


export const makeWlService = (alias: string = DEFAULT_ALIAS): WlWebService => {
  const cache: { [entityId: string]: ProvidedWLSet } = {}

  const service: WlWebService = createService<WlWebService>(alias, {
    load: async entityId => {
      if (cache[entityId] != null) {
        return cache[entityId]
      }

      const context = service.assertCtx<Config, Context>()

      const module = context.module<ClientModule<ProvidedWLSet>>(WL_PROVIDE)
      const [wlSet] = await module.call({ params: { entity: entityId } })
      console.log('wl loading in progress', wlSet)

      return cache[entityId] = wlSet as ProvidedWLSet<any>
    },

    extract: (key, set) => set[key]
  })

  return service
}
