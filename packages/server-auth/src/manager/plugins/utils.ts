import { AuthUnknown, TypeMissmatchError } from '@owlmeans/auth'
import type { AuthPlugin } from './types.js'
import type { AppContext, AppConfig } from '../types.js'

export const assertType = (type: string, plugin: AuthPlugin) => {
  if (type !== plugin.type) {
    throw new TypeMissmatchError(plugin.type)
  }
}

/**
 * @throws {AuthUnknown}
 */
export const getPlugin = async (type: string, context: AppContext<AppConfig>): Promise<AuthPlugin> => {
  const { plugins } = await import('./index.js')
  const plugin = plugins[type]
  if (plugin == null) {
    throw new AuthUnknown(type)
  }
  return plugins[type](context)
}
