import { describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import { makeBasicEd25519Guard } from '@owlmeans/auth-common'
import type { TrustedRecord } from '@owlmeans/auth-common'
import type { Auth } from '@owlmeans/auth'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/entrypoint'
import { makeFixtureKeyPair, makeMemoryTrustedResource } from '@owlmeans/test-auth'
import { makeEmailTechClient } from '../src/email.js'

const TRUSTED = 'trusted'

/** A guard over one trusted record, the way a deployment knows its signers. */
const fixture = () => {
  const key = makeFixtureKeyPair('test-ui-email-tech')
  const record: TrustedRecord = {
    id: key.exportAddress(), name: 'shared-key', credential: key.exportPublic(), scopes: ['*'],
  }
  const ctx = makeBasicContext<BasicConfig>({ ready: false, service: 'test-ui-tests', type: AppType.Backend })
  ctx.registerResource(makeMemoryTrustedResource([record], TRUSTED))
  const guard = makeBasicEd25519Guard(TRUSTED)
  ctx.registerService(guard)

  return { key, record, guard }
}

interface Sent { url: string, headers: Record<string, string>, body: unknown }

/** A `fetch` that records what was sent and answers `answer`. */
const recorder = (answer: unknown, status = 200) => {
  const sent: Sent[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) })
    return new Response(JSON.stringify(answer), { status, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch

  return { sent, fetchImpl }
}

/** Run the guard over a recorded request, as the server would; resolves the caller it saw. */
const verify = async (guard: ReturnType<typeof makeBasicEd25519Guard>, sent: Sent): Promise<Auth | undefined> => {
  let auth: Auth | undefined
  const request = {
    alias: 'tech', body: sent.body, headers: sent.headers, params: {}, query: {}, path: new URL(sent.url).pathname,
  } satisfies AbstractRequest
  const response: AbstractResponse<Auth> = { resolve: value => { auth = value }, reject: error => { throw error } }
  expect(await guard.match(request)).toBe(true)
  await guard.handle(request, response)

  return auth
}

describe('makeEmailTechClient', () => {
  test('signs the waiver request the way GUARD_ED25519 verifies it, as the key\'s own record', async () => {
    const { key, record, guard } = fixture()
    const { sent, fetchImpl } = recorder({ waiver: 'signed-waiver', expiresAt: new Date().toISOString() })
    const client = makeEmailTechClient({ apiUrl: 'https://app.test/api/', privateKey: key.export(), fetchImpl })

    expect(await client.waiver()).toBe('signed-waiver')
    expect(sent[0].url).toBe('https://app.test/api/auth/email/tech/waiver')
    expect(sent[0].body).toEqual({})
    const auth = await verify(guard, sent[0])
    // No credentialId given: the record is found by the key's address, the id OwlMeans deployments use.
    expect(auth?.userId).toBe(record.id)
    expect(auth?.scopes).toEqual(['shared-key'])
  })

  test('rewrites a challenge\'s PIN — the given one, or six random digits — on its own path', async () => {
    const { key, guard } = fixture()
    const { sent, fetchImpl } = recorder({ ok: true })
    const client = makeEmailTechClient({
      apiUrl: 'https://app.test', privateKey: key.export(), path: 'login/email/', fetchImpl,
    })

    expect(await client.rewritePin('challenge-1', '012345')).toBe('012345')
    const random = await client.rewritePin('challenge-2')
    expect(random).toMatch(/^[0-9]{6}$/)

    expect(sent[0].url).toBe('https://app.test/login/email/tech/pin')
    expect(sent[0].body).toEqual({ challenge: 'challenge-1', pin: '012345' })
    expect(sent[1].body).toEqual({ challenge: 'challenge-2', pin: random })
    expect((await verify(guard, sent[1]))?.userId).toBe(key.exportAddress())
  })

  test('refuses a malformed PIN before sending, and reports a refusal or a PIN nothing was rewritten for', async () => {
    const { key } = fixture()
    const refused = recorder({}, 404)
    await expect(makeEmailTechClient({ apiUrl: 'https://a.test', privateKey: key.export(), fetchImpl: refused.fetchImpl })
      .waiver()).rejects.toThrow('-> 404')

    const noop = recorder({ ok: false })
    const client = makeEmailTechClient({ apiUrl: 'https://a.test', privateKey: key.export(), fetchImpl: noop.fetchImpl })
    await expect(client.rewritePin('challenge', '12ab56')).rejects.toBeInstanceOf(SyntaxError)
    expect(noop.sent).toHaveLength(0)
    await expect(client.rewritePin('challenge')).rejects.toThrow('not rewritten')
  })

  test('an explicit credentialId names the record instead of the key\'s address', async () => {
    const { key } = fixture()
    const { sent, fetchImpl } = recorder({ waiver: 'w', expiresAt: '' })
    await makeEmailTechClient({ apiUrl: 'https://a.test', privateKey: key.export(), credentialId: 'did:custom', fetchImpl }).waiver()

    expect(sent[0].headers.authorization).toContain('Credential=did:custom ')
  })
})
