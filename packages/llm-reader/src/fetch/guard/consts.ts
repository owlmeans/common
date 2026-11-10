/**
 * IPv4 space that is not the public internet, as `[network, prefix]`: this-network, private,
 * carrier-grade NAT, loopback, link-local (cloud metadata at 169.254.169.254), IETF protocol
 * assignments, documentation, benchmarking, multicast, reserved and broadcast.
 */
export const NON_PUBLIC_V4: ReadonlyArray<readonly [string, number]> = Object.freeze([
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const)

/** Host names that are local by definition, whatever DNS says. */
export const LOCAL_NAMES: ReadonlyArray<string> = Object.freeze(['localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback'])

/** Name suffixes that never leave the local network. */
export const LOCAL_SUFFIXES: ReadonlyArray<string> = Object.freeze(['.localhost', '.local', '.internal', '.home.arpa'])
