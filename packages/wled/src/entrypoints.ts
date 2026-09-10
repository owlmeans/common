import { filter, entrypoint, params } from '@owlmeans/entrypoint'
import { route, backend } from '@owlmeans/route'
import { WL_PROVIDE, WL_PROVIDE_PATH } from './consts.js'
import { ProvideParamsSchema } from './model/provider.js'

export const entrypoints = [
  entrypoint(
    route(WL_PROVIDE, WL_PROVIDE_PATH, backend()),
    filter(params(ProvideParamsSchema))
  )
]
