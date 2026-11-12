import type { AstroHelper, HeadScripts, HeadScriptsOptions } from './types.js'
import { consentLinkHelper, consentTrackingHelper } from '@owlmeans/consent'

/**
 * Astro-side wiring for the OwlMeans browser packages.
 *
 * Astro's model is HTML first and islands second, which is the opposite of every other consumer of
 * these packages — so the parts that have to run before hydration (the stored consent decision, a
 * tag loader with its signal defaults) cannot come from a component at all. This package is where
 * those become strings a layout can stamp with `set:html`, plus the small conversions between
 * Astro's vocabulary and this framework's.
 *
 * Nothing here imports Astro, and nothing here knows a tag vendor: a tag arrives already rendered
 * (`HeadTag`), built by its own package from the same consent options.
 */
export const createAstroHelper = (): AstroHelper => {
  const owlHeadScripts = (opts?: HeadScriptsOptions): HeadScripts => {
    const adopt = consentLinkHelper.consentLinkerScript(opts?.consent ?? {})
    if (opts?.tag == null) {
      return { head: consentTrackingHelper.consentBootstrapScript(opts?.consent), noscript: '', adopt }
    }

    return { head: opts.tag.head, noscript: opts.tag.noscript, adopt }
  }

  const isLegalPath = (pathname: string, segment = 'legal'): boolean =>
    new RegExp(`^/(?:[a-z]{2}/)?${segment}(?:/|$)`).test(pathname)

  const owlLocale = (currentLocale: string | undefined, fallback = 'en'): string =>
    currentLocale != null && currentLocale !== '' ? currentLocale : fallback

  return { owlHeadScripts, isLegalPath, owlLocale }
}

export const astroHelper = createAstroHelper()
