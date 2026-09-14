import { createService } from '@owlmeans/context'
import { useContext } from '@owlmeans/client'
import { useEffect, useState } from 'react'
import type {
  Config, Context, SocketConnectionState, SocketStatusService, SocketStatusServiceAppend
} from './types.js'

export const SOCKET_STATUS = 'socket-status'

const RANK: Record<SocketConnectionState, number> = { online: 0, reconnecting: 1, lost: 2 }

/**
 * Aggregates the coarse health of every `ws()`/`useWs()` connection an app has open into one
 * worst-of-all state. A page with several sockets (thinking stream, file watch, notifications…)
 * still shows one dialog, not one per socket — so the aggregate, not any single connection, is
 * what a UI like `SocketReloadDialog` reads.
 */
export const createSocketStatusService = (alias: string = SOCKET_STATUS): SocketStatusService => {
  const states = new Map<string, SocketConnectionState>()
  const listeners = new Set<(state: SocketConnectionState) => void>()
  let current: SocketConnectionState = 'online'

  const recompute = () => {
    let worst: SocketConnectionState = 'online'
    for (const state of states.values()) {
      if (RANK[state] > RANK[worst]) worst = state
    }
    if (worst !== current) {
      current = worst
      listeners.forEach(listener => listener(current))
    }
  }

  return createService<SocketStatusService>(alias, {
    report: (id, state) => { states.set(id, state); recompute() },
    release: (id) => { states.delete(id); recompute() },
    state: () => current,
    subscribe: listener => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }, service => async () => { service.initialized = true })
}

/**
 * Register the shared socket-status aggregator. Idempotent, and cheap enough for a host package
 * (`@owlmeans/web-panel`) to call unconditionally on every context: every `ws()`/`useWs()`
 * connection reports itself here if — and only if — the context carries this service, so an app
 * that never calls this behaves exactly as it did before reconnect support existed.
 */
export const appendSocketStatus = <C extends Config = Config, T extends Context<C> = Context<C>>(
  ctx: T, alias: string = SOCKET_STATUS
): T & SocketStatusServiceAppend => {
  const _ctx = ctx as T & SocketStatusServiceAppend
  if (!ctx.hasService(alias)) {
    ctx.registerService(createSocketStatusService(alias))
  }
  _ctx.socketStatus = () => ctx.service(alias)
  return _ctx
}

const readSocketStatusService = (
  ctx: Context & Partial<SocketStatusServiceAppend>
): SocketStatusService | null => {
  try {
    return typeof ctx.hasService === 'function' && ctx.hasService(SOCKET_STATUS)
      ? ctx.socketStatus?.() ?? null : null
  } catch {
    // Registered but not yet run through the context's OWN `init()` — a component that renders
    // as a sibling of the router (as `SocketReloadDialog` does) mounts before that finishes,
    // since `context.configure().init()` runs from the router's effect, not before React's
    // first commit. Treat it as "not ready yet" rather than crash the render.
    return null
  }
}

/**
 * The worst state across every live `ws()`/`useWs()` connection, or `'online'` if the app never
 * registered the status service (`appendSocketStatus`) or has not finished initializing yet.
 */
export const useSocketStatus = (): SocketConnectionState => {
  const ctx = useContext() as unknown as Context & Partial<SocketStatusServiceAppend>
  const [state, setState] = useState<SocketConnectionState>(() => readSocketStatusService(ctx)?.state() ?? 'online')

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null

    const attach = (): boolean => {
      const service = readSocketStatusService(ctx)
      if (service == null) return false
      setState(service.state())
      unsubscribe = service.subscribe(next => { if (!cancelled) setState(next) })
      return true
    }

    if (!attach()) {
      void ctx.waitForInitialized?.().then(() => { if (!cancelled) attach() })
    }

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [ctx])

  return state
}
