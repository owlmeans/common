import { describe, expect, test } from 'bun:test'
import { AuthForbidden } from '@owlmeans/auth'
import { EMAIL_AUTH_TECH_GATE, EMAIL_PIN_AUTH_TYPE, EmailPasswordPurpose, EmailTechDisabled } from '@owlmeans/auth-email'
import type { GateService } from '@owlmeans/entrypoint'
import { DEVICE_A, OTHER_SIGNER, TECH_SIGNER, failure, makeEmailAuthFixture, otherCode, statusOf, tokenOf } from './context.js'

describe('@owlmeans/server-auth-email — developer routes', () => {
  test('the gate admits an allow-listed GUARD_ED25519 signer only, and answers 404 while the routes are off', async () => {
    let on = true
    const env = await makeEmailAuthFixture({ tech: () => on })
    const gate = env.context.service<GateService>(EMAIL_AUTH_TECH_GATE)
    const allowed = await env.signed(TECH_SIGNER)
    const other = await env.signed(OTHER_SIGNER)

    await gate.assert(allowed, {} as never, [])
    expect(await failure(gate.assert(other, {} as never, []))).toBeInstanceOf(AuthForbidden)
    // A user session is no signer, whatever its scopes.
    expect(await failure(gate.assert(env.session('someone'), {} as never, []))).toBeInstanceOf(AuthForbidden)
    // The service checks again, behind whatever gate a host configured.
    expect(await failure(env.service.techWaiver(other))).toBeInstanceOf(AuthForbidden)

    on = false
    for (const refused of [gate.assert(allowed, {} as never, []), env.service.techWaiver(allowed), env.service.techPin({ challenge: 'x', pin: '123456' }, allowed)]) {
      const error = await failure(refused)
      expect(error).toBeInstanceOf(EmailTechDisabled)
      expect(statusOf(error)).toBe(404)
    }
  })

  test('tech/pin rewrites the PIN of a pending sign-in challenge, which then signs in', async () => {
    const env = await makeEmailAuthFixture()
    const { challenge } = await env.service.sendPin({ email: 'dev@example.org' }, env.guest())
    const pin = otherCode(env.codeOf())

    expect(await env.service.techPin({ challenge, pin }, await env.signed(TECH_SIGNER, { challenge, pin }))).toEqual({ ok: true })

    const answer = await env.service.signIn({ email: 'dev@example.org', device: DEVICE_A, challenge, pin }, env.guest())
    expect(tokenOf(answer.token!).type).toBe(EMAIL_PIN_AUTH_TYPE)
  })

  test('tech/pin rewrites a confirmation PIN too, and answers ok: false for anything else', async () => {
    const env = await makeEmailAuthFixture()
    const { accountId } = await env.pinSignIn('dev@example.org')
    const { challenge } = await env.service.confirmPin({ purpose: EmailPasswordPurpose.Set }, env.session(accountId))
    const signer = await env.signed(TECH_SIGNER)

    expect(await env.service.techPin({ challenge, pin: '424242' }, signer)).toEqual({ ok: true })
    expect((await env.service.setPassword({ password: 'correct horse battery', challenge, pin: '424242' }, env.session(accountId))).set)
      .toBe(true)

    expect(await env.service.techPin({ challenge, pin: '424243' }, signer)).toEqual({ ok: false })
    expect(await env.service.techPin({ challenge: 'not an envelope', pin: '424242' }, signer)).toEqual({ ok: false })
    expect(await env.service.techPin({ challenge: await env.challengeOf('email-otp', 'dev@example.org::id'), pin: '424242' }, signer))
      .toEqual({ ok: false })
  })

  test('tech/waiver signs a waiver for two hours', async () => {
    const env = await makeEmailAuthFixture()
    const before = Date.now()

    const { waiver, expiresAt } = await env.service.techWaiver(await env.signed(TECH_SIGNER))

    expect(waiver).toMatch(/^[A-Za-z0-9_-]+$/)
    const lifetime = new Date(expiresAt).getTime() - before
    expect(lifetime).toBeGreaterThan(7_190_000)
    expect(lifetime).toBeLessThanOrEqual(7_200_000 + 1_000)
  })
})
