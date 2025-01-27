
import { elevate } from '@owlmeans/client-module'
import type { ClientModule } from '@owlmeans/client-module'
import { WL_PROVIDE, modules as wlModules } from '@owlmeans/wled'

elevate(wlModules, WL_PROVIDE)

export const modules = wlModules as ClientModule<unknown>[]
