/** IPv4 ranges never reached unless allowed: this host, private, CGNAT, link-local, documentation, multicast, reserved. */
export const DENIED_IPV4_CIDRS: readonly string[] = Object.freeze([
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24',
  '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24',
  '224.0.0.0/4', '240.0.0.0/4', '255.255.255.255/32',
])

/**
 * IPv6 ranges never reached unless allowed. The IPv4-mapped and IPv4-compatible ranges are not
 * listed — a block list matches every IPv4 address against them — the embedded IPv4 of such an
 * address is extracted and checked against the IPv4 list instead.
 */
export const DENIED_IPV6_CIDRS: readonly string[] = Object.freeze([
  '::/128', '::1/128', '64:ff9b:1::/48', '100::/64', '2001:db8::/32', 'fc00::/7', 'fe80::/10', 'fec0::/10', 'ff00::/8',
])

/** Names that only mean something inside a network. */
export const DENIED_HOST_SUFFIXES: readonly string[] = Object.freeze([
  'localhost', '.localhost', '.local', '.internal', '.svc', '.cluster.local', '.home.arpa', '.lan', '.intranet',
])

export const DEFAULT_SCHEMES: readonly string[] = Object.freeze(['https:', 'http:'])
