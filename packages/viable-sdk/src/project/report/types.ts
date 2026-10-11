import type { SetupReport } from '../types.js'

/** What a project needs before it can run here, read off ONE setup report. */
export interface SetupReportModel {
  readonly report: SetupReport
  /** What is still missing before the application can start. */
  missingServices: () => Array<'database' | 'queue'>
  /**
   * The answer a parent agent reads when the project cannot run yet.
   *
   * It is written as a QUESTION with three answers, because which one is right is the user's to
   * decide and nobody else's: they may already run Postgres, they may want one installed here, or
   * they may prefer a hosted free tier and never install anything. Guessing means either a container
   * on somebody's machine they did not ask for, or a connection string invented for a database that
   * does not exist — and the second surfaces minutes later as a boot error nobody can place.
   */
  renderSetupGuide: () => string
}
