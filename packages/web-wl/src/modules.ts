
import { elevate } from '@owlmeans/client-entrypoint'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { WL_PROVIDE, modules as wlModules } from '@owlmeans/wled'

elevate(wlModules, WL_PROVIDE)

export const modules = wlModules as ClientEntrypoint<unknown>[]
