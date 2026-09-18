import { afterEach, describe, expect, test } from 'bun:test'
import type { Server } from 'bun'
import { connect } from '../src/helper.js'
import { makeConnection } from '../src/utils/connection.js'
import { appendSocketStatus } from '../src/status.js'
import { SocketSystemEvent } from '@owlmeans/socket'
import type { EventMessage } from '@owlmeans/socket'
import { makeTestContext } from './context.js'

/**
 * Real `Bun.serve` WebSocket servers and the real carrier — no mocks. Every server here answers
 * every upgrade and otherwise does nothing; the point is the CLIENT's behaviour when the server
 * disappears and comes back (or never comes back at all).
 */
let server: Server | null = null

const startServer = (port: number): Server => {
  server = Bun.serve({
    port,
    fetch(req, srv) {
      if (srv.upgrade(req)) return undefined
      return new Response('upgrade failed', { status: 400 })
    },
    // Echoes everything back (heartbeat pings included) — enough for a test to prove a frame
    // sent after a reconnect reaches the SAME pre-drop `observe` handler.
    websocket: { open() { }, message(ws, data) { ws.send(data) }, close() { } },
  })
  return server
}

const stopServer = () => {
  server?.stop(true)
  server = null
}

afterEach(() => {
  stopServer()
})

const waitFor = async (check: () => boolean, timeout: number, step = 20): Promise<void> => {
  const startedAt = Date.now()
  while (!check()) {
    if (Date.now() - startedAt > timeout) {
      throw new Error('waitFor: condition never became true')
    }
    await Bun.sleep(step)
  }
}

const systemEvents = (connection: Awaited<ReturnType<typeof connect>>): string[] => {
  const seen: string[] = []
  connection.listen(async message => {
    if (typeof message === 'object' && (message as EventMessage<unknown>).type === 'system') {
      seen.push((message as EventMessage<unknown>).event)
    }
  })
  return seen
}

describe('@owlmeans/client-socket — reconnect', () => {
  test('reconnects when the server restarts on the same port, on the SAME connection', async () => {
    const initial = startServer(0)
    const port = initial.port

    const ctx = makeTestContext({ reconnect: { minDelay: 50, maxDelay: 150, stableAfter: 200, budget: 30_000 } })
    const connection = await connect(() => `ws://localhost:${port}`, ctx)
    const events = systemEvents(connection)

    // Register an observer BEFORE the drop — it must still be the one that fires after the
    // reconnect, because the model is never recreated.
    let observed = 0
    connection.observe('probe', async () => { observed += 1 })

    stopServer()
    await waitFor(() => events.includes(SocketSystemEvent.Disconnected), 2_000)

    startServer(port)
    await waitFor(() => events.includes(SocketSystemEvent.Reconnected), 5_000)

    expect(events).not.toContain(SocketSystemEvent.Close)

    // The pre-drop observer is still live on the reconnected socket.
    await connection.notify('probe', {})
    await waitFor(() => observed === 1, 1_000)

    await connection.close()
  }, 10_000)

  test('backoff grows geometrically and is capped at maxDelay', async () => {
    // Drive `makeConnection` directly — `connect()`/`ws()` only hand back a `Connection` once
    // `ready` settles, and here we need to observe frames WHILE every attempt is still failing.
    const policy = {
      minDelay: 200, maxDelay: 3_000, factor: 2, jitter: 0.1,
      budget: 60_000, stableAfter: 999_999, heartbeat: 999_999, pongTimeout: 999_999,
    }
    const delays: number[] = []
    const { connection, ready } = makeConnection({
      policy, retry: true, open: () => Promise.reject(new Error('never up')),
    })
    ready.catch(() => void 0)
    connection.listen(async message => {
      const msg = message as EventMessage<{ attempt: number, delay: number }>
      if (typeof message === 'object' && msg.type === 'system' && msg.event === SocketSystemEvent.Reconnecting) {
        delays.push(msg.payload.delay)
      }
    })

    await waitFor(() => delays.length >= 5, 10_000)
    await connection.close()

    expect(delays[0]).toBeGreaterThanOrEqual(180)
    expect(delays[0]).toBeLessThanOrEqual(220)
    expect(delays[1]).toBeGreaterThanOrEqual(360)
    expect(delays[1]).toBeLessThanOrEqual(440)
    expect(delays[2]).toBeGreaterThanOrEqual(720)
    expect(delays[2]).toBeLessThanOrEqual(880)
    expect(delays[3]).toBeGreaterThanOrEqual(1_440)
    expect(delays[3]).toBeLessThanOrEqual(1_760)
    // The 5th attempt's raw geometric value (3200) already exceeds maxDelay, so it is capped.
    expect(delays[4]).toBeGreaterThanOrEqual(2_700)
    expect(delays[4]).toBeLessThanOrEqual(3_000)
  }, 15_000)

  test('client-initiated close never retries and reports exactly one close frame', async () => {
    const initial = startServer(0)
    const port = initial.port

    const ctx = makeTestContext({ reconnect: { minDelay: 50, maxDelay: 150 } })
    const connection = await connect(() => `ws://localhost:${port}`, ctx)
    const events = systemEvents(connection)

    await connection.close()
    await Bun.sleep(100)

    expect(events.filter(e => e === SocketSystemEvent.Close).length).toBe(1)
    expect(events).not.toContain(SocketSystemEvent.Disconnected)
    expect(events).not.toContain(SocketSystemEvent.Reconnecting)
  }, 5_000)

  test('gives up after the retry budget elapses: lost, then close, status reads lost, connect() rejects', async () => {
    const ctx = makeTestContext({ reconnect: { minDelay: 20, maxDelay: 40, budget: 200, stableAfter: 50 } })
    appendSocketStatus(ctx)
    ctx.configure()
    await ctx.init()

    await expect(connect(() => 'ws://127.0.0.1:1', ctx)).rejects.toBeTruthy()

    expect(ctx.socketStatus().state()).toBe('lost')
  }, 5_000)
})
