import type { CommonConfig } from '@owlmeans/config'
import { toConfigRecord } from '@owlmeans/config'
import type { FlowConfig, ShallowFlow, WithFlowConfig } from './types.js'
import { CFG_FLOW_PREFIX, FLOW_RECORD } from './consts.js'

export const flow = <C extends CommonConfig>(cfg: C, flow: ShallowFlow): C => {
  if (cfg.records == null) {
    cfg.records = []
  }
  cfg.records.push({ ...toConfigRecord(flow), id: `${CFG_FLOW_PREFIX}:${flow.flow}`, recordType: FLOW_RECORD })

  return cfg
}

export const configureFlows = <C extends CommonConfig>(cfg: C & WithFlowConfig, config: FlowConfig): C & WithFlowConfig => {
  cfg.flowConfig = config

  return cfg
}
