import { type ClientEntrypoint, clientRequestHelper } from '@owlmeans/client-entrypoint'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { Connection } from '@owlmeans/socket'
import type { EntrypointReference } from '@owlmeans/context'
import type { SocketStatusServiceAppend, WsOptions } from './types.js'
import { useContext, useValue } from '@owlmeans/client'
import { AUTH_QUERY } from '@owlmeans/auth'
import { useEffect, useMemo, useState } from 'react'
import { SOCKET_STATUS } from './consts.js'
import { socketClientHelper } from './helper.js'

/**
 * Open a socket through a declared entrypoint protocol.
 *
 * String aliases remain an adapter input for dynamically addressed integrations, while
 * application callers pass their immutable protocol declaration and receive its bound client
 * entrypoint here at the transport boundary.
 *
 * Re-opens on its own after a network drop (see `ws()`). `null` until the first attempt opens,
 * and again once the retry budget elapses without one ever opening — dialed afresh on the next
 * `SocketStatusService.retry()`. A screen that must tell those two apart reads
 * `useSocketStatus()` (from `./status.js`) alongside this.
 */
export const useWs = (
  module: EntrypointReference | string, request?: Partial<AbstractRequest<any>>, options?: WsOptions
): Connection | null => {
  const ctx = useContext()
  const mod = useMemo(
    () => ctx.entrypoint<ClientEntrypoint>(module),
    [module]
  )
  const [failed, setFailed] = useState(false)
  const [dial, setDial] = useState(0)
  const connection = useValue<Connection | null>(async (cancel) => {
    const _request = clientRequestHelper.provideRequest(mod.alias, mod.path())
    Object.assign(_request, request)
    try {
      const conn = await socketClientHelper.ws(mod, _request, options)
      if (cancel?.current) {
        // The component unmounted while the handshake (or its retries) were still in flight —
        // there is no `useEffect` cleanup coming for this value, so close it here instead of
        // leaving a live socket and its retry timers attached to nothing.
        void conn.close()
        return null
      }
      return conn
    } catch {
      if (!cancel?.current) setFailed(true)
      return null
    }
  }, [
    mod.alias,
    request?.query?.[AUTH_QUERY],
    request?.params ? JSON.stringify(request.params) : undefined,
    dial
  ])

  useEffect(() => {
    if (!failed || !ctx.hasService(SOCKET_STATUS)) return
    return (ctx as unknown as SocketStatusServiceAppend).socketStatus().onRetry(() => {
      setFailed(false)
      setDial(n => n + 1)
    })
  }, [failed])

  useEffect(() => {
    if (connection != null) {
      return () => {
        void connection.close()
      }
    }
  }, [connection])

  return connection
}
