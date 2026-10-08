import { randomUUID } from 'node:crypto'
import { DEFAULT_ALIAS, type ApiClient, type ResponseStatusCarrier } from '@owlmeans/api'
import { DEFAULT_KEY } from '@owlmeans/client-config'
import type { ClientConfig } from '@owlmeans/client-context'
import { assertContext, createService } from '@owlmeans/context'
import {
  EntrypointOutcome, provideResponse, transportAlias, type AbstractRequest, type AbstractResponse,
  type CommonEntrypoint,
} from '@owlmeans/entrypoint'
import { ResilientError } from '@owlmeans/error'
import { RouteMethod, RouteProtocols } from '@owlmeans/route'
import {
  CONNECT_CALL_COLLECT_WAIT_SEC, CONNECT_CALL_HEADER, ConnectCallLost, ConnectCallState, connectRef,
  type ConnectCallResult,
} from '@owlmeans/viable-common'
import { SdkUnsupported } from '../errors.js'
import {
  AXIOS_TIMEOUT_CODE, COLLECT_DROPPED_HOPS, COLLECT_DROPPED_STATUSES, COLLECT_FAST_MS, COLLECT_HOP_TIMEOUT_MS,
  COLLECT_PAUSE_MS,
} from './consts.local.js'
import { transportHelper } from './transport.js'
import type { CallCollectOptions, CallCollectTransport, CollectedCall } from './collect/types.js'
import type { Ctx } from './types.local.js'

/** A pause that a caller's abort cuts short. */
const pause = async (ms: number, signal?: AbortSignal): Promise<void> => await new Promise(resolve => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => {
    clearTimeout(timer)
    resolve()
  }, { once: true })
})

/**
 * The SDK context's HTTP transport: request now, collect later — see {@link CallCollectTransport}.
 *
 * Registered under `transportAlias('http')`, which every client entrypoint asks for before it
 * reaches for the API client, so the connector routes and the planning client get it with no
 * per-method code. It forwards to the context's API client (the service `cfg.webService` names),
 * resolved per call.
 */
export const createCallCollectTransport = (opts: CallCollectOptions): CallCollectTransport => {
  const location = 'viable-sdk:call-collect-transport'

  const contextOf = (): Ctx => assertContext<ClientConfig, Ctx>(transport.ctx as Ctx | undefined, location)

  /** The API client this transport stands in front of — what an entrypoint would have called. */
  const apiOf = (context: Ctx): ApiClient => {
    const named = context.cfg.webService
    const alias = typeof named === 'string' ? named : named?.[DEFAULT_KEY] ?? DEFAULT_ALIAS

    return context.service<ApiClient>(alias)
  }

  /** A write is anything but a GET: only a write can wait on a model call. */
  const writes = (context: Ctx, alias: string): boolean =>
    (context.entrypoint<CommonEntrypoint>(alias).route.route.method ?? RouteMethod.GET) !== RouteMethod.GET

  /**
   * The call's id, written onto the request itself: a request that already names one keeps it, so
   * a retry of the same request is the same call to the platform.
   */
  const nameCall = (req: AbstractRequest): string => {
    const existing = Object.entries(req.headers ?? {})
      .find(([key]) => key.toLowerCase() === CONNECT_CALL_HEADER)?.[1]
    const named = Array.isArray(existing) ? existing[0] : existing
    const callId = typeof named === 'string' && named !== '' ? named : randomUUID()
    req.headers = req.headers ?? {}
    req.headers[CONNECT_CALL_HEADER] = callId

    return callId
  }

  const pendingFor = (value: unknown, callId: string): boolean =>
    value != null && typeof value === 'object' && (value as { pending?: unknown }).pending === callId

  /** A hop the line dropped rather than the platform refused — asked again, since a collect is a read. */
  const dropped = (e: unknown): boolean => transportHelper.isTransientTransportError(e)
    || (e as { code?: unknown } | null)?.code === AXIOS_TIMEOUT_CODE
    || COLLECT_DROPPED_STATUSES.has((e as ResponseStatusCarrier | null)?.responseStatus ?? 0)

  const collect = async (context: Ctx, callId: string, signal?: AbortSignal): Promise<CollectedCall> => {
    let drops = 0
    for (;;) {
      const started = Date.now()
      let result: ConnectCallResult
      try {
        result = await context.entrypoint(connectRef.call.collect).call({
          params: { callId },
          query: { wait: CONNECT_CALL_COLLECT_WAIT_SEC },
          timeout: COLLECT_HOP_TIMEOUT_MS,
          ...(signal != null ? { signal } : {}),
        })
        drops = 0
      } catch (e) {
        if (signal?.aborted === true || !dropped(e) || ++drops > COLLECT_DROPPED_HOPS) throw e
        continue
      }

      switch (result.state) {
        case ConnectCallState.Settled:
          if (result.error != null && result.error !== '') {
            // The class the call itself would have thrown — rebuilt from its marshalled form.
            throw ResilientError.ensure(result.error)
          }

          return { value: result.value ?? null, outcome: result.outcome ?? EntrypointOutcome.Ok }
        case ConnectCallState.Lost:
          throw new ConnectCallLost(callId)
        case ConnectCallState.Pending:
          if (Date.now() - started < COLLECT_FAST_MS) await pause(COLLECT_PAUSE_MS, signal)
          continue
        default:
          throw new SdkUnsupported(`call-state:${String((result as { state?: unknown }).state)}`)
      }
    }
  }

  const handle = async (req: AbstractRequest, res: AbstractResponse<unknown>): Promise<void> => {
    const context = contextOf()
    const api = apiOf(context)
    if (!opts.delegated || !writes(context, req.alias)) {
      await api.handler(req, res)
      return
    }

    const callId = nameCall(req)
    const first = provideResponse<unknown>()
    await api.handler(req, first)
    if (first.error != null) {
      res.reject(first.error)
      return
    }
    if (!pendingFor(first.value, callId)) {
      res.resolve(first.value as unknown, first.outcome)
      return
    }

    try {
      const settled = await collect(context, callId, req.signal)
      res.resolve(settled.value, settled.outcome as EntrypointOutcome)
    } catch (e) {
      res.reject(e as Error)
    }
  }

  const transport: CallCollectTransport = createService<CallCollectTransport>(transportAlias(RouteProtocols.WEB), {
    protocol: RouteProtocols.WEB,
    delegated: opts.delegated,
    handle: handle as CallCollectTransport['handle'],
  })

  return transport
}

/** Register the call-collect transport on an SDK context — before its `init()`. */
export const appendCallCollectTransport = <T extends Ctx>(context: T, opts: CallCollectOptions): T => {
  context.registerService(createCallCollectTransport(opts))

  return context
}
