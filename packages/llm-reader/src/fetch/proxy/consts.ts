/** Proxies tried for one request before its failure surfaces. */
export const DEFAULT_PROXY_ATTEMPTS = 3

/** How long a failed proxy is skipped, ms. */
export const DEFAULT_PROXY_COOLDOWN_MS = 60_000

/** Target statuses that mean "this exit is refused or broken" rather than "this page says so". */
export const DEFAULT_ROTATE_ON: readonly number[] = Object.freeze([407, 429, 502, 503])
