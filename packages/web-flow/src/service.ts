import type { ClientContext, ClientConfig } from '@owlmeans/client-context'
import { DEFAULT_ALIAS, makeBasicFlowService } from '@owlmeans/client-flow'
import type { FlowService } from './types.js'
import { QUERY_PARAM } from './consts.js'
import { FlowStepMissconfigured, makeFlowModel, UnknownTransition } from '@owlmeans/flow'
import { ResilientError } from '@owlmeans/error'
import { assertContext } from '@owlmeans/context'
import type { ClientModule } from '@owlmeans/client-module'

export const makeFlowService = (alias: string = DEFAULT_ALIAS): FlowService => {
  const location = `web-flow-service:${alias}`
  const service: FlowService = makeBasicFlowService(alias)

  service.proceed = async req => {
    const ctx = assertContext(service.ctx, location) as ClientContext
    const flow = service.flow
    if (flow == null) {
      throw new UnknownTransition('service.proceed')
    }
    const step = flow.step()
    if (step.module == null) {
      throw new FlowStepMissconfigured(step.step)
    }
    const module = ctx.module<ClientModule<string>>(step.module)
    const [url] = await module.call<string>({ full: true })

    const cfg = service.config()
    const param = cfg.queryParam ?? QUERY_PARAM

    const params = new URLSearchParams(req?.query ?? {})
    params.set(param, flow.serialize())

    params.toString()
    document.location.href = `${url}?${params.toString()}`
  }

  const init = service.lazyInit
  service.lazyInit = async () => {
    await init()
    const cfg = service.config()
    const param = cfg.queryParam ?? QUERY_PARAM
    const url = new URL(window.location.href)
    const state = url.searchParams.get(param)
    if (state == null) {
      service.flow = null
      service.resolvePair().resolve(false)
      return
    }

    try {
      service.flow = await makeFlowModel(state, service.provideFlow)
      service.resolvePair().resolve(true)
    } catch (e) {
      service.flow = null
      service.resolvePair().reject(ResilientError.ensure(e as Error))
    }
  }

  return service
}

export const appendFlowService = <
  C extends ClientConfig, T extends ClientContext<C>
>(ctx: T, alias: string = DEFAULT_ALIAS): T => {
  const service = makeFlowService(alias)

  ctx.registerService(service)

  return ctx
}
