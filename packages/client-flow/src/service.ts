import { assertContext, createLazyService } from '@owlmeans/context'
import type { ConfigRecord } from '@owlmeans/context'
import { DEFAULT_ALIAS } from './consts.js'
import { DEFAULT_ALIAS as CONFIG_RESOURCE, fromConfigRecord } from '@owlmeans/config'
import type { ConfigResource } from '@owlmeans/config'
import type { FlowService, ResolvePair } from './types.js'
import type { Flow, FlowConfigRecord, WithFlowConfig } from '@owlmeans/flow'
import { FLOW_RECORD, FlowUnsupported, makeFlowModel, STD_AUTH_FLOW, UnknownFlow } from '@owlmeans/flow'

export const makeBasicFlowService = (alias: string = DEFAULT_ALIAS): FlowService => {
  const location = `flow-service:${alias}`
  const pair: ResolvePair = {
    resolve: () => { },
    reject: () => { }
  }

  const flows: { [key: string]: Flow } = {}

  const service: FlowService = createLazyService<FlowService>(alias, {
    flow: null,

    supplied: new Promise<boolean>((resolve, reject) => {
      pair.resolve = resolve
      pair.reject = reject
    }),

    state: async () => {
      await service.supplied

      return service.flow
    },

    resolvePair: () => pair,

    config: () => {
      const ctx = assertContext(service.ctx, location)
      return (ctx.cfg as WithFlowConfig).flowConfig ?? {}
    },

    begin: async (slug, from) => {
      slug = slug ?? service.config().defaultFlow ?? STD_AUTH_FLOW
      service.flow = await makeFlowModel(slug, service.provideFlow)

      service.supplied = Promise.resolve(true)

      return service.flow.enter(from)
    },

    load: async (state) => {
      service.flow = await makeFlowModel(state, service.provideFlow)
      
      service.supplied = Promise.resolve(true)

      return service.flow
    },

    provideFlow: async slug => {
      if (flows[slug] == null) {
        throw new UnknownFlow(slug)
      }
      return flows[slug]
    },

    proceed: async () => {
      throw new FlowUnsupported('service.proceed')
    }
  }, service => async () => {
    const ctx = assertContext(service.ctx, location)
    const flowCfg = service.config()

    // @TODO Put it into some configuration and make it more flexible
    const configRes = ctx.resource<ConfigResource>(CONFIG_RESOURCE)
    const flowConfigs = await configRes.list({ recordType: FLOW_RECORD })
    await Promise.all(flowConfigs.items.map(
      item => fromConfigRecord<ConfigRecord, FlowConfigRecord>(item)
    ).map(async flow => {
      Object.values(flow.steps).forEach(step => {
        if (step.service.startsWith('$')) {
          const service = flowCfg.services?.[step.service.substring(1)]
          if (service != null) {
            step.service = service
          }
        }
        if (step.module != null && step.module.startsWith('$')) {
          const module = flowCfg.modules?.[step.module.substring(1)]
          if (module != null) {
            step.module = module
          }
        }

        if (step.path != null && step.path.startsWith('$')) {
          const path = flowCfg.pathes?.[step.path.substring(1)]
          if (path != null) {
            step.path = path
          }
        }
      })

      flows[flow.flow] = {
        ...flow, config: flowCfg, prefabs: Object.fromEntries(await Promise.all(
          Object.values(flow.steps).filter(step => step.initial === true)
            .map(async step => {
              const state = await makeFlowModel(flow)
              return [step.step, state.enter(step.step).serialize()]
            })
        ))
      }
    }))

    service.initialized = true
  })

  return service
}
