import type { EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import type { RouteParent } from '@owlmeans/route'

export type MarketingConsentMode = 'opt-in' | 'opt-out'

/**
 * Where a decision was made — carried on every saved `MarketingConsentDecision`.
 *
 * `'cookie'` is HISTORICAL: rows written while a device's cookie decisions could seed an account
 * still carry it, and an append-only ledger must stay readable, so the value is kept in the stored
 * shapes. Nothing writes it any more and a save request cannot carry it
 * (`SaveMarketingConsentRequest.source`).
 */
export type MarketingConsentSource = 'sign-in' | 'settings' | 'cookie' | 'api'

export interface MarketingConsentLink {
  href: string
  labelKey?: string
  label?: Record<string, string>
}

/** One consent this application may ask for, standard or custom. */
export interface MarketingConsentDefinition {
  key: string
  group: string
  mode: MarketingConsentMode
  enabled: boolean
  /** The wording revision this definition was last worded at (`STANDARD_REVISION`, or the
   * application's own stamp for a `custom` entry). A saved decision whose `revisedAt` differs is
   * re-asked (`consentStatus`'s `'revised'` status). */
  revisedAt: string
  /**
   * The statement a person agrees to, and its detail — an i18n key in this domain's resource
   * (`labelKey`/`descriptionKey`) or, for a custom entry with no key, per-language text
   * (`label`/`description`, language code → text, `en` as the fallback). Either may carry the
   * placeholders `{{link}}`, `{{link2}}`, … — the definition's `links` in order, drawn inline
   * where the placeholder stands.
   */
  labelKey?: string
  descriptionKey?: string
  label?: Record<string, string>
  description?: Record<string, string>
  links?: MarketingConsentLink[]
  /** An opt-out consent defaults to denied — never granted — when Global Privacy Control is set. */
  honorGpc?: boolean
  order?: number
}

/** An application's overrides over the standard catalogue, plus its own custom consents. */
export interface MarketingConsentConfig {
  enabled?: boolean
  step?: boolean
  revisedAt?: string
  /** Per standard key: `false` drops it, a partial object merges over it. `key`/`group` never
   * change through an override. */
  standard?: Record<string, false | Partial<Omit<MarketingConsentDefinition, 'key'>>>
  custom?: Array<Partial<MarketingConsentDefinition> & Pick<MarketingConsentDefinition, 'key' | 'group'>>
  links?: Record<string, MarketingConsentLink[]>
}

export interface WithMarketingConsentConfig {
  marketingConsent?: MarketingConsentConfig
}

export interface MarketingConsentDecision {
  key: string
  granted: boolean
  revisedAt: string
  mode: MarketingConsentMode
  decidedAt: string
  source: MarketingConsentSource
}

export interface MarketingConsentStatusItem {
  definition: MarketingConsentDefinition
  status: 'new' | 'revised' | 'current'
  granted: boolean
  updated: boolean
  saved?: MarketingConsentDecision
}

export interface MarketingConsentStatusView {
  pending: boolean
  items: MarketingConsentStatusItem[]
  terms?: { version: string, acceptedAt: string }
}

export interface TermsDocumentRef {
  key: string
  href: string
  revisedAt?: string
}

export interface TermsAcceptance {
  documents: TermsDocumentRef[]
  notices?: TermsDocumentRef[]
  version: string
  locale?: string
}

export interface SaveMarketingConsentRequest {
  decisions: Array<{ key: string, granted: boolean }>
  source: Exclude<MarketingConsentSource, 'api' | 'cookie'>
  locale?: string
  gpc?: boolean
}

// --- Protocol tree ---------------------------------------------------------------------------

/**
 * `parent` and `guards`/`gate` are exclusive: a base mounted under a `parent` inherits that
 * parent's guards and gate, the same as every other nested route; a base with no `parent` MUST
 * carry `guards` (and may add a `gate`) itself, because a marketing-consent status/save surface
 * always needs the caller's own session — there is no ungated shape.
 */
export interface MarketingConsentEntrypointOptions {
  alias?: string
  path?: string
  parent?: RouteParent
  guards?: string | readonly string[]
  gate?: { alias: string, params?: string | readonly string[] }
  screen?: { alias?: string, path?: string, parent?: RouteParent }
}

export interface MarketingConsentEntrypoints {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  status: EntrypointProtocol<{}, MarketingConsentStatusView>
  save: EntrypointProtocol<{ body: SaveMarketingConsentRequest }, { ok: boolean, status: MarketingConsentStatusView }>
  terms: EntrypointProtocol<{ body: TermsAcceptance }, { ok: boolean }>
  screen: EntrypointProtocol<OpenRequest, OpenValue>
}

// --- The client-side polling / status contract -----------------------------------------------

export interface MarketingConsentStatusOptions {
  gpc?: boolean
  termsAcceptedAt?: string
  termsVersion?: string
}
