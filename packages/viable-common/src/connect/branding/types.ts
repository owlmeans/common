

/**
 * A project's branding as a connector reads it — what the generated application says about who
 * made it, and the Google tag it loads.
 *
 * Every field is a string, `''` when unset, in the platform's own branding vocabulary. The
 * platform credit is absent on purpose: hiding it is a paid capability behind its own gated route,
 * and neither reading nor saving this record may reach it.
 */
export interface ConnectProjectBranding {
  /** The copyright line in the application's footer. Never empty once saved. */
  copyright: string
  /** The organization's display name. Never empty once saved. */
  organizationName: string
  /** `''`, an `https://` URL, or a same-origin path such as `/terms` (the generated page). */
  termsUrl: string
  /** `''`, an `https://` URL, or a same-origin path such as `/privacy` (the generated page). */
  privacyUrl: string
  /** `''`, or a Google tag id: `GTM-…`, `G-…`, `GT-…`, `AW-…`, `DC-…`. */
  googleTag: string
}

/**
 * A PATCH of a project's branding: every field optional, and an absent field keeps its current
 * value. The platform merges it over what is stored, validates the result as a whole with the
 * rules the web form uses, and answers the merged record.
 */
export interface ConnectProjectBrandingSave extends Partial<ConnectProjectBranding> {}
