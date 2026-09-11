import { contract, protocol, protocols, typed } from '@owlmeans/entrypoint'
import type { ProvideParams } from './types.js'
import { route, backend } from '@owlmeans/route'
import { WL_PROVIDE, WL_PROVIDE_PATH } from './consts.js'
import { ProvideParamsSchema } from './model/provider.js'

export const wledEntrypoints = {
  provide: protocol(
    route(WL_PROVIDE, WL_PROVIDE_PATH, backend()),
    contract.request({ params: typed<ProvideParams>(ProvideParamsSchema) }, typed())
  )
}

export const entrypoints = protocols(wledEntrypoints)
