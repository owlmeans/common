
import { elevate } from '@owlmeans/client-entrypoint'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { WL_PROVIDE, entrypoints as wlEntrypoints } from '@owlmeans/wled'

elevate(wlEntrypoints, WL_PROVIDE)

export const entrypoints = wlEntrypoints as ClientEntrypoint<unknown>[]
