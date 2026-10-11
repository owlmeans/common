import type { ProbeTarget } from '../types.js'

/**
 * Whether the server a connection string names answers at all — asked synchronously, because
 * Bun decides `test` vs `test.skip` synchronously and every gate is read at module scope.
 */
export interface ReachabilityUtils {
  /**
   * Every `host:port` in the authority of a connection string, or `null` when the string names
   * nothing a TCP connect can check — an SRV record, a unix socket, or a shape this cannot read.
   * `null` leaves the gate exactly as the variable alone would have it.
   */
  parseTargets: (url: string, defaultPort: number) => ProbeTarget[] | null
  /**
   * `null` when at least one target accepts a TCP connection, otherwise the reason none did.
   *
   * A probe that cannot run at all also answers `null`: not knowing is not evidence the service is
   * down, and the suite then behaves exactly as it did before probes existed.
   */
  probeTargets: (targets: ProbeTarget[]) => string | null
  /**
   * The skip reason for a populated connection-string variable whose server does not answer, or
   * `null` when it answers or cannot be probed. Printed once per variable and address, so a closed
   * gate is never mistaken for a suite that has nothing to run.
   */
  unreachableReason: (variable: string, url: string, defaultPort: number) => string | null
}
