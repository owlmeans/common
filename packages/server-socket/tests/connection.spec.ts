import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { AuthorizationError } from '@owlmeans/auth'
import type { AbstractResponse } from '@owlmeans/entrypoint'
import { bind } from '@owlmeans/server-entrypoint'
import type { BoundEntrypointHandler, RefedEntrypointHandler } from '@owlmeans/server-entrypoint'
import { SocketInitializationError } from '@owlmeans/socket'
import type { Connection } from '@owlmeans/socket'
import { connection } from '../src/helper.js'
import { connectClient, protocols, roundTrip, startSocketServer, until } from './context.js'
import type { SocketServer } from './context.js'

type Call = ['resolve', unknown, unknown] | ['reject', Error]

/**
 * Runs a `connection()` binding with the transport's own response and records what the binding
 * told it — the response is the real one, so the socket behaves exactly as it does in production.
 */
const recorded = (binding: BoundEntrypointHandler<any>, calls: Call[]): RefedEntrypointHandler => ref => {
  const handle = binding.bind(ref)

  return async (request, response) => await handle(request, {
    resolve: (value: unknown, outcome?: unknown) => {
      calls.push(['resolve', value, outcome])
      response.resolve(value, outcome as any)
    },
    reject: (error: Error) => {
      calls.push(['reject', error])
      response.reject(error)
    },
  } as AbstractResponse<any>)
}

const watchCalls: Call[] = []
const failingCalls: Call[] = []
const wired: Connection[] = []
const refusal = new AuthorizationError('slot')

const files = connection(protocols.files, async conn => {
  conn.listen(async () => undefined)
  wired.push(conn)
})
const failing = connection(protocols.failing, async () => { throw refusal })

describe('@owlmeans/server-socket — connection()', () => {
  let server: SocketServer

  beforeAll(async () => {
    server = await startSocketServer([
      bind(protocols.files, recorded(files, watchCalls)),
      bind(protocols.failing, recorded(failing, failingCalls)),
    ])
  })
  afterAll(async () => { await server?.close() })

  test('publisher file watch: the handler only wires listeners, and is resolved with undefined once it returns', async () => {
    const client = connectClient(server.url('/update/files'))

    expect(await client.opened).toBe(true)
    expect(await roundTrip(client)).toBe(true)
    expect(wired).toHaveLength(1)
    expect(watchCalls).toEqual([['resolve', undefined, undefined]])
    client.socket.close()
    await client.closed
  })

  test('a handler that throws is answered through reject with its own error, never resolve', async () => {
    const client = connectClient(server.url('/failing'))

    await client.closed
    await until(() => failingCalls.length > 0)
    expect(failingCalls).toEqual([['reject', refusal]])
  })

  test('a request that carries no socket is rejected with SocketInitializationError before the handler', async () => {
    let reached = false
    const calls: Call[] = []
    const binding = connection(protocols.idle, async () => { reached = true })

    await recorded(binding, calls)({ ref: { ctx: server.context } } as any)(
      { alias: protocols.idle.alias, params: {}, query: {}, headers: {} } as any,
      { resolve: () => undefined, reject: () => undefined } as any,
    )

    expect(reached).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]).toBe('reject')
    expect(calls[0]?.[1]).toBeInstanceOf(SocketInitializationError)
  })

  test('a binding reached without a context throws, naming the protocol, and never runs the handler', async () => {
    let reached = false
    const binding = connection(protocols.idle, async () => { reached = true })

    expect(binding.protocol).toBe(protocols.idle)
    await expect(binding.bind({ ref: {} } as any)({ alias: protocols.idle.alias } as any, {} as any))
      .rejects.toThrow(protocols.idle.alias)
    expect(reached).toBe(false)
  })
})
