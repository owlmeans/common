import { createLazyService } from '@owlmeans/context'
import type { LazyService } from '@owlmeans/context'
import { DEFAULT_ALIAS as AUTH_SERVICE } from '@owlmeans/client-auth'
import type { AuthService } from '@owlmeans/auth-common'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import type {
  MarketingConsentBridge, MarketingConsentEntrypoints, MarketingConsentStatusView,
  SaveMarketingConsentRequest, TermsAcceptance,
} from '@owlmeans/marketing-consent'
import { MARKETING_CONSENT_CLIENT_SERVICE } from './consts.js'

export type MarketingConsentClientContext = ClientContext<ClientConfig>

export interface MarketingConsentClientService extends LazyService {
  /**
   * The current status, or `null` on any fetch failure (or while signed out — this service NEVER
   * calls the API while signed out). `opts.fresh` forces a network round trip; without it, an
   * already-cached {@link MarketingConsentClientService.last} is returned instead of refetching, so
   * a host that only wants a quick paint (a footer link, say) is not forced to wait on the network.
   */
  status: (opts?: { fresh?: boolean }) => Promise<MarketingConsentStatusView | null>
  /** `null` on any failure — fail OPEN, never throws into the caller. */
  save: (request: SaveMarketingConsentRequest) => Promise<MarketingConsentStatusView | null>
  /** `true` on success, `false` on any failure — fail OPEN, never throws into the caller. */
  recordTerms: (acceptance: TermsAcceptance) => Promise<boolean>
  /** The most recent successful `status`/`save` result, cached in memory. */
  last: () => MarketingConsentStatusView | null
  bridges: () => MarketingConsentBridge[]
  /** The entrypoint alias of the "Privacy choices" settings screen, when one was configured. */
  preferences: () => string | undefined
}

export interface MakeMarketingConsentClientOptions {
  alias?: string
  bridges?: MarketingConsentBridge[]
  preferences?: string
}

/**
 * Build the browser-side `MarketingConsentClientService`.
 *
 * FAIL OPEN everywhere: a broken consent read/write must never block sign-in or break the app.
 * Every network call first checks `AuthService.authenticated()` — this service never calls the API
 * while signed out — and any thrown/rejected call is swallowed, returning `null`/`false` instead.
 */
export const makeMarketingConsentClient = (
  protocols: MarketingConsentEntrypoints, opts: MakeMarketingConsentClientOptions = {},
): MarketingConsentClientService => {
  const alias = opts.alias ?? MARKETING_CONSENT_CLIENT_SERVICE
  const bridges = opts.bridges ?? []

  let lastView: MarketingConsentStatusView | null = null

  const ctx = (): MarketingConsentClientContext =>
    service.assertCtx<ClientConfig, MarketingConsentClientContext>(alias)

  const signedIn = async (): Promise<boolean> => {
    try {
      const token = await ctx().service<AuthService>(AUTH_SERVICE).authenticated()

      return token != null && token !== ''
    } catch {
      return false
    }
  }

  const service: MarketingConsentClientService = createLazyService<MarketingConsentClientService>(alias, {
    status: async statusOpts => {
      if (!(await signedIn())) {
        return null
      }
      if (statusOpts?.fresh !== true && lastView != null) {
        return lastView
      }
      try {
        const view = await ctx().entrypoint(protocols.status).call({})
        lastView = view

        return view
      } catch {
        return null
      }
    },

    save: async request => {
      if (!(await signedIn())) {
        return null
      }
      try {
        const result = await ctx().entrypoint(protocols.save).call({ body: request })
        lastView = result.status

        return result.status
      } catch {
        return null
      }
    },

    recordTerms: async acceptance => {
      if (!(await signedIn())) {
        return false
      }
      try {
        await ctx().entrypoint(protocols.terms).call({ body: acceptance })

        return true
      } catch {
        return false
      }
    },

    last: () => lastView,

    bridges: () => bridges,

    preferences: () => opts.preferences,
  })

  return service
}

/** Register the client service, unless the application already registered its own under this alias. */
export const appendMarketingConsentClient = (
  context: MarketingConsentClientContext, protocols: MarketingConsentEntrypoints,
  opts: MakeMarketingConsentClientOptions = {},
): void => {
  const alias = opts.alias ?? MARKETING_CONSENT_CLIENT_SERVICE
  if (!context.hasService(alias)) {
    context.registerService(makeMarketingConsentClient(protocols, opts))
  }
}
