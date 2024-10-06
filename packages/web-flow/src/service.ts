import type { ClientContext, ClientConfig } from '@owlmeans/client-context'
import { DEFAULT_ALIAS, makeBasicFlowService, FLOW_STATE } from '@owlmeans/client-flow'
import type { FlowService } from './types.js'
import { QUERY_PARAM } from './consts.js'
import { FlowStepMissconfigured, makeFlowModel, UnknownTransition } from '@owlmeans/flow'
import { ResilientError } from '@owlmeans/error'
import { assertContext } from '@owlmeans/context'
import type { ClientModule } from '@owlmeans/client-module'
import { appendClientResource } from '@owlmeans/client-resource'

export const makeFlowService = (alias: string = DEFAULT_ALIAS): FlowService => {
  const location = `web-flow-service:${alias}`
  const service: FlowService = makeBasicFlowService(alias)

  service.proceed = async (req, dryRun = false) => {
    const ctx = assertContext(service.ctx, location) as ClientContext
    const flow = service.flow
    if (flow == null) {
      throw new UnknownTransition('service.proceed')
    }
    const step = flow.step()
    console.log('The step we are proceeding to', step)
    if (step.module == null) {
      throw new FlowStepMissconfigured(step.step)
    }
    const module = ctx.module<ClientModule<string>>(step.module)
    const [url] = await module.call<string>({ full: true })

    const cfg = service.config()
    const param = cfg.queryParam ?? QUERY_PARAM

    const params = new URLSearchParams(req?.query ?? {})
    params.set(param, flow.serialize())

    const redirectUrl = `${url}?${params.toString()}`

    console.log('we get to a redirect url', redirectUrl)
    if (!dryRun) {
      document.location.href = redirectUrl
    }
    
    return redirectUrl
  }

  const init = service.lazyInit
  service.lazyInit = async () => {
    await init()
    console.log('^^ init web flow from here')
    const cfg = service.config()
    const param = cfg.queryParam ?? QUERY_PARAM
    const url = new URL(window.location.href)
    const state = url.searchParams.get(param)
    if (state == null) {
      service.flow = null
      service.resolvePair().resolve(false)
      console.log('^^ no flow resolve')
      return
    }

    try {
      console.log('^^ resolving flow via state and provider', state)

      service.flow = await makeFlowModel(state, service.provideFlow)

      console.log('^^ flow resolved', service.flow.state())
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

  appendClientResource<C, T>(ctx, FLOW_STATE)

  return ctx
}
