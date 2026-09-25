import { afterEach, describe, expect, test } from 'bun:test'
import { DEFAULT_ALIAS as AUTH_SERVICE } from '@owlmeans/client-auth'
import type { LoginContext } from '@owlmeans/client-auth/login'
import type { LoginTermsConfig } from '@owlmeans/config'
import type { MarketingConsentStatusView } from '@owlmeans/marketing-consent'
import { MARKETING_CONSENT_SKIP_STORAGE } from '../src/consts.js'
import { isMarketingConsentSkipped, markMarketingConsentSkipped, marketingConsentStep } from '../src/step.js'
import type { MarketingConsentClientService } from '../src/service.js'

/** A hand-written `window.localStorage`, mirroring `@owlmeans/client-auth`'s own `land.spec.ts`
 * idiom — the skip marker is read/written through exactly the same two methods `land.ts` uses. */
const stubStorage = (): void => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, value) },
      removeItem: (key: string) => { store.delete(key) },
    },
  }
}

afterEach(() => { delete (globalThis as { window?: unknown }).window })

const TERMS: LoginTermsConfig = { required: true, version: 'v1', terms: 'https://a.test/terms' }

const fakeContext = (opts: { token: string | null, sessionId?: string, terms?: LoginTermsConfig | false }): LoginContext =>
  ({
    cfg: { security: { auth: { login: { terms: opts.terms } } } },
    service: (alias: string) => {
      if (alias === AUTH_SERVICE) {
        return {
          authenticated: async () => opts.token,
          user: () => ({ sessionId: opts.sessionId }),
        } as never
      }
      throw new Error(`unexpected service ${alias}`)
    },
  }) as unknown as LoginContext

const fakeClient = (status: MarketingConsentStatusView | null): MarketingConsentClientService =>
  ({ status: async () => status }) as unknown as MarketingConsentClientService

describe('marketingConsentStep — default mode (no confirmsTerms)', () => {
  test('a broken status read fails OPEN — not pending', async () => {
    const step = marketingConsentStep(fakeClient(null), 'screen')
    expect(await step.pending(fakeContext({ token: 'tok' }))).toBe(false)
  })

  test('pending items make the step pending', async () => {
    const step = marketingConsentStep(fakeClient({ pending: true, items: [] }), 'screen')
    expect(await step.pending(fakeContext({ token: 'tok' }))).toBe(true)
  })

  test('nothing pending makes the step not pending', async () => {
    const step = marketingConsentStep(fakeClient({ pending: false, items: [] }), 'screen')
    expect(await step.pending(fakeContext({ token: 'tok' }))).toBe(false)
  })

  test('pending items, but THIS sign-in already skipped — not pending', async () => {
    stubStorage()
    const ctx = fakeContext({ token: 'tok', sessionId: 'sess-1' })
    await markMarketingConsentSkipped(ctx)

    const step = marketingConsentStep(fakeClient({ pending: true, items: [] }), 'screen')
    expect(await step.pending(ctx)).toBe(false)
  })

  test('the skip marker is per session — a different sign-in is asked again', async () => {
    stubStorage()
    await markMarketingConsentSkipped(fakeContext({ token: 'tok', sessionId: 'sess-1' }))

    const step = marketingConsentStep(fakeClient({ pending: true, items: [] }), 'screen')
    expect(await step.pending(fakeContext({ token: 'tok-2', sessionId: 'sess-2' }))).toBe(true)
  })

  test('`required`/`confirmsTerms` are both false, and LoginStep declares neither', () => {
    const step = marketingConsentStep(fakeClient(null), 'screen')
    expect(step.required).toBe(false)
    expect(step.confirmsTerms).toBe(false)
  })
})

describe('marketingConsentStep — confirmsTerms (Terms mode)', () => {
  test('declares itself required, so a broken pending() read is read as PENDING by continueLogin', () => {
    const step = marketingConsentStep(fakeClient(null), 'screen', { confirmsTerms: true })
    expect(step.required).toBe(true)
    expect(step.confirmsTerms).toBe(true)
  })

  test('a broken status read is itself pending (fail CLOSED, unlike default mode)', async () => {
    const step = marketingConsentStep(fakeClient(null), 'screen', { confirmsTerms: true })
    expect(await step.pending(fakeContext({ token: 'tok', terms: TERMS }))).toBe(true)
  })

  test('no recorded terms version at all — pending, even with every item already current', async () => {
    const step = marketingConsentStep(
      fakeClient({ pending: false, items: [] }), 'screen', { confirmsTerms: true },
    )
    expect(await step.pending(fakeContext({ token: 'tok', terms: TERMS }))).toBe(true)
  })

  test('a STALE recorded version — pending, exactly like no version at all', async () => {
    const step = marketingConsentStep(
      fakeClient({ pending: false, items: [], terms: { version: 'v0', acceptedAt: '' } }),
      'screen', { confirmsTerms: true },
    )
    expect(await step.pending(fakeContext({ token: 'tok', terms: TERMS }))).toBe(true)
  })

  test('the CURRENT version recorded, nothing else pending — not pending', async () => {
    const step = marketingConsentStep(
      fakeClient({ pending: false, items: [], terms: { version: 'v1', acceptedAt: '' } }),
      'screen', { confirmsTerms: true },
    )
    expect(await step.pending(fakeContext({ token: 'tok', terms: TERMS }))).toBe(false)
  })

  test('terms current, but items are pending — pending, on the ITEMS half now', async () => {
    const step = marketingConsentStep(
      fakeClient({ pending: true, items: [], terms: { version: 'v1', acceptedAt: '' } }),
      'screen', { confirmsTerms: true },
    )
    expect(await step.pending(fakeContext({ token: 'tok', terms: TERMS }))).toBe(true)
  })

  test('terms current, items pending, but THIS sign-in already skipped — not pending', async () => {
    stubStorage()
    const ctx = fakeContext({ token: 'tok', sessionId: 'sess-1', terms: TERMS })
    await markMarketingConsentSkipped(ctx)

    const step = marketingConsentStep(
      fakeClient({ pending: true, items: [], terms: { version: 'v1', acceptedAt: '' } }),
      'screen', { confirmsTerms: true },
    )
    expect(await step.pending(ctx)).toBe(false)
  })

  test('terms disabled entirely (`false`) — falls through to the ordinary items check', async () => {
    const step = marketingConsentStep(
      fakeClient({ pending: false, items: [] }), 'screen', { confirmsTerms: true },
    )
    expect(await step.pending(fakeContext({ token: 'tok', terms: false }))).toBe(false)
  })
})

describe('skip marker helpers', () => {
  test('signed out: neither read nor write anything', async () => {
    stubStorage()
    const ctx = fakeContext({ token: null })

    await markMarketingConsentSkipped(ctx)
    expect(await isMarketingConsentSkipped(ctx)).toBe(false)
    expect(window.localStorage.getItem(MARKETING_CONSENT_SKIP_STORAGE)).toBeNull()
  })

  test('keyed by sessionId when the token carries one, else the raw token', async () => {
    stubStorage()
    await markMarketingConsentSkipped(fakeContext({ token: 'raw-token', sessionId: 'sess-9' }))

    expect(window.localStorage.getItem(MARKETING_CONSENT_SKIP_STORAGE)).toBe('sess-9')
    expect(await isMarketingConsentSkipped(fakeContext({ token: 'raw-token', sessionId: 'sess-9' }))).toBe(true)
    // A refreshed token, same session — still recognised as the same sign-in.
    expect(await isMarketingConsentSkipped(fakeContext({ token: 'refreshed-token', sessionId: 'sess-9' })))
      .toBe(true)

    await markMarketingConsentSkipped(fakeContext({ token: 'no-session-token' }))
    expect(window.localStorage.getItem(MARKETING_CONSENT_SKIP_STORAGE)).toBe('no-session-token')
  })
})
