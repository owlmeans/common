import { createService } from '@owlmeans/context'
import type { MailMessage } from '@owlmeans/mailer'
import type { ServerContext } from '@owlmeans/server-context'
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import type Mail from 'nodemailer/lib/mailer/index.js'
import { SMTP_DEFAULT_PORT, SMTP_MAILER } from './consts.js'
import type { SmtpConfig, SmtpMailerService, SmtpSettings } from './types.js'

const toNumber = (value: number | string | undefined, def: number): number => {
  if (value == null || value === '') return def
  const num = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(num) ? num : def
}

const toBoolean = (value: boolean | string | undefined, def: boolean): boolean => {
  if (value == null || value === '') return def
  if (typeof value === 'boolean') return value

  return ['1', 'on', 'true', 'yes'].includes(value.trim().toLowerCase())
}

/**
 * Translate the settings block into nodemailer's transport options.
 *
 * Deliberately unpooled: a pooled transport holds its socket open and would keep a
 * short-lived process alive, and the traffic this serves — login codes — is far below
 * the volume that makes pooling worth that.
 */
export const toTransportOptions = (smtp: SmtpSettings): SMTPTransport.Options => ({
  host: smtp.host,
  port: toNumber(smtp.port, SMTP_DEFAULT_PORT),
  secure: toBoolean(smtp.secure, true),
  tls: { rejectUnauthorized: toBoolean(smtp.rejectUnauthorized, true) },
  ...(smtp.timeout != null ? { connectionTimeout: toNumber(smtp.timeout, 0) } : {}),
  ...(smtp.user != null && smtp.user !== ''
    ? { auth: { user: smtp.user, pass: smtp.pass ?? '' } }
    : {}),
})

/** Translate a provider-agnostic message into nodemailer's envelope, applying the config defaults. */
export const toMailOptions = (smtp: SmtpSettings, message: MailMessage): Mail.Options => {
  const headers = { ...smtp.headers, ...message.headers }
  const replyTo = message.replyTo ?? smtp.replyTo

  return {
    from: message.from ?? smtp.from,
    to: message.to,
    subject: message.subject,
    ...(message.text != null ? { text: message.text } : {}),
    ...(message.html != null ? { html: message.html } : {}),
    ...(replyTo != null ? { replyTo } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  }
}

/**
 * SMTP transport for the `MailerService` contract. Reads `cfg.smtp` and keeps one
 * nodemailer transporter per service instance.
 *
 * Register it under `MAILER_SERVICE` so callers — the email-OTP plugin above all —
 * resolve it without knowing which transport is in play.
 */
export const makeSmtpMailerService = (alias = SMTP_MAILER): SmtpMailerService => {
  let transport: Transporter<SMTPTransport.SentMessageInfo> | null = null

  const settings = (): SmtpSettings => {
    const ctx = service.assertCtx<SmtpConfig, ServerContext<SmtpConfig>>(alias)
    const smtp = ctx.cfg.smtp

    if (smtp?.host == null || smtp.host === '') {
      throw new SyntaxError(`${alias}: cfg.smtp.host is not configured`)
    }

    return smtp
  }

  const transporter = (): Transporter<SMTPTransport.SentMessageInfo> =>
    transport ??= nodemailer.createTransport(toTransportOptions(settings()))

  // Credentials never reach the message: nodemailer reports the server's own reply only.
  const fail = (action: string, error: unknown): never => {
    const err = error as { code?: string, responseCode?: number, response?: string, message?: string }
    const detail = [err.code, err.responseCode, err.response ?? err.message]
      .filter(part => part != null && part !== '').join(' ')

    throw new Error(`${alias}: ${action}${detail !== '' ? ` — ${detail}` : ''}`)
  }

  const service = createService<SmtpMailerService>(alias, {
    send: async (message: MailMessage): Promise<void> => {
      const options = toMailOptions(settings(), message)

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
  })

  return service
}
