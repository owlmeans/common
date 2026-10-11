import type { SlotShellResult, SubProject } from '@owlmeans/viable-common'
import type { BootCheckReport, BootCheckStatus } from '../types.js'

/**
 * The shell half of the local executor — every `SlotShellCommand`, against a directory.
 *
 * The contract every method answers with is the publisher's: **error text, or `null` for
 * success**. It is not a transcript — a command that fails returns the diagnostics a fixer or a
 * person can act on, and a command that succeeds returns nothing at all.
 */
export interface LocalShellHelper {
  bun: (args?: string, options?: { subproject?: SubProject, env?: Record<string, string> }) => Promise<string | null>
  /**
   * Throw the lockfile away and install again.
   *
   * The truncate is the point. `bun install` on its own reproduces whatever the lockfile says,
   * and a target's lockfile was written the day the project was created — so a framework
   * package republished afterwards is invisible to it no matter how often the target is
   * rebuilt. Emptied rather than deleted, matching initialization: bun reads an empty file as
   * "no lockfile", so a failed install leaves a state the next attempt resolves cleanly instead
   * of one where a stale lock has come back.
   */
  reinstall: () => Promise<string | null>
  buildCommon: () => Promise<string | null>
  validate: (subprojectOverride?: SubProject) => Promise<string | null>
  /** The buildability check for the UI: the browser bundle really built, or the reason it did not. */
  validateWithRenderer: () => Promise<string | null>
  /**
   * Rebuild the whole target, in dependency order.
   *
   * The libraries first, because everything else resolves them from `node_modules` at RUN time
   * and follows each to its `build/index.js` — a bundle built before them starts with
   * `Cannot find package '<slug>-backend'`, a message about a dependency for a build that never
   * happened. The remaining three are independent, so all of them run and their problems are
   * reported together rather than one round trip at a time.
   */
  build: () => Promise<string | null>
  /** Build the api only — the type check the frontend renderer build cannot give it. */
  validateBackend: () => Promise<string | null>
  /**
   * Reconcile the target's database with its code.
   *
   * The target owns its own structure: every `@owlmeans/postgres` resource creates and updates
   * its table while the context initializes. So a sync is not a command run against the source
   * tree — it is *check that the database is there, then restart the backend* — and there is
   * nothing to generate and no migration file to apply.
   *
   * A local target's database is the developer's. The platform provisions none, so an absent
   * URL is reported by NAME rather than repaired: it is a line the person has to write, and
   * "database unavailable" would send them looking at a server instead.
   */
  dbSync: () => Promise<string | null>
  /**
   * Answering, not enforcing.
   *
   * The connector refuses on its own before every spawn regardless; this exists so a caller can
   * ask BEFORE letting a merge reach a build, and report the violations to the person whose
   * repository they belong to.
   */
  integrity: () => Promise<SlotShellResult>
  /**
   * Start a real boot in isolation and return at once.
   *
   * A second start joins the running check rather than spawning another instance onto the port.
   * The verdict is read with {@link LocalShellHelper.bootCheckStatus}; `wait` is the legacy blocking path for a
   * caller that predates the job.
   */
  bootCheck: (options?: { skipBuild?: boolean, wait?: boolean }) => Promise<BootCheckReport | null>
  bootCheckStatus: () => Promise<BootCheckStatus>
}
