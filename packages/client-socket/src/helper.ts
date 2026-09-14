import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import { provideRequest } from '@owlmeans/client-entrypoint'
import type { Connection } from '@owlmeans/socket'
import { SocketConnectionError } from '@owlmeans/socket'
import { makeConnection } from './utils/connection.js'
import { assertContext } from '@owlmeans/context'
import type { EntrypointReference } from '@owlmeans/context'
import type { Config, Context, ConnectOptions, ReconnectPolicy, SocketStatusServiceAppend, WsOptions } from './types.js'
import { useContext, useValue } from '@owlmeans/client'
import { AUTH_QUERY } from '@owlmeans/auth'
import { entrypointUrl } from '@owlmeans/client-entrypoint/utils'
import { useEffect, useMemo } from 'react'
import { createIdOfLength } from '@owlmeans/basic-ids'
import { DEFAULT_RECONNECT_POLICY } from './consts.js'
import { SOCKET_STATUS } from './status.js'

const resolvePolicy = (
  ctx: Context, options?: ConnectOptions
): { policy: ReconnectPolicy, retry: boolean } => {
  const requested = options?.reconnect !== undefined ? options.reconnect : ctx.cfg.socket?.reconnect
  const retry = requested !== false
  const overrides = requested === false || requested == null ? {} : requested
  return { policy: { ...DEFAULT_RECONNECT_POLICY, ...overrides }, retry }
}

const openRawSocket = async (url: string): Promise<WebSocket> => {
  const socket = new WebSocket(url)
  return await new Promise<WebSocket>((resolve, reject) => {
    const cleanup = () => {
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('error', onFail)
      socket.removeEventListener('close', onFail)
    }
    const onOpen = () => { cleanup(); resolve(socket) }
    const onFail = () => { cleanup(); reject(new SocketConnectionError('handshake')) }
    socket.addEventListener('open', onOpen)
    socket.addEventListener('error', onFail)
    socket.addEventListener('close', onFail)
  })
}

const establish = async (
  ctx: Context, policy: ReconnectPolicy, retry: boolean, open: () => Promise<WebSocket>
): Promise<Connection> => {
  const statusId = createIdOfLength(8)
  const status = ctx.hasService(SOCKET_STATUS)
    ? (ctx as unknown as SocketStatusServiceAppend).socketStatus() : null

  const { connection, ready } = makeConnection({
    policy, retry, open, onStatus: state => status?.report(statusId, state)
  })

  const baseClose = connection.close
  connection.close = async () => {
    await baseClose()
    status?.release(statusId)
  }

  // A rejection here means `finish()` already ran and reported this id's terminal state —
  // `'lost'` in every case, since the budget-exhausted path is the only one that rejects
  // `ready`. Deliberately NOT released: there is no `Connection` to hand back for a caller to
  // close, so the aggregate stays `'lost'` — the whole reason `SocketReloadDialog` exists — until
  // the page reloads. Only a connection this function actually returns can be released, and only
  // by the caller closing it on purpose.
  await ready

  return connection
}

/**
 * Open a socket with no declared entrypoint behind it — the primitive `ws()` builds on, and what
 * a test drives directly against a bare WebSocket server.
 */
export const connect = async (
  address: () => Promise<string> | string, ctx: Context, options?: ConnectOptions
): Promise<Connection> => {
  const { policy, retry } = resolvePolicy(ctx, options)
  return await establish(ctx, policy, retry, async () => openRawSocket(await address()))
}

/**
 * Open a socket through a declared entrypoint protocol, restoring it on its own after a network
 * failure — see the client-socket skill's "Disconnects" section for the full policy. Resolves
 * once the first attempt opens; rejects with `SocketConnectionError('lost')` if the retry budget
 * elapses before that ever happens (or the single attempt fails, with `reconnect: false`).
 */
export const ws = async (
  module: ClientEntrypoint<string>, request?: AbstractRequest<{ token?: string }>, options?: WsOptions
): Promise<Connection> => {
  const ctx = assertContext<Config, Context>(module.ctx as Context, 'client-ws')
  request = request ?? provideRequest(module.alias, module.path())
  const { policy, retry } = resolvePolicy(ctx, options)

  return await establish(ctx, policy, retry, async () => {
    await options?.beforeConnect?.(request!)
    const url = await entrypointUrl({ ref: module }, request)
    return await openRawSocket(url)
  })
}

/**
 * Open a socket through a declared entrypoint protocol.
 *
 * String aliases remain an adapter input for dynamically addressed integrations, while
 * application callers pass their immutable protocol declaration and receive its bound client
 * entrypoint here at the transport boundary.
 *
 * Re-opens on its own after a network drop (see `ws()`). `null` until the first attempt opens,
 * and again once the retry budget elapses without one ever opening — a screen that must tell
 * those two apart reads `useSocketStatus()` (from `./status.js`) alongside this.
 */
export const useWs = (
  module: EntrypointReference | string, request?: Partial<AbstractRequest<any>>, options?: WsOptions
): Connection | null => {
  const ctx = useContext()
  const mod = useMemo(
    () => ctx.entrypoint<ClientEntrypoint>(module),
    [module]
  )
  const connection = useValue<Connection | null>(async (cancel) => {
    const _request = provideRequest(mod.alias, mod.path())
    Object.assign(_request, request)
    try {
      const conn = await ws(mod, _request, options)
      if (cancel?.current) {
        // The component unmounted while the handshake (or its retries) were still in flight —
        // there is no `useEffect` cleanup coming for this value, so close it here instead of
        // leaving a live socket and its retry timers attached to nothing.
        void conn.close()
        return null
      }
      return conn
    } catch {
      return null
    }
  }, [
    mod.alias,
    request?.query?.[AUTH_QUERY],
    request?.params ? JSON.stringify(request.params) : undefined
  ])

  useEffect(() => {
    if (connection != null) {
      return () => {
        void connection.close()
      }
    }
  }, [connection])

  return connection
}
