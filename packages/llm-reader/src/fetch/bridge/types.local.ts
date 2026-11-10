import type { ProxySpec } from '../proxy/types.js'

/** One SOCKS upstream and the credentials a client presents to be routed to it. */
export interface Route {
  spec: ProxySpec
  user: string
  secret: Buffer
}
