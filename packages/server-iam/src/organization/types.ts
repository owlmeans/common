import type { ResolvedEntity } from '@owlmeans/entrypoint'
import type { OIDCAuthCache } from '@owlmeans/server-oidc-rp'

/** The organizations of one request's subject, read from its session — built once per handler. */
export interface OrganizationScope {
  /** The session record behind the request's wrapped token — the guard has already refreshed it. */
  sessionOf: () => Promise<OIDCAuthCache>
  /**
   * Every organization of the request's subject, as request entities keyed by their frozen IAM key.
   *
   * The session record is the authority — the provider's last claim, re-read on every validation —
   * never the browser: a relying party of a tenanted client has no organization registry of its own.
   */
  organizationsOf: () => Promise<ResolvedEntity[]>
  /**
   * One organization of the request's subject by its slug — for a handler that acts in an
   * organization the URL names rather than in the session's acting one. One the subject is not in is
   * refused as `AuthForbidden(ORGANIZATION_REFUSAL)`, exactly as the switch refuses it.
   */
  organizationOf: (entitySlug: string) => Promise<ResolvedEntity>
}
