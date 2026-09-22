import type { Connection, EventMessage as EMessage } from '@owlmeans/socket'
import {
  createBasicConnection, MessageType, SocketConnectionError, SocketSystemEvent,
  SOCKET_HEARTBEAT_TIMEOUT_CODE
} from '@owlmeans/socket'
import { AuthenticationStage } from '@owlmeans/auth'
import type { ReconnectPolicy, SocketConnectionState } from '../types.js'

/** Close codes that mean "this connection is finished on purpose" — never worth retrying: a
 *  normal closure the SERVER initiated (1000, e.g. the protocol's own one-shot completion) and a
 *  policy violation (1008, e.g. the guard rejected the frame that opened it). A client-initiated
 *  close is handled separately, through `closedByClient`. */
const TERMINAL_CLOSE_CODES: ReadonlySet<number> = new Set([1000, 1008])

export interface ConnectionOpener {
  (): Promise<WebSocket>
}

export interface ManagedConnectionOptions {
  policy: ReconnectPolicy
  /** Whether a drop schedules a retry at all. `false` keeps the pre-reconnect-support
   *  behaviour — one attempt, report and stop — while the heartbeat/liveness check below still
   *  runs exactly as it always did. */
  retry: boolean
  /** Opens a fresh socket for the first attempt and every retry — already reflecting whatever a
   *  caller's `beforeConnect` refreshed (a token, most often). Resolves once the socket is OPEN,
   *  rejects on a handshake failure. */
  open: ConnectionOpener
  /** Told this connection's coarse health, if a caller wants to aggregate it — the status
   *  service `@owlmeans/web-panel`'s reload dialog reads. */
  onStatus?: (state: SocketConnectionState) => void
}

export interface ManagedConnection {
  connection: Connection
  /** Settles once the first socket opens; rejects with `SocketConnectionError('lost')` once the
   *  retry budget elapses first (or the single attempt fails, with `retry: false`). */
  ready: Promise<void>
  /** Restart retrying a connection that gave up after its budget: one attempt at once, then the
   *  usual backoff within `policy.reviveBudget`. On a connection still waiting out a backoff
   *  delay: attempt at once, and leave it at least `reviveBudget`. A no-op otherwise — a terminal
   *  close (client close, 1000/1008, `retry: false`) is never revived. */
  revive: () => void
}

/**
 * Build a `Connection` whose transport survives a dropped WebSocket.
 *
 * The connection MODEL (`createBasicConnection()`) is created exactly once and never replaced —
 * every `observe`/`listen` a caller registered keeps firing across a reconnect, because only the
 * underlying `WebSocket` is swapped underneath it. A server's own subscriptions do NOT survive a
 * new TCP connection, so a caller whose server sets up state only after an in-band
 * `authenticated` frame (as this platform's handlers do) must replay that frame itself on
 * `SocketSystemEvent.Reconnected` — this carrier only re-opens the pipe.
 */
export const makeConnection = (opts: ManagedConnectionOptions): ManagedConnection => {
  const { policy, retry, open, onStatus } = opts
  const model = createBasicConnection()

  let current: WebSocket | null = null
  let closedByClient = false
  let finished = false
  // Gave up after the budget, but still revivable — unlike `finished`, nothing here is final.
  let lost = false
  let attempts = 0
  let outageStartedAt: number | null = null
  let outageBudget = policy.budget
  let stableTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  // When the ping still waiting for an answer was sent, or null once anything came back.
  let pingSentAt: number | null = null

  let resolveReady: () => void = () => void 0
  let rejectReady: (error: Error) => void = () => void 0
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  let settled = false

  const settle = (error?: Error) => {
    if (settled) return
    settled = true
    if (error != null) rejectReady(error)
    else resolveReady()
  }

  const emitSystem = async <T,>(event: SocketSystemEvent, payload: T): Promise<void> => {
    const msg: EMessage<T> = { type: MessageType.System, event, payload }
    model.prepare?.(msg)
    await Promise.all(model.getListeners().map(async listener => {
      try {
        await listener(msg)
      } catch (error) {
        console.error('Socket system listener error:', error)
      }
    }))
  }

  const clearHeartbeat = () => {
    if (heartbeatTimer != null) { clearInterval(heartbeatTimer); heartbeatTimer = null }
  }

  const clearTimers = () => {
    if (retryTimer != null) { clearTimeout(retryTimer); retryTimer = null }
    if (stableTimer != null) { clearTimeout(stableTimer); stableTimer = null }
    clearHeartbeat()
  }

  const startHeartbeat = (socket: WebSocket) => {
    pingSentAt = null
    heartbeatTimer = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return
      if (pingSentAt != null && Date.now() - pingSentAt > policy.pongTimeout) {
        // Silent half-open TCP: the ping this socket owes an answer to went out long enough ago
        // that any live peer would have replied — force the close its own stack would eventually
        // notice on its own, minutes later.
        socket.close(SOCKET_HEARTBEAT_TIMEOUT_CODE)
        return
      }
      // Measured from the PING rather than from the last frame: a hidden tab's timers are
      // throttled to about one wake-up a minute, so "nothing has arrived for longer than a
      // heartbeat interval" is what throttling looks like, not what a dead socket looks like —
      // it used to kill a perfectly healthy backgrounded connection on every wake-up.
      pingSentAt = Date.now()
      socket.send(JSON.stringify({ type: 'ping' }))
    }, policy.heartbeat)
  }

  const computeDelay = (attempt: number): number => {
    const raw = Math.min(policy.maxDelay, policy.minDelay * Math.pow(policy.factor, attempt - 1))
    const span = raw * policy.jitter
    const jittered = raw + (Math.random() * 2 - 1) * span
    return Math.max(policy.minDelay, Math.min(policy.maxDelay, Math.round(jittered)))
  }

  const finish = async (code: number) => {
    if (finished) return
    finished = true
    closedByClient = true
    clearTimers()
    onStatus?.('lost')
    await emitSystem(SocketSystemEvent.Close, { code })
    settle(new SocketConnectionError('lost'))
  }

  // No `Close` frame here: the connection stays revivable, and `close` means gone for good.
  const giveUp = async () => {
    lost = true
    clearTimers()
    onStatus?.('lost')
    await emitSystem(SocketSystemEvent.Lost, {})
    settle(new SocketConnectionError('lost'))
  }

  const scheduleReconnect = () => {
    if (outageStartedAt == null) outageStartedAt = Date.now()
    if (Date.now() - outageStartedAt >= outageBudget) {
      void giveUp()
      return
    }
    attempts += 1
    const delay = computeDelay(attempts)
    onStatus?.('reconnecting')
    void emitSystem(SocketSystemEvent.Reconnecting, { attempt: attempts, delay })
    retryTimer = setTimeout(() => { retryTimer = null; void attemptConnect() }, delay)
  }

  const attemptConnect = async () => {
    if (closedByClient) return
    let socket: WebSocket
    try {
      socket = await open()
    } catch {
      if (retry) scheduleReconnect()
      else void finish(1006)
      return
    }
    if (closedByClient) {
      // Closed while this handshake was in flight — nobody is left to own the socket.
      socket.close(1000)
      return
    }
    onOpened(socket)
  }

  const revive = () => {
    if (finished) return
    if (lost) {
      lost = false
      attempts = 1
      outageStartedAt = Date.now()
      outageBudget = policy.reviveBudget
      onStatus?.('reconnecting')
      void emitSystem(SocketSystemEvent.Reconnecting, { attempt: attempts, delay: 0 })
      void attemptConnect()
      return
    }
    // Still retrying: never give up sooner than a revived connection would — otherwise a retry of
    // its lost siblings is undone moments later when this one's older budget runs out, even by an
    // attempt already in flight — and attempt now rather than after the backoff.
    if (current != null) return
    const now = Date.now()
    if (outageStartedAt != null && outageBudget - (now - outageStartedAt) < policy.reviveBudget) {
      outageStartedAt = now
      outageBudget = policy.reviveBudget
    }
    if (retryTimer == null) return
    clearTimeout(retryTimer)
    retryTimer = null
    void attemptConnect()
  }

  const onOpened = (socket: WebSocket) => {
    current = socket
    const wasRetry = attempts > 0

    const receiveMessage = async (event: MessageEvent) => {
      // Any frame at all answers the outstanding ping — the point is liveness, not pongs.
      pingSentAt = null
      if (typeof event.data === 'string') {
        try {
          if (JSON.parse(event.data)?.type === 'pong') return
        } catch {
          // The shared parser below reports malformed JSON consistently.
        }
      }
      await model.receive(event.data)
    }
    const messageHandler = (event: MessageEvent) => {
      void receiveMessage(event).catch(error => {
        console.error('WebSocket message rejected:', error)
        socket.close(1008)
      })
    }
    const errorHandler = () => {
      // The close event that always follows carries the code; nothing actionable here beyond
      // keeping the browser's own unhandled-error reporting quiet for it.
    }
    const closeHandler = async (event: CloseEvent) => {
      if (current !== socket) return
      socket.removeEventListener('message', messageHandler)
      socket.removeEventListener('close', closeHandler)
      socket.removeEventListener('error', errorHandler)
      clearHeartbeat()
      current = null

      if (closedByClient) {
        await emitSystem(SocketSystemEvent.Close, { code: event.code })
        return
      }
      if (!retry || TERMINAL_CLOSE_CODES.has(event.code)) {
        await finish(event.code)
        return
      }

      if (model._authSequence != null) {
        model._authSequence.reject(new SocketConnectionError('disconnected'))
        model._authSequence = undefined
      }
      model.stage = AuthenticationStage.Init
      await emitSystem(SocketSystemEvent.Disconnected, { code: event.code })
      scheduleReconnect()
    }

    socket.addEventListener('message', messageHandler)
    socket.addEventListener('close', closeHandler)
    socket.addEventListener('error', errorHandler)
    startHeartbeat(socket)

    if (stableTimer != null) clearTimeout(stableTimer)
    stableTimer = setTimeout(() => {
      attempts = 0
      outageStartedAt = null
      outageBudget = policy.budget
    }, policy.stableAfter)

    onStatus?.('online')
    settle()
    if (wasRetry) void emitSystem(SocketSystemEvent.Reconnected, { attempts })
  }

  model.send = async message => {
    if (typeof message !== 'string') model.prepare?.(message)
    if (current?.readyState === WebSocket.OPEN) {
      current.send(typeof message === 'string' ? message : JSON.stringify(message))
    }
  }

  model.close = async () => {
    if (finished) return
    finished = true
    closedByClient = true
    clearTimers()
    if (current != null && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
      current.close(1000)
    } else {
      // No live socket to fire a close event from — mid-retry, or closed before the first open
      // ever resolved — so report the same frame directly.
      await emitSystem(SocketSystemEvent.Close, { code: 1000 })
    }
    settle(new SocketConnectionError('closed'))
  }

  model.authenticate = async (_stage, _payload) => {
    // @TODO Provide authentication flow logic here
    return [] as any
  }

  model.prepare = (message, _isRequest) => {
    // @TODO add sender / recipient metadata
    message.dt = message.dt ?? Date.now()
    return message
  }

  void attemptConnect()

  return { connection: model, ready, revive }
}
