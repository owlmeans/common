import { createService } from '@owlmeans/context'
import type { ConsoleMailerService, MailerService, MailMessage } from './types.js'
import { MAILER_SERVICE, CONSOLE_MAILER } from './consts.js'
import { mailAttachmentHelper } from './attachment.js'
import { logger } from '@owlmeans/log'

const log = logger('mailer')

/** Dev/test transport: logs the message to console and stores it for inspection. */
export const makeConsoleMailerService = (alias = CONSOLE_MAILER): ConsoleMailerService => {
  const captured: MailMessage[] = []

  const service = createService<MailerService>(alias, {
    send: async (message: MailMessage): Promise<void> => {
      captured.push(message)
      // The explicit dev transport: printing the mail IS its delivery, so its envelope — sender,
      // recipient, subject, attachment names and sizes — is written at `info` under the scope
      // `mailer`. The text (a login code, a person's message) is personal content: it is written
      // only while `mailer` logs at debug (a development level, or `cfg.log.debug: 'mailer'`).
      // Attachment content never reaches a log. Never register it where real mail is sent.
      const attachments = mailAttachmentHelper.describe(message.attachments)
      const envelope = {
        ...(message.from != null ? { from: message.from } : {}),
        to: message.to, subject: message.subject,
      }
      log.info('Mail written to the console', {
        ...envelope, ...(attachments.length > 0 ? { attachments } : {}),
      }, { event: 'mail.console' })
      if (log.enabled('debug')) {
        log.debug('Mail body', { ...envelope, body: message.text ?? message.html ?? '' }, { event: 'mail.console.body' })
      }
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
