/** Throttle subjects as non-raw keys: digests of what a request is throttled by. */
export interface ThrottleKeyHelper {
  /** Collision-resistant, non-raw key for case-insensitive email throttles. */
  emailThrottleKey: (email: string) => string
  /** Non-raw key for request-source throttles. Callers remain responsible for trusted-proxy parsing. */
  ipThrottleKey: (ip: string) => string
}
