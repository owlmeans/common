
import type { SubOpts, SubscriptionOptions } from '../types.js'

export const prepareSubOptions = (opts?: SubOpts): SubscriptionOptions => {
  let _opts: SubscriptionOptions = {}
  if (typeof opts === 'string') {
    _opts.key = opts
  } else if (typeof opts === 'number') {
    _opts.ttl = opts
  } else if (typeof opts === 'boolean') {
    _opts.once = opts
  } else if (typeof opts === 'object') {
    _opts = opts
  }

  return _opts
}
