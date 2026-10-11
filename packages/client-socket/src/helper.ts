import { type ClientEntrypoint, clientRequestHelper } from '@owlmeans/client-entrypoint'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import { type Connection, SocketConnectionError } from '@owlmeans/socket'
import { makeConnection } from './utils/connection.js'
import { assertContext } from '@owlmeans/context'
import type { Config, Context, ConnectOptions, ReconnectPolicy, SocketStatusServiceAppend, WsOptions } from './types.js'
import type { SocketClientHelper } from './helper/types.js'
import { makeApiCallHelper } from '@owlmeans/client-entrypoint/utils'
import { createIdOfLength } from '@owlmeans/basic-ids'
import { DEFAULT_RECONNECT_POLICY, SOCKET_STATUS } from './consts.js'

export const createSocketClientHelper = (): SocketClientHelper => {
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

    let opened = false
    let lost = false
    const managed = makeConnection({
      policy, retry, open, onStatus: state => {
        lost = state === 'lost'
        status?.report(statusId, state, state === 'online' ? undefined : revive)
      }
    })
    const { connection, ready } = managed

    const baseClose = connection.close
    connection.close = async () => {
      await baseClose()
      status?.release(statusId)
    }

    const revive = () => {
      if (opened || !lost) {
        managed.revive()
        return
      }
      // Never opened, so `ws()` already rejected and nobody holds this connection to hand a revived
      // socket to: drop it for good and leave re-dialing to its owner (`useWs` does, on `onRetry`).
      void baseClose()
      status?.release(statusId)
    }

    // A rejection leaves this id reporting `'lost'` rather than releasing it — there is no
    // `Connection` to hand back for a caller to close, and the aggregate is what puts
    // `SocketReloadDialog` up. It is released by `revive` above, on the next `retry()`.
    await ready
    opened = true

    return connection
  }

  const connect = async (
    address: () => Promise<string> | string, ctx: Context, options?: ConnectOptions
  ): Promise<Connection> => {
    const { policy, retry } = resolvePolicy(ctx, options)
    return await establish(ctx, policy, retry, async () => openRawSocket(await address()))
  }

  const ws = async (
    module: ClientEntrypoint<string>, request?: AbstractRequest<{ token?: string }>, options?: WsOptions
  ): Promise<Connection> => {
    const ctx = assertContext<Config, Context>(module.ctx as Context, 'client-ws')
    request = request ?? clientRequestHelper.provideRequest(module.alias, module.path())
    const { policy, retry } = resolvePolicy(ctx, options)

    return await establish(ctx, policy, retry, async () => {
      await options?.beforeConnect?.(request!)
      const url = await makeApiCallHelper({ ref: module }).entrypointUrl(request)
      return await openRawSocket(url)
    })
  }

  return { connect, ws }
}

export const socketClientHelper = createSocketClientHelper()

/** @deprecated compat:factory-refactor — use `socketClientHelper.ws(…)` */
export const ws = (
  module: ClientEntrypoint<string>, request?: AbstractRequest<{ token?: string }>, options?: WsOptions
): Promise<Connection> => socketClientHelper.ws(module, request, options)
