import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { frontend, route, RouteMethod } from '@owlmeans/route'
import { INTENT_API_PATH, INTENT_LANDING_PATH, intent } from './consts.js'
import { IntentPickupBodySchema, IntentStashBodySchema } from './schemas.js'
import type {
  IntentPickupBody, IntentPickupResult, IntentProtocolOptions, IntentStashBody, IntentStashResult,
} from './types.js'

/**
 * Declare the intent-first hand-off: two GUEST API routes and the landing screen's address.
 *
 * No guard and no gate anywhere on the API — the caller is a visitor who has no account yet — and
 * no `service` on any route: each consumer fills it in (the public site names the platform's
 * services in its own configuration; the manager binds them to its own).
 *
 * TODO(cors): these routes ride the framework's global `origin: '*'` CORS policy (no credentials).
 * If viable ever restricts allowed origins globally, this entrypoint must keep answering the public
 * site's origins — owlmeans.com, owlmeans.pl and, in dev/stage, `http://localhost:4321`.
 *
 * The landing screen is `sticky`, like the OAuth consent screens: it is an ordinary in-app screen
 * that a visitor arrives at directly from another origin.
 */
export const makeIntentProtocols = (opts: IntentProtocolOptions = {}) => {
  const base = openProtocol(route(intent.base, opts.path ?? INTENT_API_PATH))

  return {
    base,

    stash: protocol(
      route(intent.stash, '/', { parent: base, method: RouteMethod.POST }),
      contract.request({ body: typed<IntentStashBody>(IntentStashBodySchema) }, typed<IntentStashResult>()),
    ),

    pickup: protocol(
      route(intent.pickup, '/pickup', { parent: base, method: RouteMethod.POST }),
      contract.request({ body: typed<IntentPickupBody>(IntentPickupBodySchema) }, typed<IntentPickupResult>()),
    ),

    landing: openProtocol(route(intent.landing, opts.landing ?? INTENT_LANDING_PATH, frontend()), { sticky: true }),
  }
}

export type IntentProtocols = ReturnType<typeof makeIntentProtocols>
