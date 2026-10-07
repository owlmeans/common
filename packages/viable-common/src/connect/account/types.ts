/**
 * The organization's branding defaults: the name and copyright line every new project starts with.
 * A project keeps its own copy after creation; `copyDefaults` replaces a project's two values with
 * these again.
 */
export interface ConnectOrganizationBranding {
  organizationName: string
  copyright: string
}

/** A PATCH of the organization's defaults; a field left out keeps its value. Neither may be empty. */
export interface ConnectOrganizationBrandingSave extends Partial<ConnectOrganizationBranding> {}

/** What a backfill did: how many projects had blank branding rows filled from the defaults. */
export interface ConnectBrandingBackfill {
  projects: number
}

/**
 * One of the person's access tokens, as a connector sees it — never the secret, never its hash, and
 * no record ids of the organization or the person: the token is the caller's own by construction.
 */
export interface ConnectAccessToken {
  id: string
  /** What the owner called it. */
  name: string
  /** The prefix and the first characters of the secret — useless as a credential. */
  display: string
  scopes: string[]
  createdAt: string
  lastUsedAt?: string
  expiresAt?: string
  /** Set once a token is revoked; a revoked token stays listed so its name still resolves. */
  revokedAt?: string
  /** Issued through a browser sign-in (an OAuth grant) for one resource, rather than minted by hand. */
  oauth: boolean
}

export interface ConnectAccessTokenList {
  items: ConnectAccessToken[]
}

/** The token a revoke names — one of the caller's own. */
export interface ConnectAccessTokenParams {
  id: string
}

/** What a revoke answers: the id it revoked. Revoking twice is what a retry looks like. */
export interface ConnectAccessTokenRevoked {
  id: string
}

/** Whether a consent was ever answered at its current wording. */
export type ConnectPrivacyStatus = 'new' | 'revised' | 'current'

/** One marketing consent of the person, as the "Privacy choices" settings show it. */
export interface ConnectPrivacyChoice {
  /** The consent's key — `marketing.email`, `data.profiling`, … */
  key: string
  group: string
  mode: 'opt-in' | 'opt-out'
  /**
   * The person's SAVED, current answer — `false` for anything never answered at this wording,
   * whatever the settings screen's opt-out display default says.
   */
  granted: boolean
  status: ConnectPrivacyStatus
  /** When the saved answer was given, if there is one. */
  decidedAt?: string
}

export interface ConnectPrivacyChoices {
  /** A consent still waits for the person's first or revised answer. */
  pending: boolean
  items: ConnectPrivacyChoice[]
}

/** The consents to withdraw — each written `granted: false`; nothing here can grant one. */
export interface ConnectPrivacyWithdrawBody {
  keys: string[]
}

/** The reference of a stashed prompt — the `ref` of the `/start?ref=…` address the public site opened. */
export interface ConnectIntentPickupBody {
  ref: string
}

/** The prompt a visitor typed on the public site. Collected once: the reference is spent. */
export interface ConnectIntentPickup {
  prompt: string
}
