
export const DEFAULT_ALIAS = 'config'

export const PLUGIN_RECORD = 'plugins'

export const TRUSTED = 'trusted'

export const PLUGINS = 'plugins'

/**
 * The legal documents an OwlMeans application stands on until its operator supplies their own.
 *
 * They are defaults, not constants of the framework: an app that hosts its own terms overrides
 * them through {@link LoginTermsConfig}. Until it does, these are the documents that actually
 * govern — a preview served from an owlmeans.org hostname is operated by OwlMeans, whatever the
 * generated application claims to be.
 */
export const OWLMEANS_TERMS_URL = 'https://owlmeans.com/legal/terms'

export const OWLMEANS_PRIVACY_URL = 'https://owlmeans.com/legal/privacy'

export const OWLMEANS_COOKIES_URL = 'https://owlmeans.com/legal/cookies'
