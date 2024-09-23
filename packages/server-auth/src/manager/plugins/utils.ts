import { AuthUnknown, TypeMissmatchError } from '@owlmeans/auth'
import type { AuthPlugin } from './types.js'
import { plugins } from './index.js'
import type { AppContext, AppConfig } from '../types.js'

export const assertType = (type: string, plugin: AuthPlugin) => {
  if (type !== plugin.type) {
    throw new TypeMissmatchError(plugin.type)
  }
}

/**
 * @throws {AuthUnknown}
 */
export const getPlugin = (type: string, context: AppContext<AppConfig>): AuthPlugin => {
  const plugin = plugins[type]
  if (plugin == null) {
    throw new AuthUnknown(type)
  }
  return plugins[type](context)
}
