import type { BrandSettings, LoginCreditConfig } from '@owlmeans/config'

export interface ResolvedCredit {
  /** Whether "Powered by OwlMeans" is rendered. */
  poweredBy: boolean
  /** The product and organization line, already composed. Null when there is nothing to say. */
  line: string | null
}

/**
 * The years one notice covers.
 *
 * A range only while the first year is genuinely in the past — an app configured with the current
 * year, or with a year a skewed clock puts in the future, still gets a well-formed notice rather
 * than `© 2026–2026` or a range that runs backwards.
 */
const years = (since: number | undefined, now: number): string =>
  since != null && since > 0 && since < now ? `${since}–${now}` : `${now}`

/**
 * A configured value that was actually SET.
 *
 * Empty is how a build-time default spells "unset", and this config is filled from environment
 * variables a platform delivers — `BRANDING_ORGANIZATION: meta.brandingOrganization ?? ''` is the
 * shape of every one of them. `??` does not fall through an empty string, so an undelivered
 * organization used to win the fallback chain and compose a line ending in a bare dash.
 */
const set = (value?: string | null): string | null =>
  value != null && value.trim() !== '' ? value : null

/**
 * What the bottom of the sign-in screen says.
 *
 * It is a copyright notice, so it is composed as one: `© <year> <holder>`. That is the whole
 * reason `copyright` defaults to on — the name on its own reads as a caption, and an application
 * that means to assert a copyright would have had to write the mark and the year into a literal
 * `line` to get one.
 *
 * The organization falls back to its slug because an organization record carries no readable name
 * — so "no name" is the ordinary case, not an error, and a screen that rendered an empty line for
 * it would be worse than one that renders the slug.
 *
 * `line` replaces everything when an app supplies it: a product with its own legal wording should
 * not have to defeat a composition rule to use it.
 */
export const resolveCredit = (
  cfg?: LoginCreditConfig, brand?: BrandSettings, service?: string
): ResolvedCredit => {
  const poweredBy = cfg?.poweredBy ?? true
  const literal = set(cfg?.line)
  if (literal != null) {
    return { poweredBy, line: literal }
  }

  const product = set(cfg?.product) ?? set(brand?.name) ?? set(service)
  const organization = set(cfg?.organization) ?? set(brand?.organization)
    ?? set(cfg?.entity) ?? set(brand?.entity)

  // Whoever the notice names. A product with no organization behind it holds its own copyright,
  // which is why this falls through to the product rather than dropping the notice.
  const holder = set(cfg?.holder) ?? organization ?? product
  const wording = typeof cfg?.copyright === 'string' ? set(cfg.copyright) : null
  const notice = cfg?.copyright === false || holder == null
    ? organization
    : wording ?? `© ${years(cfg?.since, new Date().getFullYear())} ${holder}`

  // The product is named beside the notice only when it is not already the thing being claimed —
  // "OwlMeans — © 2026 OwlMeans" says the name twice and neither time usefully.
  return {
    poweredBy,
    line: product != null && notice != null && product !== holder
      ? `${product} — ${notice}`
      : notice ?? product,
  }
}
