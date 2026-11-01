import { describe, expect, test } from 'bun:test'
import { DEFAULT_ALIAS as AUTH_SERVICE } from '@owlmeans/client-auth'
import type { LoginContext } from '@owlmeans/client-auth/login'
import type { EmailPasswordStatusView } from '@owlmeans/auth-email'
import { EMAIL_OFFER_LOGIN_STEP, EMAIL_OFFER_STEP_PRIORITY } from '../src/consts.js'
import { emailOfferStep } from '../src/step.js'
import { createEmailStorageHelper } from '../src/storage.js'
import { memoryArea } from './helpers.js'

const context = (userId: string | null): LoginContext => ({
  service: (alias: string) => {
    if (alias !== AUTH_SERVICE) {
      throw new Error(`unexpected service ${alias}`)
    }
    return { user: () => { if (userId == null) throw new Error('signed out'); return { userId } } } as never
  },
}) as unknown as LoginContext

const client = (status: EmailPasswordStatusView | Error) => {
  let calls = 0
  return {
    calls: () => calls,
    passwordStatus: async () => { calls++; if (status instanceof Error) throw status; return status },
  }
}

const OPEN: EmailPasswordStatusView = { enabled: true, set: false, declined: false }

describe('emailOfferStep — pending', () => {
  test('sits below marketing consent and names the offer screen', () => {
    const step = emailOfferStep(client(OPEN), 'auth-email:offer', createEmailStorageHelper({ session: () => memoryArea() }))

    expect(step.alias).toBe(EMAIL_OFFER_LOGIN_STEP)
    expect(step.entrypoint).toBe('auth-email:offer')
    expect(step.priority).toBe(EMAIL_OFFER_STEP_PRIORITY)
    expect(EMAIL_OFFER_STEP_PRIORITY).toBeLessThan(0)
    expect(step.required).toBeUndefined()
  })

  test('no ticket: not pending, and the status is never read', async () => {
    const reader = client(OPEN)
    const step = emailOfferStep(reader, 'offer', createEmailStorageHelper({ session: () => memoryArea() }))

    expect(await step.pending(context('account-1'))).toBe(false)
    expect(reader.calls()).toBe(0)
  })

  test('a ticket and an enabled, unset, undeclined password: pending', async () => {
    const session = memoryArea()
    const storage = createEmailStorageHelper({ session: () => session })
    storage.keepOffer('ticket', 'account-1')

    expect(await emailOfferStep(client(OPEN), 'offer', storage).pending(context('account-1'))).toBe(true)
    expect(storage.offer('account-1')).toBe('ticket')
  })

  test('a status that no longer allows the offer: not pending, and the ticket is forgotten', async () => {
    for (const status of [
      { ...OPEN, enabled: false }, { ...OPEN, set: true }, { ...OPEN, declined: true },
    ]) {
      const session = memoryArea()
      const storage = createEmailStorageHelper({ session: () => session })
      storage.keepOffer('ticket', 'account-1')
      expect(storage.offer('account-1')).toBe('ticket')

      expect(await emailOfferStep(client(status), 'offer', storage).pending(context('account-1'))).toBe(false)
      expect(storage.offer()).toBeNull()
    }
  })

  test('another account\'s ticket is not this sign-in\'s offer; a failing read throws for the host to fail open', async () => {
    const session = memoryArea()
    const storage = createEmailStorageHelper({ session: () => session })
    storage.keepOffer('ticket', 'account-1')

    expect(await emailOfferStep(client(OPEN), 'offer', storage).pending(context('account-2'))).toBe(false)
    await expect(emailOfferStep(client(new Error('down')), 'offer', storage).pending(context('account-1')))
      .rejects.toThrow('down')
    // The ticket survives a broken read — it may still be used once the status answers.
    expect(storage.offer('account-1')).toBe('ticket')
  })
})
