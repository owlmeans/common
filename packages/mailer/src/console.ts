import { logger } from '@owlmeans/log'
import { CONSOLE_MAILER } from './consts.js'
import { mailAttachmentHelper } from './attachment.js'
import type { ConsoleMailerTransport, MailMessage } from './types.js'

const log = logger('mailer')

/**
 * The dev/test transport: writes each message to the log and keeps it in `captured`. It never
 * throws — it has nothing to fail — which is what makes it the right double in a test. The mailer
 * host falls back to one when no transport is registered.
 */
export const createConsoleMailerTransport = (id: string = CONSOLE_MAILER): ConsoleMailerTransport => {
  const captured: MailMessage[] = []

  const send = async (message: MailMessage): Promise<void> => {
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
  }

  return { id, captured, send }
}
