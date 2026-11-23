import { afterAll, describe, expect, test } from 'bun:test'
import { contract, provideResponse, protocol, transportAlias, typed } from '@owlmeans/entrypoint'
import type {
  AbstractRequest, AbstractResponse, EntrypointHandler, EntrypointTransport
} from '@owlmeans/entrypoint'
import { route } from '@owlmeans/route'
import { bind } from '@owlmeans/server-entrypoint'
import type { RefedEntrypointHandler } from '@owlmeans/server-entrypoint'
import { job, JobState, QUEUE_PROTOCOL, queueProtocolOf, UnknownJob } from '@owlmeans/queue'
import type { JobContext, JobRecord, QueueContext } from '@owlmeans/queue'
import { gate, makeSuite } from './context.js'

/**
 * The bridge: a backend entrypoint whose route says QUEUE is called exactly like any other, and
 * the job carries the call there and the answer back.
 *
 * `EntrypointHandler` is generic in what it resolves, so a concrete handler cannot satisfy it
 * structurally — the framework's own transports assert the same way.
 */
const handler = (
  handle: (req: AbstractRequest, res: AbstractResponse<unknown>) => Promise<void>
): RefedEntrypointHandler => () => handle as EntrypointHandler

describe('@owlmeans/redis-queue — queued entrypoints', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'redis gate closed', () => { })
    return
  }

  const suite = makeSuite('entrypoint')

  const echoProtocol = protocol(
    route('echo-job', 'echo', job({ queue: 'bridge' })),
    contract.request({ body: typed<{ value: string }>() }, typed<{ echoed: string }>()),
  )
  const echo = bind(echoProtocol, handler(async (req, res) => {
      res.resolve({ echoed: (req.body as { value: string }).value })
  }))

  const refusingProtocol = protocol(
    route('fail-job', 'fail', job({ queue: 'bridge' })),
    contract(typed<void>()),
  )
  const refusing = bind(refusingProtocol, handler(async () => {
      throw new UnknownJob('deliberate-refusal')
  }))

  const dead: Array<{ job: JobRecord, reason: string }> = []
  const wrapped: JobContext[] = []
  const boot = async () => await suite.boot({
    queues: [{ name: 'bridge', jobs: ['echo-job', 'fail-job'] }],
    listen: ['bridge'],
    entrypoints: [echo, refusing],
    hooks: {
      onJobDead: async (job, reason) => { dead.push({ job, reason }) },
      wrapHandler: async (job, next) => { wrapped.push(job); return await next() },
    },
  })

  const request = (alias: string, body: unknown): AbstractRequest =>
    ({ alias, params: {}, headers: {}, query: {}, path: '', body: body as AbstractRequest['body'] })

  afterAll(async () => {
    await suite.teardown()
  })

  test('a queued call round-trips its value', async () => {
    const { context } = await boot()
    const transport = context.service<EntrypointTransport>(
      transportAlias(QUEUE_PROTOCOL)
    )

    const response = provideResponse<{ echoed: string }>()
    await transport.handle(request('echo-job', { value: 'over-the-queue' }), response)

    expect(response.error).toBeUndefined()
    expect(response.value).toEqual({ echoed: 'over-the-queue' })
  })

  test('a refusal arrives as its own class, not as a string', async () => {
    const { context } = await boot()
    const transport = context.service<EntrypointTransport>(
      transportAlias(QUEUE_PROTOCOL)
    )

    const response = provideResponse<unknown>()
    const call = transport.handle(request('fail-job', {}), response)

    await expect(call).rejects.toBeInstanceOf(UnknownJob)
    await expect(call).rejects.toThrow(/deliberate-refusal/)
  })

  /**
   * A refusal travels in the reply, and bullmq used to record such a job as COMPLETED with the error
   * inside its return value — no failure anywhere a person or a hook looks. It is a failed job now:
   * not retried whatever its attempts, reported dead, and rebuilt as its own class for the caller.
   */
  test('a refused job is recorded as failed, not completed, and is never retried', async () => {
    const { context, jobs } = await boot()
    const protocols = queueProtocolOf(context as unknown as QueueContext)

    const record = await protocols.enqueue(refusingProtocol, {} as never, { attempts: 3 })
    await expect(protocols.waitFor(refusingProtocol, record)).rejects.toBeInstanceOf(UnknownJob)

    const stored = await jobs('bridge').load(record.id!)
    expect(stored?.state).toBe(JobState.Failed)
    expect(stored?.attempts).toBe(1)
    expect(stored?.error).toMatch(/deliberate-refusal/)
    expect(stored?.result).toBeUndefined()
    const reported = dead.find(entry => entry.job.id === record.id)
    expect(reported?.reason).toMatch(/deliberate-refusal/)
  })

  test('a processor is told how many times the broker took its job back — none on a first delivery', async () => {
    const { context } = await boot()
    const protocols = queueProtocolOf(context as unknown as QueueContext)

    const record = await protocols.enqueue(echoProtocol, { body: { value: 'once' } } as never)
    expect(await protocols.waitFor(echoProtocol, record)).toEqual({ echoed: 'once' })

    const seen = wrapped.find(job => job.id === record.id)
    expect(seen?.attempt).toBe(1)
    expect(seen?.stalls).toBe(0)
    // The broker's own stamp of the enqueue — what a signed job's freshness is judged at.
    expect(seen?.enqueuedAt).toBe(new Date(record.createdAt!).getTime())
  })
})
