import type { ClientConfig } from '@owlmeans/client-context'
import { DEBUG_CONFIG_KEY } from './consts.js'
import type { ClientContext, DebugConfigRecord } from './types.js'

export const appendStateDebug = <C extends ClientConfig, T extends ClientContext<C>>(ctx: T, state: string) => {
  let debugRecord = ctx.cfg.records
    .find(record => record.id === DEBUG_CONFIG_KEY) as DebugConfigRecord
  if (debugRecord == null) {
    debugRecord = { id: DEBUG_CONFIG_KEY }
    ctx.cfg.records.push(debugRecord)
  }
  debugRecord.states = debugRecord.states ?? []
  debugRecord.states.push(state)
}
