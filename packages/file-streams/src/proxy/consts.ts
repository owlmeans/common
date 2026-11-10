export const DEFAULT_PROXY_RETRIES = 1

export const DEFAULT_PROXY_COOLDOWN_MS = 30_000

/** The longest CONNECT reply head a proxy may send. */
export const CONNECT_MAX_HEADER_BYTES = 16 * 1024

/** Default ports by proxy type. */
export const DEFAULT_PROXY_PORTS: Readonly<Record<string, number>> = Object.freeze({
  http: 8080, https: 443, socks4: 1080, socks4a: 1080, socks5: 1080, socks5h: 1080,
})
