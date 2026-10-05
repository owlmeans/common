/** The pre-flight address checks a server-side fetch of a third-party URL goes through. */
export interface SsrfHelper {
  /**
   * Whether a resolved address is one nothing outside this host's own network should be allowed to
   * fetch on the server's behalf — loopback, the RFC 1918 / RFC 4193 private ranges, link-local, and
   * the unspecified address, in both address families. `::ffff:10.0.0.1`-shaped IPv4-mapped IPv6
   * addresses are unwrapped first, because an attacker who cannot reach a private IPv4 literal past
   * this check would otherwise reach the same host through its IPv6-mapped spelling.
   */
  isPrivateAddress: (address: string) => boolean
  /**
   * Resolve `hostname` and refuse if ANY of its addresses is private.
   *
   * This is a pre-flight check, not a connection pin: a genuinely adversarial DNS server could
   * still change its answer between this call and the fetch that follows (DNS rebinding). It closes
   * the ordinary case — a metadata document naming `localhost`, a cluster-internal hostname, or an
   * RFC 1918 literal — which is what a document an unrelated third party controls is actually
   * likely to try, whether by mistake or on purpose.
   */
  assertPublicHostname: (hostname: string) => Promise<void>
}
