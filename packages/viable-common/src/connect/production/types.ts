import type { ConnectSlotState } from '../slot/types.js'

/**
 * A project's production workload as a connector reads it: the published site, its address and the
 * custom domain attached to it, and the standalone sign-in configuration a self-hosted copy uses.
 *
 * Every status is a plain string, like a slot's: this view crosses a version skew, and a newer
 * platform may answer with a value an older connector has never heard of. No shape here can carry the
 * production sign-in's client secret — it is reported only as set or not.
 */

/**
 * The custom domain of a production site, with the two DNS records the owner creates at their DNS
 * provider: the traffic record (`customDomain` CNAME → `cnameTarget`) and the certificate's
 * domain-control delegation (`dcvName` CNAME → `dcvValue`). `status` is the collapsed view
 * (`none`, `pending`, `pending_validation`, `verified`, `linked`, `error`); `hostnameStatus` and
 * `sslStatus` are the provider's own states of the two records, each answered as it reported them.
 */
export interface ConnectProductionDomain {
  /** The site's own address, minted by the platform — it serves whether or not a domain is attached. */
  generatedHost: string
  customDomain?: string
  status: string
  verifiedAt?: string
  cnameTarget?: string
  dcvName?: string
  dcvValue?: string
  hostnameStatus?: string
  sslStatus?: string
  /** The provider's validation errors, verbatim, while the domain is in error. */
  message?: string
}

/**
 * The project's production workload — `null` before its first publish — and its domain (`null`
 * while it has none).
 */
export interface ConnectProductionStatus {
  workload: ConnectSlotState | null
  domain: ConnectProductionDomain | null
}

/** The custom domain to attach — a DNS host name the owner controls. */
export interface ConnectProductionDomainBody {
  domain: string
}

/**
 * The production sign-in configuration a self-hosted copy of the project is configured with: the
 * OIDC client, its issuer and the addresses it may return to. The client SECRET is never answered —
 * `secretSet` says whether one exists; the owner reads it in the web application.
 */
export interface ConnectProductionAuth {
  clientId: string
  issuerUrl: string
  secretSet: boolean
  /** The owner's own standalone redirect addresses — applied to the client on the next publish. */
  redirectUris: string[]
  generatedHost: string
  customDomain?: string
}

/** Replace the owner's standalone redirect addresses — the whole list. */
export interface ConnectProductionRedirectsBody {
  redirects: string[]
}

/** The list as stored: trimmed, without blanks, each address once. */
export interface ConnectProductionRedirects {
  redirectUris: string[]
}
