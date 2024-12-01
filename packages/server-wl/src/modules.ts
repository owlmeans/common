
import { elevate } from '@owlmeans/server-module'
import type { ServerModule } from '@owlmeans/server-module'
import { WL_PROVIDE, modules as wlModules } from '@owlmeans/wled'
import * as actions from './actions/index.js'

elevate(wlModules, WL_PROVIDE, actions.provide)

export const modules = wlModules as ServerModule<unknown>[]
