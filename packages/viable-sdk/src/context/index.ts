import { AppType } from '@owlmeans/context'
import { makeClientContext } from '@owlmeans/client-context'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { bind } from '@owlmeans/client-entrypoint'
import { openProtocol, protocols } from '@owlmeans/entrypoint'
import { route } from '@owlmeans/route'
import { authMiddleware, DEFAULT_GUARD } from '@owlmeans/auth-common'
import { makeTokenCarrierGuard } from '@owlmeans/auth-token'
import { connect, connectProtocols, CONNECT_TOKEN_PREFIX } from '@owlmeans/viable-common'
import { SDK_SERVICE } from '../consts.js'
import { SdkAuthError, SdkMisconfigured } from '../errors.js'

/**
 * The platform's websocket namespace, which the connector's socket route is declared under.
 *
 * A literal because it belongs to manager-api: the contract package takes it as a parameter for
 * exactly this reason, so that neither end has to import the other's constants.
 */
const UPDATE_BASE = 'viable:manager-api:update:base'

export interface SdkContextOptions {
  apiUrl: string
  token: string
  /** The service alias the API is registered under. One deployment, one alias. */
  service?: string
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
  if (opts.token === '') {
    throw new SdkMisconfigured('token')
  }
  if (!opts.token.startsWith(CONNECT_TOKEN_PREFIX)) {
    // Refused here rather than at the first call: a value that is not one of this platform's
    // tokens produces a 401 with nothing in it about which of the several plausible mistakes was
    // made, and the answer is always the same one — that is not the token you were given.
    throw new SdkAuthError(`prefix:${CONNECT_TOKEN_PREFIX}`)
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
  }))
  context.registerMiddleware(authMiddleware)

  const surface = connectProtocols({
    guard: DEFAULT_GUARD,
    updateBase: UPDATE_BASE,
  })

  // The socket route hangs under the platform's own websocket base, so that base has to exist
  // here too — a parent a registry cannot resolve fails the whole context at init, not the one
  // call that would have used it. It is a declaration-only namespace, so its client binding has
  // no screen or request implementation.
  const parent = openProtocol(route(UPDATE_BASE, '/update'))
  const entrypoints = [bind(parent), ...protocols(surface).map(declaration => bind(declaration))]

  // Every caller gets a context-local client binding from the immutable protocol it shares with
  // the server. No alias lookup can drift from a path or contract declaration.
  context.registerEntrypoints(entrypoints)

  await context.configure().init()

  return context
}

export { connect }
