import type { AppType, BasicConfig, CONFIG_RECORD, ConfigRecord } from '@owlmeans/context'
import type { Resource, DbConfig } from '@owlmeans/resource'
import type { Profile } from '@owlmeans/auth'
import type { PLUGIN_RECORD } from './consts.js'
import type { BasicRoute, CommonRoute, RouteProtocols } from '@owlmeans/route'

export interface ConfigResource<T extends ConfigRecord = ConfigRecord> extends Resource<T> {
}

export interface CommonConfig extends BasicConfig {
  dbs?: DbConfig[]
  trusted: Profile[]
  [CONFIG_RECORD]: ConfigRecord[]
  [PLUGIN_RECORD]?: PluginConfig[]
  debug: BasicConfig["debug"] & {
    i18n?: boolean
  }
  security?: SecurityConfig
  // @TODO Move to brand settings
  defaultEntityId?: string
  brand: BrandSettings
}

export interface BrandSettings {
  home?: string
  /** The product's own name, as a person reads it. Falls back to the service alias. */
  name?: string
  /** The organization the product belongs to, as a person reads it. */
  organization?: string
  /**
   * The organization's slug — what {@link BrandSettings.organization} falls back to.
   *
   * An organization record carries a slug and nothing else readable, so an app that has not been
   * told a trade name has only this. Naming both keeps the fallback in the data rather than in
   * every component that renders a credit.
   */
  entity?: string
}

export interface PluginConfig extends ConfigRecord {
  type?: AppType
  value?: string
}

export interface ConfigResourceAppend {
  getConfigResource: <T extends ConfigRecord, R extends ConfigResource<T>>(alias?: string) => R
}

export interface SecurityConfig {
  unsecure?: boolean
  auth?: AuthSecurityConfig
}

export interface AuthSecurityConfig {
  flow?: string
  enter?: string
  /** What the sign-in screen offers, and what it requires before it offers it. */
  login?: LoginScreenConfig
}

export interface LoginScreenConfig {
  /**
   * `false` restores the pre-chooser behaviour wholesale — the dispatcher starts the default
   * identity provider on its own. An escape hatch for an app that cannot show a screen; not a
   * thing to reach for.
   */
  enabled?: boolean
  /** Ordered allow-list of method ids. Absent means every offered method, by its own order. */
  methods?: (string | LoginMethodConfig)[]
  /** Per-method overrides keyed by id, merged over what the registry declared. */
  overrides?: Record<string, LoginMethodConfig>
  /**
   * The secret-key (PK supervisor) method.
   *
   * Defaults to `cfg.debug.supervisor === true` — deliberately NOT `debug.all`, which a generated
   * application sets for itself and which would therefore hand every generated app an operator
   * login it never asked for.
   */
  secretKey?: boolean
  /**
   * Start the only method automatically when exactly one is offered.
   *
   * Defaults to `false`, and is suppressed anyway while terms are unconfirmed or the document is
   * embedded — a flow that has to open a window cannot start without a gesture, and a
   * confirmation nobody gave is not a confirmation.
   */
  autoSelectSingle?: boolean
  terms?: LoginTermsConfig
  credit?: LoginCreditConfig
  title?: string
  subtitle?: string
}

export interface LoginMethodConfig {
  id?: string
  label?: string
  i18nKey?: string
  icon?: string
  order?: number
  hidden?: boolean
  enabled?: boolean
  emphasis?: LoginMethodEmphasis
  params?: Record<string, string>
}

export type LoginMethodEmphasis = 'primary' | 'secondary' | 'link'

export interface LoginTermsConfig {
  /** Default true. */
  required?: boolean
  terms?: string
  privacy?: string
  /** Rendered only when set. */
  cookies?: string
  /** Bump to force re-acceptance. Defaults to a digest of the resolved URLs. */
  version?: string
}

export interface LoginCreditConfig {
  /** Default true. */
  poweredBy?: boolean
  product?: string
  organization?: string
  /** The slug `organization` falls back to. */
  entity?: string
  /** A literal line, replacing everything composed above. */
  line?: string
  /**
   * The copyright notice.
   *
   * `true` — the default — composes `© <year> <holder>`, because a footer that prints an owner's
   * name and nothing else is a label, not a notice: the mark and the year are the two things that
   * make it one. A string is used verbatim, for an owner whose own wording was drafted for them.
   * `false` prints the bare name, which is what this line used to be.
   */
  copyright?: boolean | string
  /** Who holds it. Defaults to the organization, and then to the product. */
  holder?: string
  /**
   * The year of first publication.
   *
   * Renders a range (`© 2019–2026`) while it is in the past, because a notice covers every year
   * the work was published in and not only the current one.
   */
  since?: number
}

export interface SecurityHelper {
  makeUrl: (route: BasicRoute | CommonRoute, path?: string | SecurityHelperUrlParams, params?: SecurityHelperUrlParams) => string
  url: (path?: string, params?: SecurityHelperUrlParams) => string
}

export interface SecurityHelperUrlParams {
  path?: string
  forceUnsecure?: boolean
  protocol?: RouteProtocols
  host?: string
  base?: string | boolean
}
