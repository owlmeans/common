import { describe, expect, test } from 'bun:test'
import { AuthenPayloadError, AuthroizationType } from '@owlmeans/auth'
import {
  BED255_NONCE_HEADER, BED255_SIG_TTL, BED255_TIME_HEADER, makeBasicEd25519Guard,
  makeResourceSignedRequestReplayStore, signBasicEd25519Request
} from '@owlmeans/auth-common'
import type { BasicEd25519Guard, SignedRequestReplayResource } from '@owlmeans/auth-common'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/entrypoint'
import type { Auth } from '@owlmeans/auth'
import { RecordExists } from '@owlmeans/resource'
import { makeTrustFixture, TRUSTED_ALIAS } from './context.js'

const timeKey = BED255_TIME_HEADER.toLowerCase()
const nonceKey = BED255_NONCE_HEADER.toLowerCase()

const request = async (timestamp: string, nonce: string) => {
  const fixture = makeTrustFixture({ withSecret: true, name: 'auth-common-tests' })
  const body = { action: 'publish' }
  const signature = await fixture.authKey.sign({
    body,
    headers: { [timeKey]: timestamp, [nonceKey]: nonce }
  })
  const req = {
    alias: 'signed', body, headers: {
      [timeKey]: timestamp,
      [nonceKey]: nonce,
      authorization: `${AuthroizationType.Ed25519BasicSignature.toUpperCase()} `
        + `Credential=${fixture.authRecord.id} Signature=${signature}`,
    }, params: {}, query: {}, path: '/signed'
  } satisfies AbstractRequest
  const guard = makeBasicEd25519Guard(TRUSTED_ALIAS)
  fixture.ctx.registerService(guard)

  return { fixture, guard, req }
}

const handle = async (
  guard: BasicEd25519Guard, req: AbstractRequest
): Promise<Auth | undefined> => {
  let value: Auth | undefined
  const response: AbstractResponse<Auth> = {
    resolve: resolved => { value = resolved },
    reject: error => { throw error }
  }
  await guard.handle(req, response)
  return value
}

describe('@owlmeans/auth-common — signed request freshness and replay protection', () => {
  test('accepts a canonical current timestamp once and rejects the replay by default', async () => {
    const signed = await request(new Date().toISOString(), 'one-use-nonce')

    expect((await handle(signed.guard, signed.req))?.userId).toBe(signed.fixture.authRecord.id)
    await expect(handle(signed.guard, signed.req)).rejects.toBeInstanceOf(AuthenPayloadError)
  })

  test('rejects parseable but non-canonical timestamps', async () => {
    const signed = await request(new Date().toUTCString(), 'non-canonical')

    await expect(handle(signed.guard, signed.req)).rejects.toBeInstanceOf(AuthenPayloadError)
  })

  test('rejects timestamps outside the symmetric 60-second window', async () => {
    const past = await request(new Date(Date.now() - BED255_SIG_TTL - 1_000).toISOString(), 'past')
    const future = await request(new Date(Date.now() + BED255_SIG_TTL + 1_000).toISOString(), 'future')

    await expect(handle(past.guard, past.req)).rejects.toBeInstanceOf(AuthenPayloadError)
    await expect(handle(future.guard, future.req)).rejects.toBeInstanceOf(AuthenPayloadError)
  })

  test('rejects authentication when an injected replay store fails', async () => {
    const signed = await request(new Date().toISOString(), 'store-failure')
    const guard = makeBasicEd25519Guard(TRUSTED_ALIAS, {
      replay: { claim: async () => { throw new Error('store unavailable') } }
    })
    signed.fixture.ctx.registerService(guard)

    await expect(handle(guard, signed.req)).rejects.toBeInstanceOf(AuthenPayloadError)
  })

  test('adapts a create-once resource and forwards the absolute signed expiry', async () => {
    let claimed = false
    let observedExpiry: Date | undefined
    const resource = {
      create: async (record: { id?: string }, opts?: { ttl?: number | Date }) => {
        if (claimed) throw new RecordExists(record.id ?? '')
        claimed = true
        observedExpiry = opts?.ttl as Date
        return record
      }
    } as SignedRequestReplayResource
    const replay = makeResourceSignedRequestReplayStore(resource)
    const expiresAt = new Date(Date.now() + BED255_SIG_TTL)

    expect(await replay.claim('service:nonce', expiresAt)).toBe(true)
    expect(observedExpiry).toBe(expiresAt)
    expect(await replay.claim('service:nonce', expiresAt)).toBe(false)
  })
})

describe('@owlmeans/auth-common — signBasicEd25519Request', () => {
  const signedRequest = async (signedBody: object, sentBody: object = signedBody) => {
    const fixture = makeTrustFixture({ withSecret: true, name: 'auth-common-tests' })
    const guard = makeBasicEd25519Guard(TRUSTED_ALIAS)
    fixture.ctx.registerService(guard)
    const signed = await signBasicEd25519Request({
      body: signedBody, credential: fixture.authRecord.id, key: fixture.authKey,
    })
    const req = {
      alias: 'signed', body: sentBody, headers: { ...signed.headers, authorization: signed.authorization },
      params: {}, query: {}, path: '/signed'
    } satisfies AbstractRequest

    return { fixture, guard, req, signed }
  }

  test('a request it signs is accepted by the guard', async () => {
    const { fixture, guard, req, signed } = await signedRequest({ challenge: 'c', pin: '123456' })

    expect(signed.authorization).toStartWith(`${AuthroizationType.Ed25519BasicSignature.toUpperCase()} Credential=${fixture.authRecord.id} Signature=`)
    expect(Object.keys(signed.headers)).toEqual([timeKey, nonceKey])
    expect((await handle(guard, req))?.userId).toBe(fixture.authRecord.id)
  })

  test('a tampered body is refused', async () => {
    const { guard, req } = await signedRequest({ challenge: 'c', pin: '123456' }, { challenge: 'c', pin: '654321' })
    const response: AbstractResponse<Auth> = { resolve: () => { throw new Error('resolved') }, reject: error => { throw error } }

    expect(await guard.handle<boolean>(req, response)).toBe(false)
  })

  test('the guard signs its own outgoing requests through it', async () => {
    const fixture = makeTrustFixture({ withSecret: true, name: 'auth-common-tests' })
    const guard = makeBasicEd25519Guard(TRUSTED_ALIAS)
    fixture.ctx.registerService(guard)
    const outgoing: Partial<AbstractRequest> = { body: { action: 'publish' } }

    const authorization = await guard.authenticated(outgoing)
    const req = {
      alias: 'signed', body: outgoing.body, params: {}, query: {}, path: '/signed',
      headers: { ...outgoing.headers, authorization: authorization ?? '' },
    } satisfies AbstractRequest

    expect(typeof outgoing.headers?.[timeKey]).toBe('string')
    expect(typeof outgoing.headers?.[nonceKey]).toBe('string')
    expect((await handle(guard, req))?.userId).toBe(fixture.authRecord.id)
  })
})
