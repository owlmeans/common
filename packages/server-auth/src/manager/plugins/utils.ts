import type { Context } from '@owlmeans/server-context'
import { AuthUnknown } from '../../errors.js'
import { TypeMissmatchError } from './errors.js'
import type { AuthPlugin } from './types.js'
import { plugins } from './index.js'

export const assertType = (type: string, plugin: AuthPlugin) => {
  if (type !== plugin.type) {
    throw new TypeMissmatchError(plugin.type)
  }
}

/**
 * @throws {AuthUnknown}
 */
export const getPlugin = (type: string, context: Context): AuthPlugin => {
  const plugin = plugins[type]
  if (plugin == null) {
    throw new AuthUnknown(type)
  }
  return plugins[type](context)
}
