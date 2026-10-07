import { EventEmitter } from 'node:events'
import { AppType, createLazyService, createService } from '@owlmeans/context'
import type { AbstractRequest, GateService, GuardService } from '@owlmeans/entrypoint'
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
import { openProtocol } from '@owlmeans/entrypoint'
import { AuthorizationError, AuthenticationStage } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import { route, socket } from '@owlmeans/route'
import { appendApiServer } from '@owlmeans/server-api'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig } from '@owlmeans/server-context'
import { createBasicConnection, MessageType } from '@owlmeans/socket'
import type { AuthenticateMethod, Connection, EventMessage } from '@owlmeans/socket'
import { appendSocketService } from '../src/service.js'
import { createSocketMiddleware } from '../src/middleware.js'
import type { Context } from '../src/types.js'

export const TEST_SERVICE = 'server-socket-tests'
export const TEST_GUARD = 'server-socket-test-guard'
export const TEST_GATE = 'server-socket-test-gate'

/** What the agent signs with and the publisher accepts — the in-band credential of every case. */
export const AGENT_TOKEN = 'signed-by-the-agent'
/** The query token the HTTP guard of a guarded socket route accepts. */
export const GUARD_TOKEN = 'guard-accepts-this'

/** The publisher's `API_PUBLISHER_WATCH` event: one `{ event, path }` per file-system change. */
export const WATCH_EVENT = 'server-socket-test:watch'
/** The manager-api's `agent:thinking` relay event. */
export const THINKING_EVENT = 'server-socket-test:thinking'

export interface WatchChange { event: string, path: string }

/**
 * Socket routes declared the way a shared protocol package declares them — `socket()` routes in
 * immutable protocol declarations — one per case the specs depict.
 */
export const protocols = {
  /** The publisher's file watch (`publisherProtocols.update.files`). */
  files: openProtocol(route('server-socket-test:update:files', '/update/files', socket())),
  /** The manager-api's thinking relay (`back.update.project`). */
  thinking: openProtocol(route('server-socket-test:update:thinking', '/update/thinking', socket())),
  /** A handler that only wires listeners and resolves nothing. */
  idle: openProtocol(route('server-socket-test:idle', '/idle', socket())),
  /** A handler that throws before it is done. */
  failing: openProtocol(route('server-socket-test:failing', '/failing', socket())),
  /** A handler that answers once with a value and the Ok outcome. */
  once: openProtocol(route('server-socket-test:once', '/once', socket())),
  /** A route behind an HTTP guard. */
  guarded: openProtocol(route('server-socket-test:guarded', '/guarded', socket()), { guards: TEST_GUARD }),
  /** A route behind a gate. */
  gated: openProtocol(route('server-socket-test:gated', '/gated', socket()), {
    gate: { alias: TEST_GATE, params: ['watch'] },
  }),
} as const

const queryOf = (request: AbstractRequest): Record<string, unknown> =>
  (request.query ?? {}) as Record<string, unknown>

/** A guard that admits the upgrade carrying `GUARD_TOKEN` in its query, the way a bearer guard would. */
const createTestGuard = (): GuardService => createService<GuardService>(TEST_GUARD, {
  authenticated: async () => null,
  match: async request => queryOf(request).token != null,
  handle: async (request, response) => {
    if (queryOf(request).token !== GUARD_TOKEN) {
      return false as any
    }
    response.resolve({ token: GUARD_TOKEN, userId: 'agent' } as Auth)

    return true as any
  },
}, service => async () => { service.initialized = true })

/** A gate that opens only for an upgrade asking for it, and records every assertion it made. */
export interface TestGate extends GateService {
  asserted: string[][]
}

const createTestGate = (): TestGate => {
  const asserted: string[][] = []

  return createLazyService<TestGate>(TEST_GATE, {
    asserted,
    assert: async (request, _response, params) => {
      asserted.push(params)
      if (queryOf(request).gate !== 'open') {
        throw new AuthorizationError('gate')
      }
    },
  })
}

export interface SocketServer {
  context: Context
  gate: TestGate
  /** The `ws://` address of a route path on the bound ephemeral port. */
  url: (path: string, query?: Record<string, string>) => string
  close: () => Promise<void>
}

/**
 * A real server context wired the way `@owlmeans/server-app` wires one — the API server, the
 * socket service and its middleware — listening on an ephemeral port (`port: 0`).
 */
export const startSocketServer = async (entrypoints: ServerEntrypoint<any>[]): Promise<SocketServer> => {
  const context = makeServerContext(config<ServerConfig>(TEST_SERVICE, {
    services: { [TEST_SERVICE]: { service: TEST_SERVICE, type: AppType.Backend, host: '127.0.0.1', port: 0 } },
  } as Partial<ServerConfig>)) as unknown as Context
  appendApiServer(context)
  appendSocketService(context)
  context.registerMiddleware(createSocketMiddleware())
  context.registerService(createTestGuard())
  const gate = createTestGate()
  context.registerService(gate)
  context.registerEntrypoints(entrypoints)

  context.configure()
  await context.init()
  await context.getApiServer().listen()

  const address = context.getApiServer().server.server.address()
  const port = typeof address === 'object' && address != null ? address.port : 0

  return {
    context,
    gate,
    url: (path, query) => `ws://127.0.0.1:${port}${path}${query != null ? `?${new URLSearchParams(query)}` : ''}`,
    close: async () => { await context.getApiServer().server.close() },
  }
}

export interface Closed { code: number, reason: string }

export interface TestClient {
  connection: Connection
  socket: WebSocket
  /** Every raw frame the server sent, in order. */
  frames: string[]
  /** True once the socket opened; false when it closed (or failed) before opening. */
  opened: Promise<boolean>
  closed: Promise<Closed>
}

/**
 * The agent's side of the agent→publisher link (`connectWsWithSignedAuth` in viable's
 * `sources/backend/src/lib/ws.ts`): a plain WebSocket under the shared connection model, whose
 * close is reported to listeners as the system `close` frame.
 */
export const connectClient = (url: string): TestClient => {
  const ws = new WebSocket(url)
  const frames: string[] = []
  const model = createBasicConnection()

  model.send = async message => {
    if (typeof message !== 'string') {
      model.prepare?.(message)
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(typeof message === 'string' ? message : JSON.stringify(message))
    }
  }
  model.close = async () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close()
    }
  }
  // The agent never answers a server-initiated exchange, exactly like the platform's client.
  model.authenticate = (async () => []) as unknown as AuthenticateMethod
  model.prepare = message => {
    message.dt = message.dt ?? Date.now()
    return message
  }

  ws.addEventListener('message', event => {
    const data = typeof event.data === 'string' ? event.data : String(event.data)
    frames.push(data)
    void model.receive(data).catch(() => undefined)
  })

  const opened = new Promise<boolean>(resolve => {
    ws.addEventListener('open', () => resolve(true))
    ws.addEventListener('close', () => resolve(false))
  })
  const closed = new Promise<Closed>(resolve => {
    ws.addEventListener('close', event => {
      const msg: EventMessage<{ code: number }> = {
        type: MessageType.System, event: 'close', payload: { code: event.code },
      }
      void Promise.all(model.getListeners().map(async listener => await listener(msg)))
      resolve({ code: event.code, reason: event.reason })
    })
  })

  return { connection: model, socket: ws, frames, opened, closed }
}

/** Send a heartbeat and wait for the server's `pong` — proof the socket is alive end to end. */
export const roundTrip = async (client: TestClient): Promise<boolean> => {
  const before = client.frames.length
  client.socket.send(JSON.stringify({ type: 'ping' }))

  return await Promise.race([
    new Promise<boolean>(resolve => {
      const check = (): void => {
        if (client.frames.slice(before).includes(JSON.stringify({ type: 'pong' }))) {
          resolve(true)
        } else {
          setTimeout(check, 5)
        }
      }
      check()
    }),
    client.closed.then(() => false),
  ])
}

/** Wait until `predicate` holds, or fail after `timeout` ms. */
export const until = async (predicate: () => boolean, timeout: number = 2_000): Promise<void> => {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeout) {
      throw new Error('Condition not reached in time')
    }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

/**
 * The publisher's in-band authentication (`createWsAuthentication` in viable's
 * `sources/publisher/src/helpers/ws-auth.ts`): a valid credential announces the system
 * `authenticated` frame to the connection's own listeners; a refused one closes the socket.
 */
export const makeAgentAuthentication = (conn: Connection): AuthenticateMethod => (async (
  stage: AuthenticationStage, payload: { token?: string },
) => {
  if (stage !== AuthenticationStage.Authenticate || payload?.token !== AGENT_TOKEN) {
    await conn.close()

    return [AuthenticationStage.Error, null]
  }
  const msg: EventMessage<void> = { type: MessageType.System, event: 'authenticated', payload: undefined }
  conn.getListeners().map(listener => listener(msg))

  return [AuthenticationStage.Authenticated, true]
}) as AuthenticateMethod

/** A slot's change feed and a pub/sub topic: the in-process sources the real handlers subscribe to. */
export const makeFeed = (): EventEmitter => new EventEmitter()
