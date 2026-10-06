
import type { AstroHelper, HeadScripts, HeadScriptsOptions } from './types.js'
import { googleTagHelper } from '@owlmeans/web-gtm'
import { consentLinkHelper, consentModeHelper } from '@owlmeans/consent'

/**
 * Astro-side wiring for the OwlMeans browser packages.
 *
 * Astro's model is HTML first and islands second, which is the opposite of every other consumer of
 * these packages — so the parts that have to run before hydration (the consent defaults, the tag
 * container) cannot come from a component at all. This package is where those become strings a
 * layout can stamp with `set:html`, plus the small conversions between Astro's vocabulary and this
 * framework's.
 *
 * Nothing here imports Astro. It would make the package unusable outside one, and everything it
 * needs is a value the caller already has.
 */
export const createAstroHelper = (): AstroHelper => {
  const owlHeadScripts = (opts?: HeadScriptsOptions): HeadScripts => ({
    ...(opts?.gtm != null
      ? { head: googleTagHelper.gtmHeadScript({ ...opts.consent, ...opts.gtm }), noscript: googleTagHelper.gtmNoscriptFrame(opts.gtm) }
      : { head: consentModeHelper.consentBootstrapScript(opts?.consent), noscript: '' }),
    adopt: consentLinkHelper.consentLinkerScript(opts?.consent ?? {}),
  })

  const isLegalPath = (pathname: string, segment = 'legal'): boolean =>
    new RegExp(`^/(?:[a-z]{2}/)?${segment}(?:/|$)`).test(pathname)

  const owlLocale = (currentLocale: string | undefined, fallback = 'en'): string =>
    currentLocale != null && currentLocale !== '' ? currentLocale : fallback

  return { owlHeadScripts, isLegalPath, owlLocale }
}

export const astroHelper = createAstroHelper()
