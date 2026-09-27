import { describe, expect, test } from 'bun:test'
import { AuthroizationType } from '@owlmeans/auth'
import { makeMarketingConsentProtocols, MC_EMAIL } from '@owlmeans/marketing-consent'
import { marketingConsentStatus, recordTermsAcceptance, saveMarketingConsent } from '../src/handlers.js'
import { makeTestContext, session } from './context.js'

const protocols = makeMarketingConsentProtocols({ guards: 'guard:default' })
const statusHandler = marketingConsentStatus(protocols.status)
const saveHandler = saveMarketingConsent(protocols.save)
const termsHandler = recordTermsAcceptance(protocols.terms)

/**
 * A protocol-bound implementation is run with the smallest binding context the transport needs —
 * the same `invoke` helper `@owlmeans/server-auth-token`'s own handler tests use.
 */
const invoke = async (handler: any, context: any, req: any): Promise<any> => {
  const res: any = { resolve: (value: unknown) => { res.value = value }, reject: (e: Error) => { res.error = e } }
  await handler.bind({ ref: { ctx: context } })(req, res)
  if (res.error != null) throw res.error

  return res.value
}

describe('marketing-consent handlers — status', () => {
  test('works for an ordinary session', async () => {
    const context = makeTestContext()

    const view = await invoke(statusHandler, context, session())

    expect(view.items.length).toBeGreaterThan(0)
  })

  test('is never token-refused — an AuthToken-authenticated request still reads status', async () => {
    const context = makeTestContext()

    const view = await invoke(statusHandler, context, session({ type: AuthroizationType.AuthToken }))

    expect(view.items.length).toBeGreaterThan(0)
  })
})

describe('marketing-consent handlers — save', () => {
  test('saves decisions for an ordinary session', async () => {
    const context = makeTestContext()
    const req = { ...session(), body: { decisions: [{ key: MC_EMAIL, granted: true }], source: 'settings' } }

    const result = await invoke(saveHandler, context, req)

    expect(result.ok).toBe(true)
  })

  test('refuses an AuthToken-authenticated request', async () => {
    const context = makeTestContext()
    const req = {
      ...session({ type: AuthroizationType.AuthToken }),
      body: { decisions: [{ key: MC_EMAIL, granted: true }], source: 'settings' },
    }

    await expect(invoke(saveHandler, context, req)).rejects.toThrow()
  })
})

describe('marketing-consent handlers — terms', () => {
  test('records terms for an ordinary session', async () => {
    const context = makeTestContext()
    const req = {
      ...session(),
      body: { documents: [{ key: 'tos', href: 'https://example.com/tos' }], version: '1.0' },
    }

    const result = await invoke(termsHandler, context, req)

    expect(result.ok).toBe(true)
  })

  test('refuses an AuthToken-authenticated request', async () => {
    const context = makeTestContext()
    const req = {
      ...session({ type: AuthroizationType.AuthToken }),
      body: { documents: [{ key: 'tos', href: 'https://example.com/tos' }], version: '1.0' },
    }

    await expect(invoke(termsHandler, context, req)).rejects.toThrow()
  })
})
