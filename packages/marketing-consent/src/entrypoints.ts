import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { frontend, route, RouteMethod } from '@owlmeans/route'
import {
  MARKETING_CONSENT_API_PATH, MARKETING_CONSENT_BASE, MARKETING_CONSENT_SAVE,
  MARKETING_CONSENT_SCREEN, MARKETING_CONSENT_SCREEN_PATH, MARKETING_CONSENT_STATUS,
  MARKETING_CONSENT_TERMS,
} from './consts.js'
import { SaveMarketingConsentSchema, TermsAcceptanceSchema } from './schemas.js'
import type {
  MarketingConsentEntrypointOptions, MarketingConsentEntrypoints, MarketingConsentStatusView,
  SaveMarketingConsentRequest, TermsAcceptance,
} from './types.js'

/**
 * The guarded marketing-consent surface: read the current status, save decisions, record a
 * terms acceptance — plus the top-level screen that hosts them.
 *
 * A base with a `parent` inherits that parent's guards and gate, the same as every other nested
 * route. A base with no `parent` MUST carry `opts.guards` itself — status/save/terms always act
 * on the caller's own saved decisions, so there is no ungated shape; neither given is a
 * declaration error, not a runtime one, because it means the application forgot to mount this
 * tree at all.
 */
export const makeMarketingConsentProtocols = (opts: MarketingConsentEntrypointOptions = {}): MarketingConsentEntrypoints => {
  const path = opts.path ?? MARKETING_CONSENT_API_PATH

  if (opts.parent == null && opts.guards == null) {
    throw new SyntaxError('marketing-consent: guarded routes need either a parent or explicit guards')
  }

  const base = opts.parent != null
    ? openProtocol(route(MARKETING_CONSENT_BASE, path, { parent: opts.parent }))
    : openProtocol(route(MARKETING_CONSENT_BASE, path), {
        guards: opts.guards,
        ...(opts.gate != null ? { gate: opts.gate } : {}),
      })

  return {
    base,
    status: protocol(
      route(MARKETING_CONSENT_STATUS, '/status', { parent: MARKETING_CONSENT_BASE, method: RouteMethod.GET }),
      contract(typed<MarketingConsentStatusView>())
    ),
    save: protocol(
      route(MARKETING_CONSENT_SAVE, '/save', { parent: MARKETING_CONSENT_BASE, method: RouteMethod.POST }),
      contract.request(
        { body: typed<SaveMarketingConsentRequest>(SaveMarketingConsentSchema) },
        typed<{ ok: boolean, status: MarketingConsentStatusView }>()
      )
    ),
    terms: protocol(
      route(MARKETING_CONSENT_TERMS, '/terms', { parent: MARKETING_CONSENT_BASE, method: RouteMethod.POST }),
      contract.request(
        { body: typed<TermsAcceptance>(TermsAcceptanceSchema) },
        typed<{ ok: boolean }>()
      )
    ),
    // A top-level frontend screen, no parent, `sticky` so the router keeps it regardless of
    // `cfg.service` filtering — the same shape as `@owlmeans/oauth`'s three consent screens.
    screen: openProtocol(
      route(MARKETING_CONSENT_SCREEN, opts.screen?.path ?? MARKETING_CONSENT_SCREEN_PATH, frontend({ parent: opts.screen?.parent })),
      { sticky: true }
    ),
  }
}
