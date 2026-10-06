export interface ServiceEndpoint {
  host: string
  port: number
}

/**
 * What this machine actually provides, asked by a connect attempt — the platform provisions
 * nothing here, so the only honest answer comes from trying.
 */
export interface ProbeHelper {
  /**
   * The host and port a connection URL names.
   *
   * `null` for anything unparseable, so a malformed value degrades to "not reachable" rather than
   * throwing somewhere a caller has no branch for it.
   */
  serviceEndpoint: (url: string | undefined) => ServiceEndpoint | null
  /** Whether something is listening where a connection string points. Exported for the setup flow. */
  probeUrl: (url: string | undefined) => Promise<boolean>
  /** Whether a TCP connect to `host:port` succeeds within the timeout. */
  probePort: (host: string, port: number, timeoutMs?: number) => Promise<boolean>
}
