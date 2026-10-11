import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { AuthenticationStage, AuthorizationError } from '@owlmeans/auth'
import { EntrypointOutcome } from '@owlmeans/entrypoint'
import { ResilientError } from '@owlmeans/error'
import { bind } from '@owlmeans/server-entrypoint'
import { MessageType } from '@owlmeans/socket'
import type { EventMessage } from '@owlmeans/socket'
import { connection, handleConnection } from '../src/helper.js'
import {
  AGENT_TOKEN, GUARD_TOKEN, THINKING_EVENT, WATCH_EVENT, connectClient, makeAgentAuthentication, makeFeed,
  protocols, roundTrip, startSocketServer, until,
} from './context.js'
import type { SocketServer, WatchChange } from './context.js'

const isSystem = (raw: unknown, event: string): boolean => typeof raw === 'object' && raw != null
  && (raw as EventMessage<void>).type === MessageType.System && (raw as EventMessage<void>).event === event

/** The slot's change feed the publisher's file watch subscribes to once the agent authenticated. */
const slot = makeFeed()
/** The pub/sub topic the manager-api's thinking relay subscribes to. */
const topic = makeFeed()
/** Close codes the thinking relay's server-side close listener observed. */
const relayClosed: number[] = []
/** How many times each handler was reached. */
const reached: Record<string, number> = { guarded: 0, gated: 0 }
/** Frames the guarded handler observed. */
const guardedEvents: unknown[] = []

const refusal = new AuthorizationError('slot')
/** A refusal whose marshalled form outgrows a close frame's 123-byte reason. */
const longRefusal = new AuthorizationError(`slot:${'ü'.repeat(80)}`)
const bytes = (text: string): number => new TextEncoder().encode(text).length

const entrypoints = [
  // Every real Viable socket: a `connection()` handler that wires listeners and resolves nothing.
  bind(protocols.idle, connection(protocols.idle, async conn => {
    conn.listen(async () => undefined)
  })),

  // The publisher's file watch (viable `sources/publisher/src/app/update/files.ts`).
  bind(protocols.files, connection(protocols.files, async conn => {
    conn.listen(async raw => {
      if (!isSystem(raw, 'authenticated')) {
        return
      }
      const onChange = (change: WatchChange): void => { void conn.notify(WATCH_EVENT, change) }
      slot.on('change', onChange)
      conn.listen(async msg => {
        if (isSystem(msg, 'close')) {
          slot.off('change', onChange)
        }
      })
    })
    conn.authenticate = makeAgentAuthentication(conn)
  })),

  // The manager-api's thinking relay (viable `sources/manager-api/src/app/project/thinking.ts`).
  bind(protocols.thinking, handleConnection(async conn => {
    conn.authenticate = makeAgentAuthentication(conn)
    let unsubscribe: (() => void) | undefined
    conn.listen(async raw => {
      if (isSystem(raw, 'authenticated')) {
        const push = (entry: unknown): void => { void conn.notify(THINKING_EVENT, entry) }
        topic.on('thinking', push)
        unsubscribe = () => topic.off('thinking', push)
      } else if (isSystem(raw, 'close')) {
        relayClosed.push((raw as EventMessage<{ code: number }>).payload.code)
        unsubscribe?.()
        unsubscribe = undefined
      }
    })
  })),

  bind(protocols.failing, connection(protocols.failing, async (_conn, _ctx, request) => {
    throw (request.query as Record<string, string> | undefined)?.long != null ? longRefusal : refusal
  })),

  bind(protocols.once, handleConnection(async (_conn, _ctx, _req, res) => {
    res.resolve({ ready: true }, EntrypointOutcome.Ok)
  })),

  bind(protocols.guarded, connection(protocols.guarded, async conn => {
    reached.guarded++
    conn.observe(WATCH_EVENT, async msg => { guardedEvents.push(msg.payload) })
  })),

  bind(protocols.gated, connection(protocols.gated, async conn => {
    reached.gated++
    conn.listen(async () => undefined)
  })),
]

describe('@owlmeans/server-socket — a socket route served end to end', () => {
  let server: SocketServer
  const clients: WebSocket[] = []
  const open = (path: string, query?: Record<string, string>) => {
    const client = connectClient(server.url(path, query))
    clients.push(client.socket)
    return client
  }

  beforeAll(async () => { server = await startSocketServer(entrypoints) })
  afterAll(async () => {
    clients.forEach(socket => socket.close())
    await server?.close()
  })

  test('a connection handler that only wires listeners keeps the socket open and sends no frame', async () => {
    const client = open('/idle')

    expect(await client.opened).toBe(true)
    // The ping is answered only by a live server-side socket; a 1011 close would end the race first.
    expect(await roundTrip(client)).toBe(true)
    expect(client.socket.readyState).toBe(WebSocket.OPEN)
    expect(client.frames).toEqual([JSON.stringify({ type: 'pong' })])
  })

  test('publisher file watch: the agent authenticates, then observes { event, path } changes', async () => {
    const client = open('/update/files')
    const changes: WatchChange[] = []
    client.connection.observe<WatchChange>(WATCH_EVENT, async msg => { changes.push(msg.payload) })

    expect(await client.opened).toBe(true)
    expect(await client.connection.auth<{ token: string }, boolean>(AuthenticationStage.Authenticate, { token: AGENT_TOKEN }))
      .toBe(true)
    expect(client.connection.stage).toBe(AuthenticationStage.Authenticated)
    await until(() => slot.listenerCount('change') === 1)

    slot.emit('change', { event: 'change', path: 'src/index.ts' })
    await until(() => changes.length === 1)
    expect(changes).toEqual([{ event: 'change', path: 'src/index.ts' }])

    client.socket.close()
    await client.closed
    await until(() => slot.listenerCount('change') === 0)
  })

  test('publisher file watch: a refused authentication is closed by the server, nothing is watched', async () => {
    const client = open('/update/files')

    expect(await client.opened).toBe(true)
    void client.connection.auth(AuthenticationStage.Authenticate, { token: 'forged' }).catch(() => undefined)

    await client.closed
    expect(slot.listenerCount('change')).toBe(0)
  })

  test('publisher file watch: a frame other than authentication before it closes the socket with 1008', async () => {
    const client = open('/update/files')

    expect(await client.opened).toBe(true)
    client.socket.send(JSON.stringify({ type: MessageType.Event, event: WATCH_EVENT, payload: {} }))

    expect((await client.closed).code).toBe(1008)
    expect(slot.listenerCount('change')).toBe(0)
  })

  test('a handler that throws is rejected: closed with 1011 and the marshalled refusal as reason', async () => {
    const client = open('/failing')

    const closed = await client.closed
    expect(closed.code).toBe(1011)
    // Type and message only: a server stack never reaches the client.
    expect(closed.reason).toBe(ResilientError.ensure(refusal).marshal({ includeStack: false }).message)
    expect(ResilientError.ensure(new Error(closed.reason))).toBeInstanceOf(AuthorizationError)
    expect(client.frames).toEqual([])
  })

  test('a refusal longer than a close frame allows is clipped to 123 bytes on a character boundary', async () => {
    const client = open('/failing', { long: '1' })

    const closed = await client.closed
    const full = ResilientError.ensure(longRefusal).marshal({ includeStack: false }).message
    expect(closed.code).toBe(1011)
    expect(bytes(full)).toBeGreaterThan(123)
    expect(bytes(closed.reason)).toBeLessThanOrEqual(123)
    expect(full.startsWith(closed.reason)).toBe(true)
  })

  test('a handler resolving a value with the Ok outcome sends it once and closes', async () => {
    const client = open('/once')

    await client.closed
    expect(client.frames).toEqual([JSON.stringify({ ready: true })])
  })

  test('thinking relay: a client close runs the server-side close listener, which unsubscribes', async () => {
    const client = open('/update/thinking')
    const entries: unknown[] = []
    client.connection.observe(THINKING_EVENT, async msg => { entries.push(msg.payload) })

    expect(await client.opened).toBe(true)
    await client.connection.auth(AuthenticationStage.Authenticate, { token: AGENT_TOKEN })
    await until(() => topic.listenerCount('thinking') === 1)
    topic.emit('thinking', { step: 'plan' })
    await until(() => entries.length === 1)
    expect(entries).toEqual([{ step: 'plan' }])

    await client.connection.close()
    await until(() => topic.listenerCount('thinking') === 0)
    expect(relayClosed).toHaveLength(1)
  })

  test('a guard refusing the upgrade never reaches the handler', async () => {
    const client = open('/guarded')

    expect(await client.opened).toBe(false)
    const forged = open('/guarded', { token: 'forged' })
    expect(await forged.opened).toBe(false)
    expect(reached.guarded).toBe(0)
  })

  test('a guard admitting the upgrade authenticates the connection: frames flow without in-band auth', async () => {
    const client = open('/guarded', { token: GUARD_TOKEN })

    expect(await client.opened).toBe(true)
    await until(() => reached.guarded === 1)
    await client.connection.notify(WATCH_EVENT, { event: 'add', path: 'README.md' })
    await until(() => guardedEvents.length === 1)
    expect(guardedEvents).toEqual([{ event: 'add', path: 'README.md' }])
  })

  test('a closed gate refuses the upgrade before the handler; an open one lets it through', async () => {
    const refused = open('/gated')
    expect(await refused.opened).toBe(false)
    expect(reached.gated).toBe(0)

    const admitted = open('/gated', { gate: 'open' })
    expect(await admitted.opened).toBe(true)
    await until(() => reached.gated === 1)
    expect(server.gate.asserted).toEqual([['watch'], ['watch']])
  })
})

describe('@owlmeans/server-socket — server shutdown', () => {
  test('closing the server closes every open socket with 1001', async () => {
    const server = await startSocketServer([
      bind(protocols.idle, connection(protocols.idle, async conn => { conn.listen(async () => undefined) })),
    ])
    const client = connectClient(server.url('/idle'))
    expect(await client.opened).toBe(true)
    expect(await roundTrip(client)).toBe(true)

    await server.close()
    expect((await client.closed).code).toBe(1001)
  })
})
