import type { Auth, PermissionSet } from '@owlmeans/auth'
import type { ResolvedEntity } from '@owlmeans/entrypoint'
import type { OidcOrganizationClaim, OidcOrganizationItem, OidcPermissionSetClaim } from '@owlmeans/oidc'
import type { OrganizationSelector } from '../types.js'

/** The provider's `organizations` claim, read into what a session acts in and what a token carries. */
export interface OidcOrganizationHelper {
  /**
   * Shape-validates an `organizations` claim.
   *
   * `undefined` means the provider did not answer with one at all — a client that never asked for
   * `ORGANIZATIONS_SCOPE` — and keeps the relying party on its pre-tenancy behaviour. An entry that
   * does not carry both names is dropped: one without a key could not be followed across a rename,
   * one without a slug could not be put on a token.
   */
  extractOrganizations: (claim: unknown) => OidcOrganizationClaim[] | undefined
  /**
   * The organization a session acts in.
   *
   * At sign-in (no `entityKey`) the requested slug wins when the subject belongs to it, then the
   * provider's home organization, then the first. A running session (`entityKey`) keeps exactly the
   * organization it acts in and gets `undefined` once the subject no longer belongs to it — never a
   * silent move into another one, which would change what every later request is authorized for.
   */
  pickOrganization: (
    orgs: OidcOrganizationClaim[], selector?: OrganizationSelector
  ) => OidcOrganizationClaim | undefined
  /**
   * The permission sets a browser token may carry for the acting organization.
   *
   * Unbound sets apply everywhere and are kept. A bound set is kept only for the acting organization,
   * and loses its `entitySlug` on the way: the token is already that organization's, and a set of
   * another organization must never reach a browser at all. With no acting organization every bound
   * set is dropped.
   */
  actingPermissionSets: (sets: OidcPermissionSetClaim[], entitySlug?: string) => PermissionSet[]
  /**
   * `user` as a browser token of a session acting in `org`: that organization's slug, its groups
   * and its flattened permission sets — and nothing left over from the organization acted in before.
   */
  actingAuth: <T extends Auth>(user: T, org: OidcOrganizationClaim, sets?: OidcPermissionSetClaim[]) => T
  /** The request entity of an organization the provider claims — keyed by its frozen IAM key. */
  resolvedEntityOf: (org: OidcOrganizationClaim) => ResolvedEntity
  /** The switch's view of an organization: everything but the key. */
  organizationItemOf: (org: OidcOrganizationClaim, acting?: string) => OidcOrganizationItem
}
