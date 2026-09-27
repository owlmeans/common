import { describe, expect, test } from 'bun:test'
import { AuthenPayloadError, AuthroizationType } from '@owlmeans/auth'
import {
  BED255_NONCE_HEADER, BED255_SIG_TTL, BED255_TIME_HEADER, makeBasicEd25519Guard,
  makeResourceSignedRequestReplayStore
} from '@owlmeans/auth-common'
import type { SignedRequestReplayResource } from '@owlmeans/auth-common'
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
  guard: ReturnType<typeof makeBasicEd25519Guard>, req: AbstractRequest
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
