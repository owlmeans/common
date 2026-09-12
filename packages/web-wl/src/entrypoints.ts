
import { bind } from '@owlmeans/client-entrypoint'
import { wledEntrypoints } from '@owlmeans/wled'

export const entrypoints = [bind(wledEntrypoints.provide)]
