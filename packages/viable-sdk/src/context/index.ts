import { AppType } from '@owlmeans/context'
import { makeClientContext } from '@owlmeans/client-context'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { bind } from '@owlmeans/client-entrypoint'
import { appendPlanningClient } from '@owlmeans/client-planning'
import { openProtocol, protocols } from '@owlmeans/entrypoint'
import type { EntrypointTree } from '@owlmeans/entrypoint'
import { makePlanningProtocols } from '@owlmeans/planning'
import type { PlanningProtocols } from '@owlmeans/planning'
import { route } from '@owlmeans/route'
import { authMiddleware, DEFAULT_GUARD } from '@owlmeans/auth-common'
import { makeTokenCarrierGuard } from '@owlmeans/auth-token'
import { connect, connectProtocols, CONNECT_TOKEN_PREFIX } from '@owlmeans/viable-common'
import { COMMIT_POLL_SEC, SDK_SERVICE, TOOL_DEADLINE_MS } from '../consts.js'
import { SdkAuthError, SdkMisconfigured } from '../errors.js'

/**
 * The platform's websocket namespace, which the connector's socket route is declared under.
 *
 * A literal because it belongs to manager-api: the contract package takes it as a parameter for
 * exactly this reason, so that neither end has to import the other's constants.
 */
const UPDATE_BASE = 'viable:manager-api:update:base'
const updateBase = openProtocol(route(UPDATE_BASE, '/update'))

/**
 * The base alias and path manager-api mounts the planning protocol tree under.
 *
 * Literals for the same reason as {@link UPDATE_BASE}: they belong to manager-api, and
 * `makePlanningProtocols` takes them as parameters so neither end imports the other's constants.
 * Every planning alias and path derives from these, so the two ends agree on a route only while
 * both build the tree from the same base, path and socket base.
 */
const PLANNING_BASE_ALIAS = 'viable:manager-api:planning'
const PLANNING_BASE_PATH = '/planning'

/**
 * The planning tree exactly as manager-api mounts it, minus the ownership gate — a gate is the
 * server's to apply, and a client binding carries none.
 */
const sdkPlanningProtocols = (): PlanningProtocols => makePlanningProtocols({
  base: { alias: PLANNING_BASE_ALIAS, path: PLANNING_BASE_PATH },
  guards: DEFAULT_GUARD,
  socketBase: updateBase,
})

export interface SdkContextOptions {
  apiUrl: string
  /**
   * A fixed token, or a thunk resolved on every request. The thunk form is what lets a
   * credential holder (`@owlmeans/cli-auth`) hand the carrier guard something that changes
   * across the process's lifetime — empty before a sign-in completes, a real token after — with
   * no reconfiguration in between.
   */
  token: string | (() => string | Promise<string>)
  /** The service alias the API is registered under. One deployment, one alias. */
  service?: string
  /** Called when the platform rejects a request that presented this token — a credential holder
   * wires this to forgetting a dead token (and signing in again) or reporting the problem. */
  onRejected?: () => void | Promise<void>
}

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

  const surface = connectProtocols({
    guard: DEFAULT_GUARD,
    updateBase,
  })
  // The story tools speak planning: the same tree the platform mounts, reached with the same token.
  // Its commit socket hangs under the platform's `/update` base as well, which is one more reason
  // that base is declared here.
  const planning = sdkPlanningProtocols()

  // The socket routes hang under the platform's own websocket base, so that base has to exist
  // here too — a parent a registry cannot resolve fails the whole context at init, not the one
  // call that would have used it. It is a declaration-only namespace, so its client binding has
  // no screen or request implementation.
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
    timeout: TOOL_DEADLINE_MS,
    // Nothing a tool does reads a flow or a type, and the bundle would otherwise be fetched in the
    // background the moment the context is ready — a network call from a server nobody has asked
    // anything yet. `model()` still loads it on first use.
    schemas: false,
  })

  await context.configure().init()

  return context
}

export { connect }
