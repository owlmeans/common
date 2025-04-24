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
  const service: FlowService = makeBasicFlowService(alias) as FlowService

  // @TODO Use in the client proceed also (unify the code)
  service.proceed = async (req, dryRun = false) => {
    const ctx = assertContext(service.ctx, location) as ClientContext
    const flow = service.flow
    if (flow == null) {
      throw new UnknownTransition('service.proceed')
    }
    const step = flow.step()
    if (step.module == null) {
      throw new FlowStepMissconfigured(step.step)
    }

    const cfg = service.config()
    const param = cfg.queryParam ?? QUERY_PARAM

    const module = ctx.module<ClientModule<string>>(step.module)
    const [url] = await module.call<string>({
      ...req,
      params: { ...req?.params, [param]: flow.serialize() },
      full: true
    })

    // const params = new URLSearchParams(req?.query ?? {})
    // params.set(param, flow.serialize())

    const redirectUrl = new URL(url)
    redirectUrl.searchParams.set(param, flow.serialize())

    if (!dryRun) {
      document.location.href = redirectUrl.toString()
    }

    return redirectUrl.toString()
  }

  service.goHome = async (alias, dryRun = false) => {
    const ctx = assertContext(service.ctx, location) as ClientContext
    const cfg = await ctx.config
    const targetAlias = alias ?? Object.values(cfg.services).find(s => s.default)?.service ?? cfg.service
    const target = ctx.serviceRoute(targetAlias)

    const url = target.home ?? cfg.brand?.home ?? 'https://owlmeans.com'
    if (!dryRun) {
      document.location.href = url
    }

    return url
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

  appendClientResource<C, T>(ctx, FLOW_STATE)

  return ctx
}
