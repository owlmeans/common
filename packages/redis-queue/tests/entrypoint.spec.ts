import { afterAll, describe, expect, test } from 'bun:test'
import { entrypoint, provideResponse, transportAlias } from '@owlmeans/entrypoint'
import type {
  AbstractRequest, AbstractResponse, EntrypointHandler, EntrypointTransport
} from '@owlmeans/entrypoint'
import { job, route, RouteProtocols } from '@owlmeans/route'
import { UnknownJob } from '@owlmeans/queue'
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
): EntrypointHandler => handle as EntrypointHandler

describe('@owlmeans/redis-queue — queued entrypoints', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'redis gate closed', () => { })
    return
  }

  const suite = makeSuite('entrypoint')

  const echo = entrypoint(route('echo-job', 'echo', job({ queue: 'bridge' })), {
    handle: handler(async (req, res) => {
      res.resolve({ echoed: (req.body as { value: string }).value })
    })
  })

  const refusing = entrypoint(route('fail-job', 'fail', job({ queue: 'bridge' })), {
    handle: handler(async () => {
      throw new UnknownJob('deliberate-refusal')
    })
  })

  const boot = async () => await suite.boot({
    queues: [{ name: 'bridge', jobs: ['echo-job', 'fail-job'] }],
    listen: ['bridge'],
    entrypoints: [echo, refusing]
  })

  const request = (alias: string, body: unknown): AbstractRequest =>
    ({ alias, params: {}, headers: {}, query: {}, path: '', body: body as AbstractRequest['body'] })

  afterAll(async () => {
    await suite.teardown()
  })

  test('a queued call round-trips its value', async () => {
    const { context } = await boot()
    const transport = context.service<EntrypointTransport>(
      transportAlias(RouteProtocols.QUEUE)
    )

    const response = provideResponse<{ echoed: string }>()
    await transport.handle(request('echo-job', { value: 'over-the-queue' }), response)

    expect(response.error).toBeUndefined()
    expect(response.value).toEqual({ echoed: 'over-the-queue' })
  })

  test('a refusal arrives as its own class, not as a string', async () => {
    const { context } = await boot()
    const transport = context.service<EntrypointTransport>(
      transportAlias(RouteProtocols.QUEUE)
    )

    const response = provideResponse<unknown>()
    const call = transport.handle(request('fail-job', {}), response)

    await expect(call).rejects.toBeInstanceOf(UnknownJob)
    await expect(call).rejects.toThrow(/deliberate-refusal/)
  })
})
