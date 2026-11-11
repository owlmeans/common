export interface ResolvedAddress {
  address: string
  family: 4 | 6
}

/** A name resolver (DoH, split horizon, a test seam); it must answer every address of the name. */
export interface AddressResolver {
  (hostname: string, signal?: AbortSignal): Promise<ResolvedAddress[]>
}

export interface NetworkPolicyOptions {
  /** URL schemes allowed. Default `['https:', 'http:']`. */
  schemes?: string[]
  /** Allow loopback, private, link-local, CGNAT, multicast, reserved and internal names. Default `false`. */
  allowPrivate?: boolean
  /** CIDRs allowed even inside the denied ranges (`'127.0.0.1/32'` for a local stand-in). */
  allowCidrs?: string[]
  /** Extra CIDRs to deny. */
  denyCidrs?: string[]
  /** When set, only these hosts (`x.com`, `*.x.com`). */
  allowHosts?: string[]
  /** Hosts never reached. */
  denyHosts?: string[]
  /** Ports allowed. Default any. */
  ports?: number[]
  /** Follow an https → http redirect. Default `false`. */
  allowDowngrade?: boolean
  /** Accept `user:pass@` in URLs. Default `false`. */
  allowUrlCredentials?: boolean
  /** Accept a name the local resolver cannot resolve when a remote-DNS proxy will. Default `false`. */
  trustProxyDns?: boolean
  resolver?: AddressResolver
}

/** What the package may reach. Every connection goes through it. */
export interface NetworkPolicy {
  /** Whether a remote-DNS proxy may resolve names this side cannot. */
  readonly trustProxyDns: boolean
  /** Scheme, credentials, host patterns, port and downgrade (`from` is the previous hop) — no DNS. */
  assertUrl: (url: URL, from?: URL) => void
  /** Every address of a name, checked; one refused address refuses the name. */
  resolve: (hostname: string, signal?: AbortSignal) => Promise<ResolvedAddress[]>
  /** Whether one address may be connected to. */
  allowsAddress: (address: string) => boolean
}
