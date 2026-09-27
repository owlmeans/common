import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Whether a resolved address is one nothing outside this host's own network should be allowed to
 * fetch on the server's behalf — loopback, the RFC 1918 / RFC 4193 private ranges, link-local, and
 * the unspecified address, in both address families. `::ffff:10.0.0.1`-shaped IPv4-mapped IPv6
 * addresses are unwrapped first, because an attacker who cannot reach a private IPv4 literal past
 * this check would otherwise reach the same host through its IPv6-mapped spelling.
 */
export const isPrivateAddress = (address: string): boolean => {
  const family = isIP(address)
  if (family === 0) return true // unparseable — refuse rather than guess

  let ip = address
  if (family === 6 && ip.toLowerCase().startsWith('::ffff:')) {
    const mapped = ip.slice(7)
    if (isIP(mapped) === 4) ip = mapped
  }

  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)

    return a === 127 || a === 10 || a === 0
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254)
  }

  const lower = ip.toLowerCase()

  return lower === '::1' || lower === '::'
    || lower.startsWith('fe80:') // link-local
    || lower.startsWith('fc') || lower.startsWith('fd') // unique local, fc00::/7
}

/**
 * Resolve `hostname` and refuse if ANY of its addresses is private.
 *
 * This is a pre-flight check, not a connection pin: a genuinely adversarial DNS server could
 * still change its answer between this call and the fetch that follows (DNS rebinding). It closes
 * the ordinary case — a metadata document naming `localhost`, a cluster-internal hostname, or an
 * RFC 1918 literal — which is what a document an unrelated third party controls is actually
 * likely to try, whether by mistake or on purpose.
 */
export const assertPublicHostname = async (hostname: string): Promise<void> => {
  const direct = isIP(hostname)
  const addresses = direct !== 0
    ? [hostname]
    : (await lookup(hostname, { all: true })).map(entry => entry.address)

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error(`refused-address:${hostname}`)
  }
}
