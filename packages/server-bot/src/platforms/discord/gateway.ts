import { logger } from '@owlmeans/log'
import {
  DISCORD_DISPATCH_EVENTS, DISCORD_FATAL_CLOSE_CODES, DISCORD_GATEWAY_ENCODING, DISCORD_GATEWAY_INTENTS,
  DISCORD_GATEWAY_VERSION, DISCORD_HELLO_TIMEOUT_MS, DISCORD_IDENTIFY_BROWSER, DISCORD_NEW_SESSION_CLOSE_CODES,
  DISCORD_RECONNECT_FAILURES_MAX, DISCORD_RECONNECT_MAX_MS, DISCORD_RESUME_CLOSE_CODE, DISCORD_SOCKET_OPEN,
  DISCORD_STOP_CLOSE_CODE, DiscordGatewayOp,
} from './consts.js'
import { DiscordGatewayError } from './errors.js'
import type {
  DiscordGateway, DiscordGatewayBot, DiscordGatewayFactory, DiscordGatewayOutcome, DiscordGatewayPayload,
  DiscordHello, DiscordReady, DiscordSocket,
} from './types.js'

const log = logger('server-bot:discord')

/** Resolve after `ms`, or at once when `signal` aborts. */
const sleep = async (ms: number, signal: AbortSignal): Promise<void> => {
  await new Promise<void>(resolve => {
    if (signal.aborted || ms <= 0) {
      resolve()
      return
    }
    const done = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

/** A gateway URL with the version and encoding this client speaks (`?v=10&encoding=json`). */
const socketUrlOf = (base: string): string => {
  const url = new URL(base)
  url.searchParams.set('v', DISCORD_GATEWAY_VERSION)
  url.searchParams.set('encoding', DISCORD_GATEWAY_ENCODING)

  return url.toString()
}

/** A frame's JSON — text frames live; a binary frame decoded as UTF-8; `null` when it does not parse. */
const frameOf = (data: unknown): DiscordGatewayPayload | null => {
  try {
    const text = typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer).toString('utf8')
    const frame = JSON.parse(text) as DiscordGatewayPayload
    return frame != null && typeof frame === 'object' && typeof frame.op === 'number' ? frame : null
  } catch {
    return null
  }
}

/**
 * The gateway client of one receiver run (https://discord.com/developers/docs/events/gateway).
 *
 * Hello (op 10) starts the heartbeat — the first beat after `interval × random`, then every interval,
 * each op 1 carrying the last sequence received; a beat whose predecessor got no ack (op 11) means a
 * zombie connection: closed with a resumable code and resumed. Then Identify (op 2: token, intents,
 * properties) or, with a session from READY, Resume (op 6) on its `resume_gateway_url`. Dispatches are
 * handled one by one in order; `MESSAGE_CREATE` / `MESSAGE_UPDATE` go to `emit`, awaited, and only a
 * handled dispatch moves the sequence a resume asks to be replayed after — what the inbox missed is
 * replayed. Op 7 resumes at once, op 9 waits 1–5× the reconnect delay and resumes or identifies anew
 * (`d`), a close code of `DISCORD_FATAL_CLOSE_CODES` ends the run with a `DiscordGatewayError`.
 */
export const makeDiscordGateway: DiscordGatewayFactory = (deps): DiscordGateway => {
  const { api, emit, signal, connection } = deps
  let sessionId: string | null = null
  let resumeUrl: string | null = null
  /** The last sequence received — what a heartbeat reports. */
  let received: number | null = null
  /** The last sequence handled — what a resume asks the gateway to replay after. */
  let handled: number | null = null

  const forget = (): void => {
    sessionId = null
    resumeUrl = null
    received = null
    handled = null
  }

  const backoff = (failures: number): number => failures <= 0
    ? Math.floor(deps.reconnectMs * Math.random())
    : Math.min(deps.reconnectMs * 2 ** (failures - 1), DISCORD_RECONNECT_MAX_MS)

  /** Get Gateway Bot: the URL to identify on — refused when the day's session starts are used up. */
  const gatewayUrl = async (): Promise<string> => {
    const bot = await api.call<DiscordGatewayBot>('GET', '/gateway/bot', undefined, { signal })
    if (bot?.session_start_limit != null && bot.session_start_limit.remaining <= 0) {
      throw DiscordGatewayError.of(0, `session-start-limit:${bot.session_start_limit.reset_after}`)
    }
    if (typeof bot?.url !== 'string' || bot.url === '') {
      throw DiscordGatewayError.of(0, 'no-gateway-url')
    }

    return bot.url
  }

  /** One socket from open to close; answers how it ended once every dispatch it received is handled. */
  const connect = async (url: string, resuming: boolean): Promise<DiscordGatewayOutcome> => await new Promise(resolve => {
    if (signal.aborted) {
      resolve({ resumable: false, healthy: false })
      return
    }
    let socket: DiscordSocket
    try {
      socket = deps.socket(url)
    } catch (error) {
      resolve({ resumable: false, healthy: false, fatal: error })
      return
    }
    let settled = false
    let healthy = false
    let failed = false
    let acked = true
    let interval = 0
    let beat: NodeJS.Timeout | null = null
    let hello: NodeJS.Timeout | null = null
    let work: Promise<void> = Promise.resolve()

    const stopBeating = (): void => {
      if (beat != null) {
        clearTimeout(beat)
        beat = null
      }
    }

    const finish = (outcome: DiscordGatewayOutcome): void => {
      if (settled) {
        return
      }
      settled = true
      stopBeating()
      if (hello != null) {
        clearTimeout(hello)
      }
      signal.removeEventListener('abort', stop)
      // What this socket received is handled before the next one opens (`work` never rejects).
      void work.then(() => resolve(outcome))
    }

    /** Close it ourselves — with a code that keeps the session resumable unless the run stops. */
    const end = (outcome: DiscordGatewayOutcome, code: number = DISCORD_RESUME_CLOSE_CODE): void => {
      if (settled) {
        return
      }
      try {
        socket.close(code)
      } catch {
        // Already closed: the outcome stands.
      }
      finish(outcome)
    }

    const send = (payload: DiscordGatewayPayload): void => {
      if (socket.readyState === DISCORD_SOCKET_OPEN) {
        socket.send(JSON.stringify(payload))
      }
    }

    const heartbeat = (): void => send({ op: DiscordGatewayOp.Heartbeat, d: received })

    const schedule = (ms: number): void => {
      beat = setTimeout(() => {
        if (!acked) {
          log.debug('Discord gateway zombie connection', { connection })
          end({ resumable: true, healthy: false, waitMs: 0 })
          return
        }
        acked = false
        heartbeat()
        schedule(interval)
      }, ms)
    }

    const dispatch = async (frame: DiscordGatewayPayload): Promise<void> => {
      if (frame.t === 'READY') {
        const ready = frame.d as DiscordReady
        sessionId = ready.session_id
        resumeUrl = ready.resume_gateway_url
        healthy = true
        log.debug('Discord gateway ready', { connection, resumed: false })
      } else if (frame.t === 'RESUMED') {
        healthy = true
        log.debug('Discord gateway ready', { connection, resumed: true })
      } else if (frame.t != null && DISCORD_DISPATCH_EVENTS.includes(frame.t)) {
        await emit(frame)
      }
      if (typeof frame.s === 'number') {
        handled = frame.s
      }
    }

    const stop = (): void => end({ resumable: false, healthy }, DISCORD_STOP_CLOSE_CODE)
    signal.addEventListener('abort', stop, { once: true })
    hello = setTimeout(() => end({ resumable: true, healthy: false }), DISCORD_HELLO_TIMEOUT_MS)

    socket.onmessage = event => {
      const frame = frameOf(event.data)
      if (settled || frame == null) {
        return
      }
      if (typeof frame.s === 'number') {
        received = frame.s
      }
      switch (frame.op) {
        case DiscordGatewayOp.Hello: {
          if (hello != null) {
            clearTimeout(hello)
          }
          interval = Math.max(Number((frame.d as DiscordHello)?.heartbeat_interval) || 0, 1)
          stopBeating()
          acked = true
          schedule(Math.floor(interval * Math.random()))
          if (resuming && sessionId != null) {
            send({ op: DiscordGatewayOp.Resume, d: { token: deps.token, session_id: sessionId, seq: handled } })
          } else {
            send({
              op: DiscordGatewayOp.Identify,
              d: {
                token: deps.token,
                intents: DISCORD_GATEWAY_INTENTS,
                properties: { os: process.platform, browser: DISCORD_IDENTIFY_BROWSER, device: DISCORD_IDENTIFY_BROWSER },
              },
            })
          }
          return
        }
        case DiscordGatewayOp.HeartbeatAck:
          acked = true
          return
        case DiscordGatewayOp.Heartbeat:
          heartbeat()
          return
        case DiscordGatewayOp.Reconnect:
          end({ resumable: true, healthy, waitMs: 0 })
          return
        case DiscordGatewayOp.InvalidSession:
          end({
            resumable: frame.d === true, healthy: false,
            waitMs: Math.floor(deps.reconnectMs * (1 + 4 * Math.random())),
          })
          return
        case DiscordGatewayOp.Dispatch:
          work = work
            .then(async () => { if (!failed) await dispatch(frame) })
            .catch(error => {
              // The inbox refused: nothing after it is handled; the resume replays from here.
              failed = true
              end({ resumable: true, healthy: false, fault: error })
            })
      }
    }

    socket.onclose = event => {
      if (settled) {
        return
      }
      const reason = DISCORD_FATAL_CLOSE_CODES[event.code]
      log.debug('Discord gateway closed', { connection, code: event.code })
      if (reason != null) {
        finish({ resumable: false, healthy, fatal: DiscordGatewayError.of(event.code, reason) })
        return
      }
      finish({ resumable: !DISCORD_NEW_SESSION_CLOSE_CODES.includes(event.code), healthy })
    }

    // An error is followed by a close, which decides.
    socket.onerror = () => undefined
  })

  const run = async (): Promise<void> => {
    let failures = 0
    try {
      while (!signal.aborted) {
        const resuming = sessionId != null && resumeUrl != null
        const url = resuming ? resumeUrl! : await gatewayUrl()
        if (!resuming) {
          forget()
        }
        const outcome = await connect(socketUrlOf(url), resuming)
        if (signal.aborted) {
          return
        }
        if (outcome.fatal != null) {
          throw outcome.fatal
        }
        if (!outcome.resumable) {
          forget()
        }
        failures = outcome.healthy ? 0 : failures + 1
        if (failures >= DISCORD_RECONNECT_FAILURES_MAX) {
          throw outcome.fault ?? DiscordGatewayError.of(0, 'unreachable')
        }
        const waitMs = outcome.waitMs ?? backoff(failures)
        log.debug('Discord gateway reconnecting', { connection, resume: sessionId != null, failures, waitMs })
        await sleep(waitMs, signal)
      }
    } catch (error) {
      if (signal.aborted) {
        return
      }
      throw error
    }
  }

  return { run }
}
