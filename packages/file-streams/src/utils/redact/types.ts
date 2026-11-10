export interface RedactedProxy {
  type: string
  host: string
  port: number
  id?: string
}

export interface RedactUtils {
  /**
   * `scheme://host[:port]/path` with no userinfo, query or fragment, and opaque path segments
   * (20+ token characters: Drive ids, capability paths) masked.
   */
  url: (url: string | URL) => string
  /** A proxy by its credential-free id. */
  proxy: (endpoint: RedactedProxy) => string
}
