import { createService } from '@owlmeans/context'
import type { ConsoleMailerService, MailerService, MailMessage } from './types.js'
import { MAILER_SERVICE, CONSOLE_MAILER } from './consts.js'
import { logger } from '@owlmeans/log'

const log = logger('mailer')

/** Dev/test transport: logs the message to console and stores it for inspection. */
export const makeConsoleMailerService = (alias = CONSOLE_MAILER): ConsoleMailerService => {
  const captured: MailMessage[] = []

  const service = createService<MailerService>(alias, {
    send: async (message: MailMessage): Promise<void> => {
      captured.push(message)
      // The explicit dev transport: printing the mail IS its delivery, so it is written at `info`
      // under the scope `mailer` and stays visible at the default level (e2e runs read login codes
      // from it). Never register it where real mail is sent.
      log.info('Mail written to the console', {
        ...(message.from != null ? { from: message.from } : {}),
        to: message.to, subject: message.subject, body: message.text ?? message.html ?? '',
      }, { event: 'mail.console' })
    },
  }) as ConsoleMailerService

  service.captured = captured
  return service
}

/** Alias of makeConsoleMailerService registered under the default MAILER_SERVICE alias.
 *  Useful as a drop-in replacement during development and integration tests.
 */
export const makeDefaultConsoleMailerService = (): ConsoleMailerService =>
  makeConsoleMailerService(MAILER_SERVICE)
