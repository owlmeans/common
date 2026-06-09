import { createService } from '@owlmeans/context'
import type { MailerService } from '@owlmeans/mailer'
import { MAILGUN_MAILER } from './consts.js'

export const makeMailgunMailerService = (alias = MAILGUN_MAILER): MailerService =>
  createService<MailerService>(alias, {
    send: async () => {
      throw new Error('server-mailer-mailgun: not yet implemented (Phase 2)')
    },
  })
