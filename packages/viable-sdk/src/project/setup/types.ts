import type { SetupReport } from '../types.js'

export interface SetUserEnvResult {
  /** The keys that were written — a blank value is skipped, never written empty. */
  written: string[]
  /** The file they were written to. */
  file: string
}

/**
 * What a project needs before it can run here, and what this machine already provides.
 *
 * The platform provisions nothing on somebody's own computer: a database and, for a project with a
 * background worker, a queue store are the two things it cannot supply and cannot guess. So the
 * connector finds out what is already there, and where nothing is, ASKS — it never installs
 * something on a person's machine on its own initiative and never invents a connection string.
 */
export interface SetupHelper {
  /** Everything a connection string says except who is connecting. */
  redactUrl: (url: string) => string
  /** Whether a command can be run here. `--version` rather than `which`, which Windows lacks. */
  probeCommand: (command: string) => Promise<boolean>
  /** What the project in `dir` needs and what this machine provides: services, tools, platform. */
  readSetupReport: (dir: string) => Promise<SetupReport>
  /**
   * Write the user's own service lines into their half of the `.env`.
   *
   * Replaces the key where it already exists outside the managed block and appends it otherwise, so
   * running this twice leaves one line rather than two — a `.env` takes the LAST assignment, and two
   * copies of a credential is one of them being quietly ignored.
   */
  setUserEnv: (dir: string, values: Record<string, string>) => Promise<SetUserEnvResult>
}
