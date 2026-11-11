import { createService } from '@owlmeans/context'
import type { MailMessage } from '@owlmeans/mailer'
import type { ServerContext } from '@owlmeans/server-context'
import { SMTP_MAILER } from './consts.js'
import { makeSmtpMailerTransport } from './transport.js'
import type { SmtpConfig, SmtpMailerOptions, SmtpMailerService, SmtpMailerTransport } from './types.js'

/**
 * @deprecated compat:mailer-host — use `appendSmtpMailer(ctx, opts)`, which registers the SMTP
 * transport with the mailer host. This standalone service under `alias` delegates to the same
 * transport, bound to the context that registers it, and prefixes its errors with `alias`.
 */
export const makeSmtpMailerService = (
  alias = SMTP_MAILER, opts: SmtpMailerOptions = {}
): SmtpMailerService => {
  let transport: SmtpMailerTransport | null = null

  const bound = (): SmtpMailerTransport =>
    transport ??= makeSmtpMailerTransport(
      service.assertCtx<SmtpConfig, ServerContext<SmtpConfig>>(alias), { ...opts, id: alias }
    )

  const service: SmtpMailerService = createService<SmtpMailerService>(alias, {
    send: async (message: MailMessage): Promise<void> => { await bound().send(message) },
    verify: async (): Promise<true> => await bound().verify(),
    close: async (): Promise<void> => { await transport?.close() },
  }, current => async () => {
    await bound().init()
    current.initialized = true
  })

  return service
}
