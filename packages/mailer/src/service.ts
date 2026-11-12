import { createService } from '@owlmeans/context'
import type { ConsoleMailerService } from './types.js'
import { MAILER_SERVICE, CONSOLE_MAILER } from './consts.js'
import { createConsoleMailerTransport } from './console.js'

/**
 * The console transport as a standalone service under `alias`: logs each message and keeps it in
 * `captured`. The quickest double for code that resolves a mailer by alias in a test; a context
 * built around the mailer host gets the same transport from `createConsoleMailerTransport()`.
 */
export const makeConsoleMailerService = (alias = CONSOLE_MAILER): ConsoleMailerService => {
  const transport = createConsoleMailerTransport(alias)

  return createService<ConsoleMailerService>(alias, { send: transport.send, captured: transport.captured })
}

/** Alias of makeConsoleMailerService registered under the default MAILER_SERVICE alias.
 *  Useful as a drop-in replacement during development and integration tests.
 */
export const makeDefaultConsoleMailerService = (): ConsoleMailerService =>
  makeConsoleMailerService(MAILER_SERVICE)
