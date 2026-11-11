import type { BasicContext } from '@owlmeans/context'
import { appendMailerTransport } from '@owlmeans/mailer'
import type { MailMessage } from '@owlmeans/mailer'
import type { ServerConfig } from '@owlmeans/server-context'
import nodemailer from 'nodemailer'
import type { SMTPSentMessageInfo, Transporter } from 'nodemailer'
import { SMTP_MAILER } from './consts.js'
import { assertSmtpSettings } from './assert.js'
import { makeSmtpSettingsModel } from './settings.js'
import type { SmtpMailerAppendOptions, SmtpMailerTransport, SmtpMailerTransportOptions, SmtpSettings } from './types.js'

/**
 * The SMTP transport over `ctx.cfg.smtp`, read when it initializes and on every send — mounted
 * config files are resolved in place before the context initializes, so the values it sees are the
 * resolved ones. It keeps one unpooled nodemailer transporter.
 */
export const makeSmtpMailerTransport = <C extends ServerConfig>(
  ctx: BasicContext<C>, opts: SmtpMailerTransportOptions = {}
): SmtpMailerTransport => {
  const id = opts.id ?? SMTP_MAILER
  let transport: Transporter<SMTPSentMessageInfo> | null = null

  const settings = (): SmtpSettings => assertSmtpSettings(ctx.cfg.smtp, id, opts)

  const transporter = (): Transporter<SMTPSentMessageInfo> =>
    transport ??= nodemailer.createTransport(makeSmtpSettingsModel(settings()).toTransportOptions())

  // Credentials never reach the message: nodemailer reports the server's own reply only.
  const fail = (action: string, error: unknown): never => {
    const err = error as { code?: string, responseCode?: number, response?: string, message?: string }
    const detail = [err.code, err.responseCode, err.response ?? err.message]
      .filter(part => part != null && part !== '').join(' ')

    throw new Error(`${id}: ${action}${detail !== '' ? ` — ${detail}` : ''}`)
  }

  const send = async (message: MailMessage): Promise<void> => {
    const options = makeSmtpSettingsModel(settings()).toMailOptions(message)

    try {
      await transporter().sendMail(options)
    } catch (error) {
      fail(`failed to send to ${message.to}`, error)
    }
  }

  const verify = async (): Promise<true> => {
    try {
      await transporter().verify()
    } catch (error) {
      fail('failed to verify the SMTP connection', error)
    }

    return true
  }

  const close = async (): Promise<void> => {
    transport?.close()
    transport = null
  }

  // Validates the resolved settings and, when asked, authenticates without sending a message — so an
  // unusable relay fails the context's start rather than a later login code.
  const init = async (): Promise<void> => {
    settings()
    if (opts.verifyOnInit === true) await verify()
  }

  return { id, send, verify, close, init }
}

/**
 * Register the SMTP transport with the mailer host (`opts.alias`, `MAILER_SERVICE` by default) and
 * return it — the transport keeps `verify()` and `close()` for health checks and shutdown.
 */
export const appendSmtpMailer = <C extends ServerConfig>(
  ctx: BasicContext<C>, opts: SmtpMailerAppendOptions = {}
): SmtpMailerTransport => {
  const { alias, ...transport } = opts

  return appendMailerTransport(ctx, makeSmtpMailerTransport(ctx, transport), alias != null ? { alias } : {})
}
