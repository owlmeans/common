import { afterAll, describe, expect, test } from 'bun:test'
import { randomNamespace } from '@owlmeans/test-integration'
import { MAILER_SERVICE } from '@owlmeans/mailer'
import type { MailerService } from '@owlmeans/mailer'
import { boot, gate, recipient } from './context.js'
import type { SmtpMailerTransport } from '@owlmeans/mailer-smtp'

/**
 * Live delivery against the configured relay (the shared platform relay in our deployments).
 *
 * These send real mail on every run — that is the point: the only thing that proves
 * the relay accepts our sender, credentials and TLS mode is the relay accepting it.
 */
describe('@owlmeans/mailer-smtp — live delivery', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'smtp gate closed', () => { })
    return
  }

  const opened: SmtpMailerTransport[] = []

  afterAll(async () => {
    while (opened.length > 0) {
      await opened.pop()?.close().catch(() => undefined)
    }
  })

  test('authenticates against the relay', async () => {
    const { mailer } = await boot()
    opened.push(mailer)

    expect(await mailer.verify()).toBe(true)
  })

  test('delivers a message through the host callers resolve', async () => {
    const { context, mailer } = await boot()
    opened.push(mailer)
    const stamp = randomNamespace('omt-smtp')

    await context.service<MailerService>(MAILER_SERVICE).send({
      to: recipient(),
      subject: `OwlMeans SMTP integration ${stamp}`,
      text: `Delivery check ${stamp}. Sent by @owlmeans/mailer-smtp.`,
      html: `<p>Delivery check <strong>${stamp}</strong>.</p>`,
      headers: { 'X-OwlMeans-Test': stamp },
    })
  })

  /**
   * Failure is provoked with an unreachable socket, never with a wrong password: repeated bad
   * logins trip the relay's brute-force protection and lock the shared credential for everyone.
   * Never authenticate incorrectly on purpose against a live relay.
   */
  test('reports a transport failure instead of swallowing it', async () => {
    const { mailer } = await boot({ host: '127.0.0.1', port: '1', secure: 'false', timeout: '1000' })
    opened.push(mailer)

    // The transport id prefixes the message so a failure in a server log names the transport.
    expect(mailer.verify()).rejects.toThrow(/smtp-mailer/)
  })
})
