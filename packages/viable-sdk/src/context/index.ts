import { AppType } from '@owlmeans/context'
import { makeClientContext, type ClientConfig, type ClientContext } from '@owlmeans/client-context'
import { bind } from '@owlmeans/client-entrypoint'
import { appendPlanningClient } from '@owlmeans/client-planning'
import { openProtocol, protocols, type EntrypointTree } from '@owlmeans/entrypoint'
import { makePlanningProtocols, type PlanningProtocols } from '@owlmeans/planning'
import { route } from '@owlmeans/route'
import { authMiddleware, DEFAULT_GUARD } from '@owlmeans/auth-common'
import { makeTokenCarrierGuard } from '@owlmeans/auth-token'
import { connect, connectProtocols, CONNECT_TOKEN_PREFIX, ConnectLlm } from '@owlmeans/viable-common'
import { appendCallCollectTransport } from '../api/collect.js'
import { COMMIT_POLL_SEC, SDK_SERVICE, TOOL_DEADLINE_MS } from '../consts.js'
import { SdkAuthError, SdkMisconfigured } from '../errors.js'
import { PLANNING_BASE_ALIAS, PLANNING_BASE_PATH, UPDATE_BASE } from './consts.local.js'
import type { SdkContextOptions } from './types.js'

const updateBase = openProtocol(route(UPDATE_BASE, '/update'))


/**
 * The planning tree exactly as manager-api mounts it, minus the ownership gate — a gate is the
 * server's to apply, and a client binding carries none.
 */
const sdkPlanningProtocols = (): PlanningProtocols => makePlanningProtocols({
  base: { alias: PLANNING_BASE_ALIAS, path: PLANNING_BASE_PATH },
  guards: DEFAULT_GUARD,
  socketBase: updateBase,
})

/**
 * A client context that speaks to a viable deployment with one access token.
 *
 * The same machinery a browser uses — the API client, the entrypoint registry, the auth
 * middleware — with one difference: the guard holds a long-lived credential the user was handed
 * instead of a session it negotiated. Registering it under the alias the routes already name is
 * what makes every unchanged route declaration work from a process that has no browser.
 *
 * There is deliberately no second credential path. A connector that could fall back to some other
 * form of authentication would be a connector whose access nobody can revoke by revoking a token.
 */
export const makeSdkContext = async (opts: SdkContextOptions): Promise<ClientContext<ClientConfig>> => {
  // A THUNK's value is unknown until it resolves — a holder that has not signed in yet returns
  // `''` on purpose, and that is not a misconfiguration this constructor can see. Only a literal
  // string is validated eagerly, exactly as it always was, so every existing caller that passes
  // one keeps getting the same synchronous refusal.
  if (typeof opts.token === 'string') {
    if (opts.token === '') {
      throw new SdkMisconfigured('token')
    }
    if (!opts.token.startsWith(CONNECT_TOKEN_PREFIX)) {
      // Refused here rather than at the first call: a value that is not one of this platform's
      // tokens produces a 401 with nothing in it about which of the several plausible mistakes was
      // made, and the answer is always the same one — that is not the token you were given.
      throw new SdkAuthError(`prefix:${CONNECT_TOKEN_PREFIX}`)
    }
  }

  const service = opts.service ?? 'viable-manager-api'
  const url = new URL(opts.apiUrl)

  // NOT `addWebService`: that names the backend service as `cfg.webService`, which is the alias of
  // the API CLIENT rather than of the backend — the entrypoint handler resolves
  // `context.service(cfg.webService)` and would look for a service registered under the backend's
  // name, failing every call with `Service <name> not found`. Left unset, `appendApiClient` inside
  // `makeClientContext` claims it for the client it registers, and the backend descriptor below is
  // reached through the route's own address because it is this context's default backend.
  const cfg = ({
    ready: false,
    service: SDK_SERVICE,
    type: AppType.Frontend,
    layer: undefined,
    services: {
      [service]: {
        service,
        type: AppType.Backend,
        host: url.hostname,
        ...(url.port !== '' ? { port: Number(url.port) } : {}),
        base: url.pathname === '/' ? undefined : url.pathname.replace(/^\/|\/$/g, ''),
        secure: url.protocol === 'https:',
        default: true,
      },
    },
  } as unknown as ClientConfig)

  const context = makeClientContext(cfg) as ClientContext<ClientConfig>

  context.registerService(makeTokenCarrierGuard(DEFAULT_GUARD, {
    token: opts.token,
    // The scheme the platform's own guard claims first; `Bearer` is accepted too, and is what a
    // host configured with a bare URL will send.
    scheme: 'auth-token',
    onRejected: opts.onRejected,
  }))
  context.registerMiddleware(authMiddleware)
  // ONE transport in front of the API client for every bound route — the connector's and the
  // planning client's. In the delegated mode it names each write (`x-viable-call`) and collects an
  // early `{ pending }` answer until the call settles; otherwise it only forwards.
  appendCallCollectTransport(context, { delegated: opts.llm === ConnectLlm.Local })

  const surface = connectProtocols({ guard: DEFAULT_GUARD })
  // The story tools speak planning: the same tree the platform mounts, reached with the same token.
  const planning = sdkPlanningProtocols()

  // The planning commit feed hangs under the platform's own websocket base, so that base has to
  // exist here too — a parent a registry cannot resolve fails the whole context at init, not the
  // one call that would have used it. It is a declaration-only namespace, so its client binding has
  // no screen or request implementation, and the SDK never opens the feed.
  const entrypoints = [
    bind(updateBase),
    ...protocols(surface).map(declaration => bind(declaration)),
    ...protocols(planning as unknown as EntrypointTree).map(declaration => bind(declaration)),
  ]

  // Every caller gets a context-local client binding from the immutable protocol it shares with
  // the server. No alias lookup can drift from a path or contract declaration.
  context.registerEntrypoints(entrypoints)

  appendPlanningClient(context, {
    protocols: planning,
    // Bound above, beside the connector routes, so one registration holds the whole surface.
    bind: false,
    // No socket opener: a commit is awaited by long poll only, which is the only transport the SDK
    // speaks and the one that survives every proxy.
    poll: COMMIT_POLL_SEC,
    timeout: opts.timeout ?? TOOL_DEADLINE_MS,
    // Nothing a tool does reads a flow or a type, and the bundle would otherwise be fetched in the
    // background the moment the context is ready — a network call from a server nobody has asked
    // anything yet. `model()` still loads it on first use.
    schemas: false,
  })

  await context.configure().init()

  return context
}

export { connect }

export type { SdkContextOptions } from './types.js'
