import type { OidcOrganizationItem } from '@owlmeans/oidc'

/** The organizations of the signed-in subject, and the move between them, from the browser's side. */
export interface OrganizationSwitchHelper {
  /**
   * The organizations of the signed-in subject, the one the session acts in marked `acting`.
   *
   * Answered by the application's own server from the session it holds — refreshed against the
   * provider by the guard first — so a person just removed from an organization no longer sees it.
   * A session of a client without the organizations scope has none. Needs the bindings of
   * `iamEntrypoints()`.
   */
  listOrganizations: () => Promise<OidcOrganizationItem[]>
  /**
   * Moves the session into another organization of its subject and adopts the re-signed token, so
   * every request after it — and every screen reading `auth` — acts in that organization.
   *
   * There is no per-request organization selector: the session, not the request, decides where a
   * request acts. An organization the subject is not in is refused (`ORGANIZATION_REFUSAL`) and the
   * current token stays.
   */
  switchOrganization: (entitySlug: string) => Promise<void>
}
