import type {
  MarketingConsentConfig, MarketingConsentDecision, MarketingConsentDefinition, MarketingConsentStatusOptions,
  MarketingConsentStatusView,
} from '../types.js'

/** An application's effective consent catalogue, and a person's decisions folded against it. */
export interface MarketingConsentHelper {
  /**
   * Build the effective consent catalogue for one application: the standard 8, narrowed and
   * reworded by `cfg.standard`, extended by `cfg.custom`, with `cfg.links` folded in.
   *
   * `key` and `group` are fixed identity — neither a standard override nor a custom entry moves a
   * consent between groups or renames it; only `resolveMarketingConsents` itself decides the group
   * a key lives under.
   */
  resolveMarketingConsents: (cfg?: MarketingConsentConfig) => MarketingConsentDefinition[]
  /**
   * Fold a person's saved decisions against a resolved catalogue into what a consent screen shows
   * and what should be treated as granted right now.
   *
   * Only the LATEST decision per key counts — `decisions` may carry a full history. A definition
   * with no saved decision is `'new'`; one whose saved `revisedAt`/`mode` no longer match the
   * definition is `'revised'` (the wording or the opt-in/opt-out shape changed under the person);
   * otherwise it is `'current'`.
   */
  consentStatus: (
    defs: MarketingConsentDefinition[], decisions: MarketingConsentDecision[], opts?: MarketingConsentStatusOptions,
  ) => MarketingConsentStatusView
}
