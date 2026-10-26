import type {
  IamAssignGrant, IamGrant, IamGrantsResponse, IamGroup, IamGroupsResponse, IamMember, IamMembersResponse,
  IamOrganization, IamOrganizationsResponse, IamPermissionDefinition, IamPermissionsResponse, IamRevokeGrant, IamUser,
  IamUsersResponse,
} from '@owlmeans/viable-common'

/**
 * How the generated app's sign-in tools check what they were asked and put the platform's answers
 * into words.
 */
export interface IamToolHelper {
  /**
   * What a tool's action still lacks, said as the refusal — or `null` when it may call. Checked
   * BEFORE any call, so a half-formed write never reaches the platform: an invite without an e-mail,
   * an update that changes nothing, a grant naming no subject or two, an assign with a revoke-only
   * mode (`all`, `inherit`), a group without its organization, a removal or a deletion the user has
   * not agreed to (`confirm: true`).
   */
  missing: (tool: string, args: Record<string, unknown>) => string | null
  /**
   * The grant body `manage_app_grant` sends, from its flat input: a person (`profileId`, with
   * `entitySlug` binding an entity-scoped grant to that organization) or a group (`group` key, its
   * organization's `entitySlug`) — never both. Call {@link missing} first.
   */
  grantBody: (args: Record<string, unknown>) => IamAssignGrant
  renderUsers: (response: IamUsersResponse, lead: string) => string
  renderUser: (user: IamUser) => string
  renderPermissions: (response: IamPermissionsResponse) => string
  renderDefinition: (definition: IamPermissionDefinition) => string
  /**
   * The grant rows, counted as held and restricted: a `restricted: true` entry is an inherited grant
   * the subject's own restriction withholds — listed, never held.
   */
  renderGrants: (response: IamGrantsResponse) => string
  /** One grant: subject, records, mode, binding, origin (`bundle` in a group's own listing), `restricted`. */
  renderGrant: (grant: IamGrant) => string
  /**
   * What a revoke did, by its mode: `inherit` took back the subject's own value; a records revoke
   * removed those ids; any other one revoked the permission and restricted a declared one.
   */
  renderRevoke: (body: IamRevokeGrant) => string
  renderOrganizations: (response: IamOrganizationsResponse) => string
  renderOrganization: (organization: IamOrganization) => string
  renderMembers: (response: IamMembersResponse, lead: string) => string
  renderMember: (member: IamMember) => string
  renderGroups: (response: IamGroupsResponse, entitySlug: string) => string
  renderGroup: (group: IamGroup) => string
}
