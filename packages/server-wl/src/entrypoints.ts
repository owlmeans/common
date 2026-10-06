
import { bind } from '@owlmeans/server-entrypoint'
import { wledEntrypoints } from '@owlmeans/wled'
import * as actions from './actions/index.js'

export const entrypoints = [bind(wledEntrypoints.provide, actions.provide)]
