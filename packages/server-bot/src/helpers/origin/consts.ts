/** A host header value we accept: a DNS name or IPv4, or a bracketed IPv6, with an optional port. */
export const BOT_HOST_PATTERN = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/

/** Host suffixes that never resolve publicly. */
export const BOT_PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.test', '.example', '.invalid'] as const

/** IPv4 ranges that are not publicly routable, as `[first octet, second octet, prefix length]`. */
export const BOT_PRIVATE_V4: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 8], [10, 0, 8], [100, 64, 10], [127, 0, 8], [169, 254, 16], [172, 16, 12], [192, 168, 16],
]
