export interface AddressGuardOptions {
  /** Let private, loopback and link-local targets through (an intranet reader). Default `false`. */
  allowPrivateNetwork?: boolean
  /** Hosts (and their subdomains) let through whatever they resolve to — `127.0.0.1` for a test site. */
  allowHosts?: string[]
}

/**
 * Refuses targets in non-public address space before a request leaves: loopback, private,
 * carrier-grade NAT, link-local (cloud metadata), benchmarking, multicast, reserved, and the IPv6
 * forms that embed them. Check every hop of a redirect chain, not only the first URL.
 */
export interface AddressGuard {
  /**
   * Throw `ReaderRefusedError` unless `url` may be fetched. `resolve: true` (a direct request)
   * also resolves the host and refuses when ANY address it resolves to is non-public; through a
   * proxy the proxy resolves, so only a literal address or a local name is checked.
   */
  check: (url: string, resolve: boolean) => Promise<void>
  /** Check one already-resolved address (the SOCKS bridge resolves socks4/socks5 targets itself). */
  checkAddress: (host: string, address: string) => void
  /** Whether an IP address is outside public space. */
  isNonPublic: (address: string) => boolean
}
