import { module } from '@owlmeans/module'
import { route, backend } from '@owlmeans/route'
import { WL_PROVIDE, WL_PROVIDE_PATH } from './consts'

export const modules = [
  module(route(WL_PROVIDE, WL_PROVIDE_PATH, backend()))
]
