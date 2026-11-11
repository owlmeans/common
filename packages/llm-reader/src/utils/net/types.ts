import type { HttpProxyEndpoint, ProxySpec } from '../../fetch/proxy/types.js'

/** Runtime, proxy-spec and `NO_PROXY` plumbing. Library-private. */
export interface NetUtils {
  /** Running on Bun (`process.versions.bun`) — never decided by a binary name. */
  isBun: () => boolean
  /**
   * Whether a `NO_PROXY`-style list names this host — the live `NO_PROXY` / `no_proxy` when no
   * list is given. A runtime silently bypasses an explicit proxy for such a host.
   */
  noProxyMatches: (host: string, port: string, list?: string) => boolean
  /** Parse `scheme://user:pass@host:port`, `host:port:user:pass` or `host:port` (http). */
  parseProxy: (input: string | ProxySpec) => ProxySpec
  /** `scheme://user:***@host:port` — the id a proxy is logged and reported by. */
  maskProxy: (spec: ProxySpec) => string
  /** The endpoint an HTTP(S) proxy is used through directly. */
  directEndpoint: (spec: ProxySpec) => HttpProxyEndpoint
  isSocks: (spec: ProxySpec) => boolean
}
