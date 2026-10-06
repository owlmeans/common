import type { CheckoutPlugin } from '../../types.js'

/** The checkout plugins seated on one gateway instance. */
export interface CheckoutPluginRegistry {
  use: (plugin: CheckoutPlugin) => void
  list: () => readonly CheckoutPlugin[]
}
