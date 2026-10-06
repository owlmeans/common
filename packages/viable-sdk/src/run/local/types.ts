import type { LocalRunStatus, RunLocalOptions, RunLocalResult } from '../types.js'

/**
 * Run the generated application of ONE project directory on the developer's own machine.
 *
 * The slot's equivalent is a pod: a publisher supervising two children and a static server, with
 * Kubernetes underneath. None of that exists here, and the parts that were about the pod are
 * deliberately not reproduced — there is no respawn ladder, no reconciler and no health route,
 * because a developer watching their own terminal is the supervisor. What IS reproduced is the
 * shape: the same ports, the same argv marker, the same environment, and the same "port ownership
 * is the only proof" rule about restarts.
 */
export interface LocalRunHelper {
  /**
   * Build the target, start its processes, serve its browser app.
   *
   * A previous run is stopped first: both halves bind fixed ports, and a replacement that races the
   * process it is replacing loses the bind and exits — with nothing announcing it, since a failed
   * `listen` says nothing on its own.
   */
  runLocal: (options?: RunLocalOptions) => Promise<RunLocalResult>
  /**
   * Stop whatever the run record names, and forget it.
   *
   * Safe to call when nothing is running: the record is the only authority, and a stale one names
   * pids that are simply not alive. The children are detached, so they outlive the process that
   * started them — which is exactly why the record is a file and this is the only way to end them.
   */
  stopLocal: () => Promise<void>
  /**
   * What is running, and whether the target is actually serving.
   *
   * Two independent facts, because either one alone lies. A live pid says nothing about a target
   * that bound its port and then failed to reach its database — it answers `200` with `db.ok:false`
   * and would otherwise read as healthy. A health answer says nothing about a process that died
   * while something else holds the port.
   */
  localStatus: () => Promise<LocalRunStatus>
}
