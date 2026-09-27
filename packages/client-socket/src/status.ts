import { createService } from '@owlmeans/context'
import { useContext } from '@owlmeans/client'
import { useCallback, useEffect, useState } from 'react'
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
  const revivers = new Map<string, () => void>()
  const listeners = new Set<(state: SocketConnectionState) => void>()
  const retryListeners = new Set<() => void>()
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

  // Connections still retrying are nudged too, so one whose older budget is about to run out does
  // not report `'lost'` right after its lost siblings were revived.
  const retry = (): boolean => {
    const pending = [...states].filter(([, state]) => state !== 'online')
    pending.forEach(([id]) => revivers.get(id)?.())
    if (!pending.some(([, state]) => state === 'lost')) return false
    retryListeners.forEach(listener => listener())
    return true
  }

  // A backgrounded tab is where sockets die unnoticed (throttled timers, a sleeping machine), so
  // the moment it is looked at again is the moment to retry — before anyone reaches for a button.
  const watchActivation = () => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') retry()
    })
    window.addEventListener('focus', () => { retry() })
    window.addEventListener('online', () => { retry() })
  }

  return createService<SocketStatusService>(alias, {
    report: (id, state, revive) => {
      states.set(id, state)
      if (revive != null) revivers.set(id, revive)
      else revivers.delete(id)
      recompute()
    },
    release: (id) => { states.delete(id); revivers.delete(id); recompute() },
    state: () => current,
    subscribe: listener => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    retry,
    onRetry: listener => {
      retryListeners.add(listener)
      return () => { retryListeners.delete(listener) }
    },
  }, service => async () => {
    watchActivation()
    service.initialized = true
  })
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

/** The status service once the context can hand it out; `null` while it cannot, or never will. */
const useStatusService = (): SocketStatusService | null => {
  const ctx = useContext() as unknown as Context & Partial<SocketStatusServiceAppend>
  const [service, setService] = useState<SocketStatusService | null>(() => readSocketStatusService(ctx))

  useEffect(() => {
    if (service != null) return
    let cancelled = false
    void ctx.waitForInitialized?.().then(() => { if (!cancelled) setService(readSocketStatusService(ctx)) })
    return () => { cancelled = true }
  }, [ctx, service])

  return service
}

/**
 * The worst state across every live `ws()`/`useWs()` connection, or `'online'` if the app never
 * registered the status service (`appendSocketStatus`) or has not finished initializing yet.
 */
export const useSocketStatus = (): SocketConnectionState => {
  const service = useStatusService()
  const [state, setState] = useState<SocketConnectionState>(() => service?.state() ?? 'online')

  useEffect(() => {
    if (service == null) return
    setState(service.state())
    return service.subscribe(setState)
  }, [service])

  return state
}

/**
 * `retry` revives every lost connection now (`SocketStatusService.retry()`); `retrying` is true
 * from any retry — this one, or the service's own on tab activation — until the aggregate settles
 * back on `'online'` or `'lost'`.
 */
export const useSocketRetry = (): { retry: () => void, retrying: boolean } => {
  const service = useStatusService()
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    if (service == null) return
    const stopRetry = service.onRetry(() => setRetrying(service.state() === 'reconnecting'))
    const stopState = service.subscribe(state => { if (state !== 'reconnecting') setRetrying(false) })
    return () => { stopRetry(); stopState() }
  }, [service])

  const retry = useCallback(() => { service?.retry() }, [service])

  return { retry, retrying }
}
