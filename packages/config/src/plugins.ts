import { AppType } from '@owlmeans/context'
import { PLUGIN_RECORD } from './consts.js'
import type { CommonConfig, PluginConfig } from './types.js'

export const plugin = <C extends CommonConfig, R extends Partial<PluginConfig>>(
  config: C, record: R | string, id?: string
): C => {
  if (config[PLUGIN_RECORD] == null) {
    config[PLUGIN_RECORD] = []
  }
  let _record: R = typeof record === 'string' ? { value: record } as R : record
  if (_record.id == null) {
    if (id == null) {
      throw SyntaxError('Plugin id is required')
    }
    _record.id = id
  }
  if (_record.type == null) {
    _record.type = AppType.Backend
  }
  config[PLUGIN_RECORD].push(_record as PluginConfig)

  return config
}

export const clientPlugin = <C extends CommonConfig, R extends Partial<PluginConfig>>(
  config: C, record: R | string, id?: string
): C => plugin(
  config,
  typeof record === 'string'
    ? { value: record, type: AppType.Frontend }
    : { type: AppType.Frontend, ...record }
  , id)
