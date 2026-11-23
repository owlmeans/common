import { describe, expect, test } from 'bun:test'
import { Readable } from 'node:stream'
import { AuthenPayloadError, AuthroizationType } from '@owlmeans/auth'
import {
  BED255_DELIVERY_TTL, BED255_NONCE_HEADER, BED255_SIG_TTL, BED255_TIME_HEADER, makeBasicEd25519Guard,
  makeMemorySignedRequestReplayStore, makeResourceSignedRequestReplayStore, signBasicEd25519Request
} from '@owlmeans/auth-common'
import type { BasicEd25519Guard, SignedRequestReplayResource, SignedRequestReplayStore } from '@owlmeans/auth-common'
import type { AbstractRequest, AbstractResponse, RequestDelivery } from '@owlmeans/entrypoint'
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

/**
 * A queue hands a job back after its worker died (a stall) or after a failed attempt (a retry). The
 * job is the SAME signed request: its nonce was claimed by the first attempt, and the broker's own
 * redelivery must not read as a replay — while the same nonce on another job, or over HTTP, still does.
 */
describe('@owlmeans/auth-common — a queued request\'s redelivery is not a replay', () => {
  const delivered = (req: AbstractRequest, delivery?: RequestDelivery): AbstractRequest =>
    ({ ...req, ...(delivery != null ? { delivery } : {}) })
  const claimIdOf = (credential: string, nonce: string) => `${credential.length}:${credential}${nonce}`

  test('the same job delivered again after a stall is admitted on the claim its first attempt took', async () => {
    const signed = await request(new Date().toISOString(), 'stalled-job')

    const first = await handle(signed.guard, delivered(signed.req, { id: 'agent-ops:story-develop-1', attempt: 1 }))
    const again = await handle(signed.guard, delivered(signed.req, { id: 'agent-ops:story-develop-1', attempt: 2 }))

    expect(first?.userId).toBe(signed.fixture.authRecord.id)
    expect(again?.userId).toBe(signed.fixture.authRecord.id)
  })

  test('the same nonce on ANOTHER job is a replay', async () => {
    const signed = await request(new Date().toISOString(), 'copied-to-another-job')
    await handle(signed.guard, delivered(signed.req, { id: 'agent-ops:job-a', attempt: 1 }))

    await expect(handle(signed.guard, delivered(signed.req, { id: 'agent-ops:job-b', attempt: 2 })))
      .rejects.toThrow(/nonce/)
    await expect(handle(signed.guard, delivered(signed.req, { id: 'agent-ops:job-b', attempt: 1 })))
      .rejects.toThrow(/nonce/)
  })

  test('the same nonce over HTTP — no delivery — is a replay, both after a job and before one', async () => {
    const queued = await request(new Date().toISOString(), 'job-then-http')
    await handle(queued.guard, delivered(queued.req, { id: 'agent-ops:job-a', attempt: 1 }))
    await expect(handle(queued.guard, queued.req)).rejects.toThrow(/nonce/)

    const http = await request(new Date().toISOString(), 'http-then-job')
    await handle(http.guard, http.req)
    await expect(handle(http.guard, delivered(http.req, { id: 'agent-ops:job-a', attempt: 2 })))
      .rejects.toThrow(/nonce/)
  })

  test('a first delivery never re-presents a claim — only a later attempt of the job does', async () => {
    const signed = await request(new Date().toISOString(), 'first-twice')
    await handle(signed.guard, delivered(signed.req, { id: 'agent-ops:job-a', attempt: 1 }))

    await expect(handle(signed.guard, delivered(signed.req, { id: 'agent-ops:job-a', attempt: 1 })))
      .rejects.toThrow(/nonce/)
  })

  test('past the signature window only the job\'s own redelivery stands, and only while its claim lives', async () => {
    const replay = makeMemorySignedRequestReplayStore()
    const signed = await request(new Date(Date.now() - 2 * BED255_SIG_TTL).toISOString(), 'redelivered-late')
    const guard = makeBasicEd25519Guard(TRUSTED_ALIAS, { replay })
    signed.fixture.ctx.registerService(guard)
    const claimId = claimIdOf(signed.fixture.authRecord.id, 'redelivered-late')

    // No claim yet: nothing proves the job was ever admitted inside the window.
    await expect(handle(guard, delivered(signed.req, { id: 'agent-ops:job-a', attempt: 2 }))).rejects.toThrow(/expired/)

    expect(await replay.claim(claimId, new Date(Date.now() + BED255_DELIVERY_TTL), 'agent-ops:job-a')).toBe(true)
    expect((await handle(guard, delivered(signed.req, { id: 'agent-ops:job-a', attempt: 2 })))?.userId)
      .toBe(signed.fixture.authRecord.id)
    await expect(handle(guard, delivered(signed.req, { id: 'agent-ops:job-b', attempt: 2 }))).rejects.toThrow(/expired/)
    await expect(handle(guard, delivered(signed.req, { id: 'agent-ops:job-a', attempt: 1 }))).rejects.toThrow(/expired/)
    await expect(handle(guard, signed.req)).rejects.toThrow(/expired/)
  })

  test('a queued claim is bound to its delivery and outlives the signature window; an HTTP claim does not', async () => {
    const claims: Array<{ expiresAt: Date, owner?: string }> = []
    const replay: SignedRequestReplayStore = {
      claim: async (_id, expiresAt, owner) => { claims.push({ expiresAt, ...(owner != null ? { owner } : {}) }); return true },
    }
    const queued = await request(new Date().toISOString(), 'bound-claim')
    const guard = makeBasicEd25519Guard(TRUSTED_ALIAS, { replay, deliveryTtl: 600_000 })
    queued.fixture.ctx.registerService(guard)
    const before = Date.now()

    await handle(guard, delivered(queued.req, { id: 'agent-ops:job-a', attempt: 1 }))
    await handle(guard, queued.req)

    expect(claims[0]?.owner).toBe('agent-ops:job-a')
    expect(claims[0]!.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 600_000)
    expect(claims[1]?.owner).toBeUndefined()
    expect(claims[1]!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + BED255_SIG_TTL)
  })

  test('a store without `holder` recognises no redelivery: the second presentation is a replay', async () => {
    const taken = new Set<string>()
    const replay: SignedRequestReplayStore = {
      claim: async id => { if (taken.has(id)) return false; taken.add(id); return true },
    }
    const signed = await request(new Date().toISOString(), 'no-holder')
    const guard = makeBasicEd25519Guard(TRUSTED_ALIAS, { replay })
    signed.fixture.ctx.registerService(guard)

    await handle(guard, delivered(signed.req, { id: 'agent-ops:job-a', attempt: 1 }))
    await expect(handle(guard, delivered(signed.req, { id: 'agent-ops:job-a', attempt: 2 }))).rejects.toThrow(/nonce/)
  })

  test('the resource adapter stores the owner on the claim and reads it back through `load`', async () => {
    const records = new Map<string, Record<string, unknown>>()
    const resource = {
      create: async (record: { id?: string }) => {
        if (records.has(record.id!)) throw new RecordExists(record.id!)
        records.set(record.id!, { ...record })
        return record
      },
      load: async (id: string) => records.get(id) ?? null,
    } as SignedRequestReplayResource
    const replay = makeResourceSignedRequestReplayStore(resource)
    const expiresAt = new Date(Date.now() + BED255_DELIVERY_TTL)

    expect(await replay.claim('owned', expiresAt, 'agent-ops:job-a')).toBe(true)
    expect(await replay.claim('anonymous', expiresAt)).toBe(true)
    expect(records.get('owned')).toEqual({ id: 'owned', owner: 'agent-ops:job-a' })
    expect(await replay.holder?.('owned')).toBe('agent-ops:job-a')
    expect(await replay.holder?.('anonymous')).toBeNull()
    expect(await replay.holder?.('missing')).toBeNull()
    expect(makeResourceSignedRequestReplayStore({ create: resource.create } as SignedRequestReplayResource).holder)
      .toBeUndefined()
  })
})

/**
 * A queued job can wait — behind a backlog, a busy lane, a deploy gap — before any worker picks it up.
 * Its signature is judged at its ENQUEUE (the broker's own timestamp, carried as `delivery.enqueuedAt`)
 * and the job stays deliverable for the queue's own window (`delivery.maxAge`); HTTP keeps 60 seconds.
 */
describe('@owlmeans/auth-common — a queued signature is judged at its enqueue, inside the queue\'s window', () => {
  const DAY = 86_400_000
  const queuedAt = (req: AbstractRequest, delivery: RequestDelivery): AbstractRequest => ({ ...req, delivery })

  test('a job picked up 10 minutes after it was enqueued is admitted', async () => {
    const enqueuedAt = Date.now() - 10 * 60_000
    const signed = await request(new Date(enqueuedAt - 5).toISOString(), 'waited-ten-minutes')

    const auth = await handle(signed.guard, queuedAt(signed.req, { id: 'agent-ops:job-a', attempt: 1, enqueuedAt, maxAge: DAY }))

    expect(auth?.userId).toBe(signed.fixture.authRecord.id)
  })

  test('a signature older than the window around its enqueue is refused, and so is a job past the queue\'s window', async () => {
    const enqueuedAt = Date.now() - 10 * 60_000
    const stale = await request(new Date(enqueuedAt - BED255_SIG_TTL - 1_000).toISOString(), 'signed-long-before-enqueue')
    const future = await request(new Date(enqueuedAt + BED255_SIG_TTL + 1_000).toISOString(), 'signed-long-after-enqueue')
    const tooOld = Date.now() - DAY - 60_000
    const late = await request(new Date(tooOld).toISOString(), 'past-the-queue-window')

    await expect(handle(stale.guard, queuedAt(stale.req, { id: 'agent-ops:job-a', attempt: 1, enqueuedAt, maxAge: DAY })))
      .rejects.toThrow(/expired/)
    await expect(handle(future.guard, queuedAt(future.req, { id: 'agent-ops:job-b', attempt: 1, enqueuedAt, maxAge: DAY })))
      .rejects.toThrow(/expired/)
    await expect(handle(late.guard, queuedAt(late.req, { id: 'agent-ops:job-c', attempt: 2, enqueuedAt: tooOld, maxAge: DAY })))
      .rejects.toThrow(/expired/)
  })

  test('without the queue\'s window — or its enqueue time — a queued signature is judged at arrival, as over HTTP', async () => {
    const enqueuedAt = Date.now() - 10 * 60_000
    const signed = await request(new Date(enqueuedAt).toISOString(), 'no-window')

    await expect(handle(signed.guard, queuedAt(signed.req, { id: 'agent-ops:job-a', attempt: 1, enqueuedAt })))
      .rejects.toThrow(/expired/)
    await expect(handle(signed.guard, queuedAt(signed.req, { id: 'agent-ops:job-a', attempt: 1, maxAge: DAY })))
      .rejects.toThrow(/expired/)
  })

  test('HTTP is unchanged: a request signed 10 minutes ago is expired, a fresh one admitted once', async () => {
    const old = await request(new Date(Date.now() - 10 * 60_000).toISOString(), 'http-old')
    const fresh = await request(new Date().toISOString(), 'http-fresh')

    await expect(handle(old.guard, old.req)).rejects.toThrow(/expired/)
    expect((await handle(fresh.guard, fresh.req))?.userId).toBe(fresh.fixture.authRecord.id)
    await expect(handle(fresh.guard, fresh.req)).rejects.toThrow(/nonce/)
  })

  test('the claim outlives every moment a copy could still be admitted: a copy on another job is a replay', async () => {
    const claims: Array<{ expiresAt: Date, owner?: string }> = []
    const memory = makeMemorySignedRequestReplayStore()
    const replay: SignedRequestReplayStore = {
      claim: async (id, expiresAt, owner) => {
        claims.push({ expiresAt, ...(owner != null ? { owner } : {}) })
        return await memory.claim(id, expiresAt, owner)
      },
      holder: memory.holder,
    }
    const enqueuedAt = Date.now() - 10 * 60_000
    const signedAt = enqueuedAt - 5
    const signed = await request(new Date(signedAt).toISOString(), 'copied-after-a-wait')
    const guard = makeBasicEd25519Guard(TRUSTED_ALIAS, { replay })
    signed.fixture.ctx.registerService(guard)

    await handle(guard, queuedAt(signed.req, { id: 'agent-ops:job-a', attempt: 1, enqueuedAt, maxAge: DAY }))
    // The broker's own redelivery of the same job, later still: the same enqueue, the same claim.
    expect((await handle(guard, queuedAt(signed.req, { id: 'agent-ops:job-a', attempt: 2, enqueuedAt, maxAge: DAY })))?.userId)
      .toBe(signed.fixture.authRecord.id)
    await expect(handle(guard, queuedAt(signed.req, { id: 'agent-ops:job-b', attempt: 1, enqueuedAt, maxAge: DAY })))
      .rejects.toThrow(/nonce/)

    expect(claims[0]?.owner).toBe('agent-ops:job-a')
    expect(claims[0]!.expiresAt.getTime()).toBeGreaterThanOrEqual(signedAt + BED255_SIG_TTL + DAY)
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

  test('raw bytes sign as `{}`: accepted where a streamed route\'s server sees no body', async () => {
    const fixture = makeTrustFixture({ withSecret: true, name: 'auth-common-tests' })
    const guard = makeBasicEd25519Guard(TRUSTED_ALIAS)
    fixture.ctx.registerService(guard)
    const bodies: unknown[] = [
      Readable.from([Buffer.from('streamed bytes')]), new Uint8Array([1, 2, 3]), new Blob(['blob']), new ArrayBuffer(4),
    ]

    for (const body of bodies) {
      const outgoing: Partial<AbstractRequest> = { body }
      const authorization = await guard.authenticated(outgoing)
      // The server half of a streamed-body route: the parser leaves the body unread.
      const req = {
        alias: 'streamed', body: undefined, params: {}, query: {}, path: '/streamed',
        headers: { ...outgoing.headers, authorization: authorization ?? '' },
      } satisfies AbstractRequest

      expect((await handle(guard, req))?.userId).toBe(fixture.authRecord.id)
    }
  })
})
