import type { MailMessage } from '@owlmeans/mailer'
import type { SendMailOptions, SMTPTransportOptions } from 'nodemailer'
import { SMTP_DEFAULT_PORT } from './consts.js'
import type { SmtpSettings } from './types.js'
import type { SmtpSettingsModel } from './settings/types.js'

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

export const makeSmtpSettingsModel = (smtp: SmtpSettings): SmtpSettingsModel => {
  const toTransportOptions = (): SMTPTransportOptions => ({
    host: smtp.host,
    port: toNumber(smtp.port, SMTP_DEFAULT_PORT),
    secure: toBoolean(smtp.secure, true),
    tls: { rejectUnauthorized: toBoolean(smtp.rejectUnauthorized, true) },
    ...(smtp.timeout != null ? { connectionTimeout: toNumber(smtp.timeout, 0) } : {}),
    ...(smtp.user != null && smtp.user !== ''
      ? { auth: { user: smtp.user, pass: smtp.pass ?? '' } }
      : {}),
  })

  const toMailOptions = (message: MailMessage): SendMailOptions => {
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

  return { toTransportOptions, toMailOptions }
}
