

/**
 * A project's branding as a connector reads it — what the generated application says about who
 * made it, and the Google tag it loads.
 *
 * Every text field is a string, `''` when unset, in the platform's own branding vocabulary. The
 * platform credit is READ-ONLY here: hiding it is a paid capability behind its own gated route
 * (`branding.credit`), and saving this record never reaches it.
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
  /** The platform credit as it stands — absent from a platform that predates it on this view. */
  credit?: ConnectBrandingCredit
}

/**
 * The platform credit ("Built with OwlMeans"): what the owner asked for and what is delivered, which
 * differ while the plan does not include hiding it — the request survives a lapsed plan and takes
 * effect again on its own once the plan includes it.
 */
export interface ConnectBrandingCredit {
  /** The delivered value: the credit is hidden in the application. */
  hidden: boolean
  /** The owner asked to hide it. */
  requested: boolean
  /** The organization's plan includes hiding it (white label). */
  entitled: boolean
}

/** The editable text settings — every field of the view but the read-only credit. */
export interface ConnectProjectBrandingFields extends Omit<ConnectProjectBranding, 'credit'> {}

/**
 * A PATCH of a project's branding: every field optional, and an absent field keeps its current
 * value. The platform merges it over what is stored, validates the result as a whole with the
 * rules the web form uses, and answers the merged record.
 */
export interface ConnectProjectBrandingSave extends Partial<ConnectProjectBrandingFields> {}

/** Hide (`true`) or show (`false`) the platform credit. */
export interface ConnectBrandingCreditBody {
  hideCredit: boolean
}
