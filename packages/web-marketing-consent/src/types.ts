import type { MarketingConsentConfig, MarketingConsentEntrypoints, MarketingConsentStatusView, SaveMarketingConsentRequest, TermsAcceptance } from '@owlmeans/marketing-consent'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import type { LazyService } from '@owlmeans/context'

export type MarketingConsentBulkSelection = 'all' | 'required'

export interface MarketingConsentAppendOptions {
  /** From `makeMarketingConsentProtocols(...)` — the app builds this once and shares it between
   * this call and its own server-side `serveMarketingConsentEntrypoints`/`bindAll` wiring. */
  protocols: MarketingConsentEntrypoints
  /**
   * Accepted for API symmetry with the server side (`appendMarketingConsentService({ config })`),
   * but not read here: `resolveMarketingConsents` only ever runs where the catalogue is actually
   * enumerated — the server. This package's own UI reads the ALREADY-RESOLVED definitions back off
   * `MarketingConsentStatusItem.definition` and never re-resolves the catalogue client-side.
   */
  config?: MarketingConsentConfig
  /** Register the post-sign-in step. Default `true`. */
  step?: boolean
  /**
   * `true` (default): the sign-in screen keeps its own Terms checkbox, and this option only
   * decides whether `termsRecorder` copies a LOCAL acceptance to the server once landed.
   * `false`: no terms recording at all — an application that does not use
   * `@owlmeans/client-auth`'s terms confirmation.
   * `'step'`: the Terms confirmation moves OFF the sign-in screen onto THIS package's own
   * post-sign-in step instead — the checkbox, its recording and the version check all happen
   * there (`termsDeferred`, `@owlmeans/client-auth/login`). Requires `step !== false`; with
   * `step: false` there is no step left to confirm on, so this falls back to `true`.
   */
  terms?: boolean | 'step'
  /** Entrypoint alias of a host's own "Privacy choices" settings screen, for
   * `MarketingConsentClientService.preferences()`. */
  preferences?: string
  /** Default `all`. `required` limits the bulk control to the Terms confirmation and never
   * selects or withdraws an optional purpose; settings then offers individual choices only. */
  bulkSelection?: MarketingConsentBulkSelection
  locale?: string
}

export type MarketingConsentClientContext = ClientContext<ClientConfig>

export interface MarketingConsentClientService extends LazyService {
  /** Optional for hosts supplying an older/custom client; omitted means `all`. */
  readonly bulkSelection?: MarketingConsentBulkSelection
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
  /** The entrypoint alias of the "Privacy choices" settings screen, when one was configured. */
  preferences: () => string | undefined
}

export interface MakeMarketingConsentClientOptions {
  alias?: string
  preferences?: string
  bulkSelection?: MarketingConsentBulkSelection
}

export interface MarketingConsentStepOptions {
  /**
   * The Terms confirmation lives on THIS step instead of the sign-in screen — `LoginStep` is
   * declared `confirmsTerms`/`required`, and `pending` also becomes true whenever the server's
   * recorded terms version does not match the resolved configuration (or the status could not be
   * read at all — a broken read must show the step, never wave a Terms confirmation through).
   */
  confirmsTerms?: boolean
}
