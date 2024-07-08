import { DEFAULT_ALIAS, DIRECTIVE, SEP } from './consts.js'
import { makeKlusterService } from './service.js'
import type { BasicContext, Middleware } from '@owlmeans/context'
import { MiddlewareStage, MiddlewareType } from '@owlmeans/context'
import { visitConfigLeafs } from '@owlmeans/config/utils'
import type { Tree } from '@owlmeans/config/utils'
import type { KlusterConfig, KlusterService } from './types.js'

export const klusterize = <C extends KlusterConfig, T extends BasicContext<C>>(context: T, alias: string = DEFAULT_ALIAS): T => {
  const service = makeKlusterService(alias)

  context.registerService(service)

  context.registerMiddleware(createMiddleware(alias))

  return context
}

export const createMiddleware: (alias?: string) => Middleware = (alias = DEFAULT_ALIAS) => ({
  type: MiddlewareType.Config,

  stage: MiddlewareStage.Loading,

  apply: async context => {
    await visitConfigLeafs(context.cfg as unknown as Tree, async value => {
      if (value.startsWith(DIRECTIVE + SEP)) {
        const service = context.service<KlusterService>(alias)
        await service.ready?.()
        const [, directive, query] = value.split(SEP, 3)

        value = await service.dispatch(directive, query)
      }

      return value
    })
  }
})
