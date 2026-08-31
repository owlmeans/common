import { createService } from '@owlmeans/context'
import type { MailerService, MailMessage } from './types.js'
import { MAILER_SERVICE } from './consts.js'

export const CONSOLE_MAILER = 'console-mailer'

/** Dev/test transport: logs the message to console and stores it for inspection. */
export const makeConsoleMailerService = (alias = CONSOLE_MAILER): MailerService & {
  /** Messages captured since the service was created (use in tests). */
  captured: MailMessage[]
} => {
  const captured: MailMessage[] = []

  const service = createService<MailerService>(alias, {
    send: async (message: MailMessage): Promise<void> => {
      captured.push(message)
      const from = message.from != null ? ` from=${message.from}` : ''
      console.log(`[console-mailer]${from} to=${message.to} subject="${message.subject}"`)
      console.log(`[console-mailer] body=${message.text ?? message.html ?? ''}`)
    },
  }) as MailerService & { captured: MailMessage[] }

  service.captured = captured
  return service
}

/** Alias of makeConsoleMailerService registered under the default MAILER_SERVICE alias.
 *  Useful as a drop-in replacement during development and integration tests.
 */
export const makeDefaultConsoleMailerService = (): ReturnType<typeof makeConsoleMailerService> =>
  makeConsoleMailerService(MAILER_SERVICE)
