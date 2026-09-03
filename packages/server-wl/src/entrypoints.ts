
import { elevate } from '@owlmeans/server-entrypoint'
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
import { WL_PROVIDE, entrypoints as wlEntrypoints } from '@owlmeans/wled'
import * as actions from './actions/index.js'

elevate(wlEntrypoints, WL_PROVIDE, actions.provide)

export const entrypoints = wlEntrypoints as ServerEntrypoint<unknown>[]
