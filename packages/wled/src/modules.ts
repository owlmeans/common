import { filter, module, params } from '@owlmeans/module'
import { route, backend } from '@owlmeans/route'
import { WL_PROVIDE, WL_PROVIDE_PATH } from './consts.js'
import { ProvideParamsSchema } from './model/provider.js'

export const modules = [
  module(
    route(WL_PROVIDE, WL_PROVIDE_PATH, backend()),
    filter(params(ProvideParamsSchema))
  )
]
