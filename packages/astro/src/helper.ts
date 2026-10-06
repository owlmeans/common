import type { AstroHelper, HeadScripts, HeadScriptsOptions } from './types.js'
import { INVALID_TAG_ID_MESSAGE } from './consts.js'
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
  const owlHeadScripts = (opts?: HeadScriptsOptions): HeadScripts => {
    const adopt = consentLinkHelper.consentLinkerScript(opts?.consent ?? {})
    if (opts?.gtm == null) {
      return { head: consentModeHelper.consentBootstrapScript(opts?.consent), noscript: '', adopt }
    }

    const tag = { ...opts.consent, ...opts.gtm }
    // A page that quietly lost its tag is invisible until the coverage report says so — fail the
    // build instead, where the person who mistyped the id is looking.
    if (!googleTagHelper.isGoogleTagId(tag.id)) {
      throw new Error(`${INVALID_TAG_ID_MESSAGE}: ${JSON.stringify(tag.id)}`)
    }

    return {
      head: googleTagHelper.googleTagHeadScript(tag),
      // Only a Tag Manager container has a `ns.html` frame; gtag.js ids have no no-script form.
      noscript: googleTagHelper.googleTagKind(tag.id) === 'gtm' ? googleTagHelper.gtmNoscriptFrame(tag) : '',
      adopt,
    }
  }

  const isLegalPath = (pathname: string, segment = 'legal'): boolean =>
    new RegExp(`^/(?:[a-z]{2}/)?${segment}(?:/|$)`).test(pathname)

  const owlLocale = (currentLocale: string | undefined, fallback = 'en'): string =>
    currentLocale != null && currentLocale !== '' ? currentLocale : fallback

  return { owlHeadScripts, isLegalPath, owlLocale }
}

export const astroHelper = createAstroHelper()
