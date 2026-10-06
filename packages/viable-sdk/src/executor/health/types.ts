import type { TargetHealthInput, TargetHealthProbes, TargetHealthReading } from '../types.js'

/**
 * Reading the target's own health endpoint, and deciding what its answer means.
 *
 * Two callers need it and they must agree: the boot check, which waits for a boot to resolve one
 * way or the other, and the local run's status, which is the only thing that ever notices a target
 * that came up and then stopped being able to serve. The classifier is pure and the IO is a thin
 * wrapper over it.
 */
export interface HealthHelper {
  /**
   * What a target's answer means.
   *
   * The order of these checks is the contract, not a style choice:
   *
   * 1. **Identity outranks health.** A leftover process answering `200 ok` is still a leftover, and
   *    everything it reports describes the build IT was started with. Terminal, because waiting
   *    never turns another process's health into ours — the port has to be taken back.
   * 2. **A non-2xx is a failure even when the body cannot be parsed.** This is what made a target
   *    answering 503 with an HTML error page read as *ready*: an unparseable body left `phase`
   *    undefined, and undefined meant "an old target that only listens once it is up".
   * 3. **A target that says it failed is terminal**, and its own message is the reason.
   * 4. **A database the target cannot reach is a failure it will not report any other way.** It
   *    answers `200 {status:'OK'}` with `db.ok: false`, which by rule 2's fallback would also have
   *    read as ready. Not terminal: a database that went away can come back.
   * 5. **A queue store it cannot reach is the same failure with a different dependency** — an app
   *    whose jobs cannot be enqueued serves pages and silently does none of the work behind them.
   * 6. Only then does a missing phase mean "an older target, and a reachable port is the answer".
   */
  classifyTargetHealth: (input: TargetHealthInput) => TargetHealthReading
  /**
   * Ask the target how it is, and classify the answer.
   *
   * The TCP probe runs first and short-circuits: there is no point spending a request timeout on a
   * port nothing is listening on, and a target mid-restart is exactly when this is called most.
   */
  readTargetHealth: (port: number, bootId: string, timeoutMs: number, probes?: TargetHealthProbes) => Promise<TargetHealthReading>
}
