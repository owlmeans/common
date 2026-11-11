import { describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { ensureMailerService, MAILER_SERVICE } from '@owlmeans/mailer'
import type { MailerService } from '@owlmeans/mailer'
import type { ServerConfig } from '@owlmeans/server-context'
import { appendSmtpMailer, makeSmtpMailerService, makeSmtpMailerTransport, SMTP_MAILER } from '@owlmeans/mailer-smtp'
import type { SmtpSettings } from '@owlmeans/mailer-smtp'

const base: SmtpSettings = {
  host: 'smtp.example.org', user: 'no-reply@example.org', pass: 'secret', from: 'Example <no-reply@example.org>',
}

/** An unreachable relay: a refused local socket, never a wrong password against a live one. */
const unreachable: SmtpSettings = { ...base, host: '127.0.0.1', port: '1', secure: 'false', timeout: '1000' }

const context = (smtp?: Partial<SmtpSettings>): BasicContext<ServerConfig> => makeBasicContext({
  ready: false, service: 'smtp-transport-tests', type: AppType.Backend, services: {},
  ...(smtp != null ? { smtp } : {}),
} as ServerConfig)

/**
 * No relay: these pin how the transport plugs into the mailer host and fails, with nothing to
 * deliver to — the live spec (`send.spec.ts`) is the only one that sends.
 */
describe('@owlmeans/mailer-smtp — the transport in the mailer host', () => {
  test('appendSmtpMailer registers the transport the host sends through', () => {
    const ctx = context(base)
    const transport = appendSmtpMailer(ctx)

    expect(transport.id).toBe(SMTP_MAILER)
    expect(ensureMailerService(ctx).active()).toBe(transport)
  })

  test('registers into the host the alias option names', () => {
    const ctx = context(base)
    const transport = appendSmtpMailer(ctx, { alias: 'guarded-mail' })

    expect(ensureMailerService(ctx, 'guarded-mail').active()).toBe(transport)
    expect(ensureMailerService(ctx).active()).not.toBe(transport)
  })

  test('a missing relay fails the context start, before any socket', async () => {
    const ctx = context()
    appendSmtpMailer(ctx)
    ctx.configure()

    await expect(ctx.init()).rejects.toThrow(`${SMTP_MAILER}: cfg.smtp.host is not configured`)
  })

  test('authenticated mode requires a sender and credentials while the context starts', async () => {
    const ctx = context({ host: 'smtp.example.org' })
    appendSmtpMailer(ctx, { authenticated: true })
    ctx.configure()

    await expect(ctx.init()).rejects.toThrow('cfg.smtp.from, cfg.smtp.user, cfg.smtp.pass')
  })

  test('verifyOnInit turns an unusable relay into a failed start, named by the transport id', async () => {
    const ctx = context(unreachable)
    appendSmtpMailer(ctx, { id: 'relay-mail', verifyOnInit: true })
    ctx.configure()

    await expect(ctx.init()).rejects.toThrow(/^relay-mail: failed to verify the SMTP connection/)
  })

  test('a refused send surfaces through the host callers resolve, never swallowed', async () => {
    const ctx = context(unreachable)
    const transport = appendSmtpMailer(ctx)
    ctx.configure()
    await ctx.init()

    try {
      await expect(ctx.service<MailerService>(MAILER_SERVICE).send({ to: 'a@example.com', subject: 'x', text: 'y' }))
        .rejects.toThrow(`${SMTP_MAILER}: failed to send to a@example.com`)
    } finally {
      await transport.close()
    }
  })

  test('reads the settings at send time, so values resolved after registration are the ones used', async () => {
    const ctx = context()
    const transport = makeSmtpMailerTransport(ctx, { id: 'late' })
    ;(ctx.cfg as ServerConfig).smtp = unreachable

    await expect(transport.send({ to: 'a@example.com', subject: 'x' })).rejects.toThrow(/^late: failed to send/)
    await transport.close()
  })
})

describe('@owlmeans/mailer-smtp — the deprecated standalone service', () => {
  test('still registers under its alias and validates the relay while the context starts', async () => {
    const ctx = context()
    const service = makeSmtpMailerService(MAILER_SERVICE)
    ctx.registerService(service)
    ctx.configure()

    expect(service.alias).toBe(MAILER_SERVICE)
    await expect(ctx.init()).rejects.toThrow(`${MAILER_SERVICE}: cfg.smtp.host is not configured`)
  })

  test('prefixes a transport failure with its alias', async () => {
    const ctx = context(unreachable)
    const service = makeSmtpMailerService('legacy-mail')
    ctx.registerService(service)
    ctx.configure()
    await ctx.init()

    await expect(service.verify()).rejects.toThrow(/^legacy-mail: failed to verify/)
    await service.close()
  })
})
