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

const startServer = (port: number, echo: boolean = true): Server => {
  server = Bun.serve({
    port,
    fetch(req, srv) {
      if (srv.upgrade(req)) return undefined
      return new Response('upgrade failed', { status: 400 })
    },
    // Answers a heartbeat ping with a pong, exactly as `server-socket` does, and echoes every
    // other frame — enough for a test to prove a frame sent after a reconnect reaches the SAME
    // pre-drop `observe` handler. `echo: false` upgrades and then answers nothing at all: a
    // half-open connection, from the client's side.
    websocket: {
      open() { },
      message(ws, data) {
        if (!echo) return
        try {
          if (typeof data === 'string' && JSON.parse(data)?.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }))
            return
          }
        } catch {
          // Not JSON at all — echoed below like any other frame.
        }
        ws.send(data)
      },
      close() { },
    },
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
      budget: 60_000, reviveBudget: 60_000, stableAfter: 999_999, heartbeat: 999_999, pongTimeout: 999_999,
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

  test('a socket that answers nothing at all is force-closed by the heartbeat', async () => {
    const silent = startServer(0, false)

    const ctx = makeTestContext({
      reconnect: { heartbeat: 60, pongTimeout: 30, minDelay: 20, maxDelay: 40, budget: 10_000 }
    })
    const connection = await connect(() => `ws://localhost:${silent.port}`, ctx)
    const events = systemEvents(connection)

    await waitFor(() => events.includes(SocketSystemEvent.Disconnected), 3_000)

    await connection.close()
  }, 10_000)

  test('a heartbeat wake-up long after the previous one keeps a socket the server answers', async () => {
    const initial = startServer(0)
    const port = initial.port
    const realNow = Date.now.bind(Date)

    const ctx = makeTestContext({
      reconnect: { heartbeat: 100, pongTimeout: 50, minDelay: 20, maxDelay: 40, budget: 10_000 }
    })
    const connection = await connect(() => `ws://localhost:${port}`, ctx)
    const events = systemEvents(connection)
    let observed = 0
    connection.observe('probe', async () => { observed += 1 })

    // What a backgrounded tab looks like: real timers keep firing, but every wake-up lands a
    // minute later than the last as far as the clock is concerned.
    let skew = 0
    Date.now = () => realNow() + skew
    const throttle = setInterval(() => { skew += 60_000 }, 50)
    const wait = async (ms: number) => {
      const until = realNow() + ms
      while (realNow() < until) await Bun.sleep(20)
    }

    try {
      await wait(800)
      // Several heartbeat intervals with an apparent minute between each: nothing dropped.
      expect(events).toEqual([])

      await connection.notify('probe', {})
      const deadline = realNow() + 2_000
      while (observed === 0 && realNow() < deadline) await Bun.sleep(20)
      expect(observed).toBe(1)
    } finally {
      clearInterval(throttle)
      Date.now = realNow
      await connection.close()
    }
  }, 15_000)

  test('gives up after the retry budget elapses: status reads lost, connect() rejects', async () => {
    const ctx = makeTestContext({ reconnect: { minDelay: 20, maxDelay: 40, budget: 200, stableAfter: 50 } })
    appendSocketStatus(ctx)
    ctx.configure()
    await ctx.init()

    await expect(connect(() => 'ws://127.0.0.1:1', ctx)).rejects.toBeTruthy()

    expect(ctx.socketStatus().state()).toBe('lost')
  }, 5_000)

  test('retry() revives a lost connection in place: no close frame, reconnected on the SAME connection', async () => {
    const initial = startServer(0)
    const port = initial.port

    const ctx = makeTestContext({
      reconnect: { minDelay: 20, maxDelay: 40, budget: 300, reviveBudget: 2_000, stableAfter: 50 }
    })
    appendSocketStatus(ctx)
    ctx.configure()
    await ctx.init()

    const connection = await connect(() => `ws://localhost:${port}`, ctx)
    const events = systemEvents(connection)
    let observed = 0
    connection.observe('probe', async () => { observed += 1 })

    stopServer()
    await waitFor(() => events.includes(SocketSystemEvent.Lost), 3_000)
    expect(ctx.socketStatus().state()).toBe('lost')
    // `close` means gone for good — a lost connection is still revivable.
    expect(events).not.toContain(SocketSystemEvent.Close)

    startServer(port)
    let retried = 0
    ctx.socketStatus().onRetry(() => { retried += 1 })
    expect(ctx.socketStatus().retry()).toBe(true)
    expect(retried).toBe(1)
    expect(ctx.socketStatus().state()).toBe('reconnecting')

    await waitFor(() => events.includes(SocketSystemEvent.Reconnected), 3_000)
    expect(ctx.socketStatus().state()).toBe('online')

    await connection.notify('probe', {})
    await waitFor(() => observed === 1, 1_000)

    // Nothing is lost any more — a second retry has nothing to do and tells nobody.
    expect(ctx.socketStatus().retry()).toBe(false)
    expect(retried).toBe(1)

    await connection.close()
  }, 10_000)

  test('a revive that cannot succeed reports lost again once reviveBudget elapses', async () => {
    const initial = startServer(0)
    const port = initial.port

    const ctx = makeTestContext({
      reconnect: { minDelay: 20, maxDelay: 40, budget: 200, reviveBudget: 200, stableAfter: 50 }
    })
    appendSocketStatus(ctx)
    ctx.configure()
    await ctx.init()

    const connection = await connect(() => `ws://localhost:${port}`, ctx)
    const events = systemEvents(connection)

    stopServer()
    await waitFor(() => events.includes(SocketSystemEvent.Lost), 3_000)

    ctx.socketStatus().retry()
    expect(ctx.socketStatus().state()).toBe('reconnecting')
    await waitFor(() => events.filter(e => e === SocketSystemEvent.Lost).length === 2, 3_000)
    expect(ctx.socketStatus().state()).toBe('lost')
    expect(events).not.toContain(SocketSystemEvent.Close)

    await connection.close()
    expect(ctx.socketStatus().state()).toBe('online')
  }, 10_000)

  test('revive() on a connection still retrying attempts at once and outlives its old budget', async () => {
    // Its own budget alone would report lost ~400ms in; the revive at ~50ms must push that out.
    const policy = {
      minDelay: 200, maxDelay: 200, factor: 1, jitter: 0,
      budget: 300, reviveBudget: 1_500, stableAfter: 999_999, heartbeat: 999_999, pongTimeout: 999_999,
    }
    let opens = 0
    const events: string[] = []
    const { connection, ready, revive } = makeConnection({
      policy, retry: true, open: () => { opens += 1; return Promise.reject(new Error('down')) },
    })
    ready.catch(() => void 0)
    connection.listen(async message => {
      const msg = message as EventMessage<unknown>
      if (typeof message === 'object' && msg.type === 'system') events.push(msg.event)
    })

    await waitFor(() => opens === 1, 1_000)
    await Bun.sleep(50)
    revive()
    // At once — not after the 200ms backoff the failed first attempt scheduled.
    expect(opens).toBe(2)

    await Bun.sleep(600)
    expect(events).not.toContain(SocketSystemEvent.Lost)
    await waitFor(() => events.includes(SocketSystemEvent.Lost), 3_000)

    await connection.close()
  }, 10_000)

  test('revive() during an in-flight attempt still extends the budget that attempt will face', async () => {
    // The 2nd attempt hangs 400ms and fails at ~450ms, past the 300ms budget — lost, unless the
    // revive at ~100ms moved the budget first.
    const policy = {
      minDelay: 50, maxDelay: 50, factor: 1, jitter: 0,
      budget: 300, reviveBudget: 1_500, stableAfter: 999_999, heartbeat: 999_999, pongTimeout: 999_999,
    }
    let opens = 0
    const events: string[] = []
    const { connection, ready, revive } = makeConnection({
      policy, retry: true, open: async () => {
        opens += 1
        if (opens === 2) await Bun.sleep(400)
        throw new Error('down')
      },
    })
    ready.catch(() => void 0)
    connection.listen(async message => {
      const msg = message as EventMessage<unknown>
      if (typeof message === 'object' && msg.type === 'system') events.push(msg.event)
    })

    await waitFor(() => opens === 2, 1_000)
    await Bun.sleep(50)
    revive()
    // No second attempt on top of the one in flight.
    expect(opens).toBe(2)

    await Bun.sleep(600)
    expect(events).not.toContain(SocketSystemEvent.Lost)
    await waitFor(() => events.includes(SocketSystemEvent.Lost), 3_000)

    await connection.close()
  }, 10_000)

  test('retry() drops a connection that never opened and tells its owner to dial again', async () => {
    const ctx = makeTestContext({ reconnect: { minDelay: 20, maxDelay: 40, budget: 200, stableAfter: 50 } })
    appendSocketStatus(ctx)
    ctx.configure()
    await ctx.init()

    await expect(connect(() => 'ws://127.0.0.1:1', ctx)).rejects.toBeTruthy()
    expect(ctx.socketStatus().state()).toBe('lost')

    let retried = 0
    ctx.socketStatus().onRetry(() => { retried += 1 })
    expect(ctx.socketStatus().retry()).toBe(true)

    // There was no `Connection` to revive, so nothing is left reporting — the owner re-dials.
    expect(ctx.socketStatus().state()).toBe('online')
    expect(retried).toBe(1)
  }, 5_000)
})
