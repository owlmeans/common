import type { CheckoutPlugin } from '../types.js'
import type { CheckoutPluginRegistry } from './checkout-registry/types.js'

/**
 * The gateway's checkout plugins, the way `ExecutionService.use` seats its own: a plugin with an
 * alias already registered replaces it in place (a layer wired twice must not answer twice), one
 * without an alias is appended.
 */
export const makeCheckoutPluginRegistry = (): CheckoutPluginRegistry => {
  const plugins: CheckoutPlugin[] = []

  return {
    use: plugin => {
      const at = plugin.alias != null ? plugins.findIndex(entry => entry.alias === plugin.alias) : -1
      if (at < 0) {
        plugins.push(plugin)
      } else {
        plugins[at] = plugin
      }
    },
    list: () => [...plugins],
  }
}
