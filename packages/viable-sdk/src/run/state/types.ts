import type { SlotAppClaim } from '@owlmeans/viable-common'
import type { LocalProcessRecord, LocalRunRecord } from '../types.js'

/** What a local run of ONE project directory is, written down, and the children it starts. */
export interface RunStateHelper {
  /** The run record of the directory, or `null` when there is none or it cannot be read. */
  readRun: () => Promise<LocalRunRecord | null>
  writeRun: (record: LocalRunRecord) => Promise<void>
  clearRun: () => Promise<void>
  /**
   * Start the target's HTTP server as a detached child.
   *
   * Detached so the whole group can be signalled later — the child is a shell wrapping `bun`, and a
   * signal aimed at the shell alone leaves `bun` holding the port.
   *
   * `app` (absent or `main`: main's api, exactly as before apps) starts another app's api of a split
   * project — its own package, port (`3000 + 10·index`), base path and argv marker.
   */
  startApi: (env?: Record<string, string>, app?: SlotAppClaim) => Promise<LocalProcessRecord>
  /**
   * Start the target's queue worker, when this tree has one.
   *
   * The SAME `dist/index.js` as the api, out of the same package tree — the argv marker is the only
   * thing separating the two processes, which is why nothing may reclaim a port without excluding
   * the other's marker. Most generated applications declare no queues, and their absence is not a
   * degraded state.
   */
  startWorker: () => Promise<LocalProcessRecord | null>
  /**
   * Bounce the api child so it reconciles the target's tables against its code.
   *
   * What `DbSync` means for a target that owns its own structure: every `@owlmeans/postgres`
   * resource creates and updates its table while the context initializes, so there is nothing to
   * generate and no migration file to apply — the sync IS the restart. A tree with no run in front
   * of it answers `null`: there is no process to bounce, and reporting that as a failure would send
   * a caller after a repair that does not apply.
   *
   * `app` (absent or `main`: main's api) bounces ONE other app's api of a split run while the others
   * keep serving — `null` too when the run holds no such app.
   */
  restartApi: (app?: string) => Promise<string | null>
}
