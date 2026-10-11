import { AuthUnknown, TypeMissmatchError } from '@owlmeans/auth'
import type { AuthPlugin, AuthPluginHelper } from './types.js'
import type { AppContext, AppConfig } from '../types.js'

export const createAuthPluginHelper = (): AuthPluginHelper => {
  const assertType = (type: string, plugin: AuthPlugin): void => {
    if (type !== plugin.type) {
      throw new TypeMissmatchError(plugin.type)
    }
  }

  const getPlugin = async (type: string, context: AppContext<AppConfig>): Promise<AuthPlugin> => {
    const { plugins } = await import('./index.js')
    const plugin = plugins[type]
    if (plugin == null) {
      throw new AuthUnknown(type)
    }
    return plugins[type](context)
  }

  return { assertType, getPlugin }
}

export const authPluginHelper = createAuthPluginHelper()

/** @deprecated compat:factory-refactor — use `authPluginHelper.assertType(…)` */
export const assertType = (type: string, plugin: AuthPlugin): void => authPluginHelper.assertType(type, plugin)

/** @deprecated compat:factory-refactor — use `authPluginHelper.getPlugin(…)` */
export const getPlugin = async (type: string, context: AppContext<AppConfig>): Promise<AuthPlugin> =>
  await authPluginHelper.getPlugin(type, context)
