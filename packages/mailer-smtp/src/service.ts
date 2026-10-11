import { createService } from '@owlmeans/context'
import type { MailMessage } from '@owlmeans/mailer'
import type { ServerContext } from '@owlmeans/server-context'
import nodemailer from 'nodemailer'
import type { SMTPSentMessageInfo, Transporter } from 'nodemailer'
import { SMTP_MAILER } from './consts.js'
import { assertSmtpSettings } from './assert.js'
import { makeSmtpSettingsModel } from './settings.js'
import type { SmtpConfig, SmtpMailerOptions, SmtpMailerService, SmtpSettings } from './types.js'

/**
 * SMTP transport for the `MailerService` contract. Reads `cfg.smtp` and keeps one
 * nodemailer transporter per service instance.
 *
 * Register it under `MAILER_SERVICE` so callers — the email-OTP plugin above all —
 * resolve it without knowing which transport is in play.
 */
export const makeSmtpMailerService = (
  alias = SMTP_MAILER, opts: SmtpMailerOptions = {}
): SmtpMailerService => {
  let transport: Transporter<SMTPSentMessageInfo> | null = null

  const settings = (): SmtpSettings => {
    const ctx = service.assertCtx<SmtpConfig, ServerContext<SmtpConfig>>(alias)
    return assertSmtpSettings(ctx.cfg.smtp, alias, opts)
  }

  const transporter = (): Transporter<SMTPSentMessageInfo> =>
    transport ??= nodemailer.createTransport(makeSmtpSettingsModel(settings()).toTransportOptions())

  // Credentials never reach the message: nodemailer reports the server's own reply only.
  const fail = (action: string, error: unknown): never => {
    const err = error as { code?: string, responseCode?: number, response?: string, message?: string }
    const detail = [err.code, err.responseCode, err.response ?? err.message]
      .filter(part => part != null && part !== '').join(' ')

    throw new Error(`${alias}: ${action}${detail !== '' ? ` — ${detail}` : ''}`)
  }

  const service = createService<SmtpMailerService>(alias, {
    send: async (message: MailMessage): Promise<void> => {
      const options = makeSmtpSettingsModel(settings()).toMailOptions(message)

      try {
        await transporter().sendMail(options)
      } catch (error) {
        fail(`failed to send to ${message.to}`, error)
      }
    },

    verify: async (): Promise<true> => {
      try {
        await transporter().verify()
      } catch (error) {
        fail('failed to verify the SMTP connection', error)
      }

      return true
    },

    close: async (): Promise<void> => {
      transport?.close()
      transport = null
    },
  }, current => async () => {
    // `configure()` resolves mounted config files before services initialize, so this validates
    // the resolved values and, when requested, verifies the relay without sending a message.
    settings()
    if (opts.verifyOnInit === true) await current.verify()
    current.initialized = true
  })

  return service
}
