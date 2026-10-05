import type { IamRuntimeGrant, IamRuntimeGrantQuery, IamRuntimeGrantRequest, IamRuntimeMember, IamRuntimeMemberInvite, IamRuntimeMemberUpdate, IamRuntimeOrganization, IamRuntimeOrganizationCreate, IamRuntimeOrganizationUpdate, IamRuntimePermission } from '@owlmeans/iam'

export interface IamGateOptions {
  /**
   * Refuse a resource-scoped param on the UMA2 fallback path instead of widening it to a
   * project-wide check.
   *
   * Off by default, and deliberately so. A Keycloak-backed deployment cannot hold a resource-scoped
   * grant at all — the adapter throws `IamUnsupported('resource-scoped-grant')` — so denying would
   * lock every user out of every scoped endpoint rather than tightening anything. Turn it on only
   * where the resulting refusals are the intended outcome.
   */
  strictResourceScope?: boolean
}

/**
 * The runtime IAM API as the signed-in subject of one request: its organizations, their members,
 * the grantable definitions and the grants. Every call acts as that subject — the provider decides
 * owner and member rights from the access token, never from anything sent here.
 */
export interface IamRuntimeClient {
  organizations: {
    list: () => Promise<IamRuntimeOrganization[]>
    /** The subject becomes the new organization's owner. */
    create: (body?: IamRuntimeOrganizationCreate) => Promise<IamRuntimeOrganization>
    update: (entitySlug: string, body: IamRuntimeOrganizationUpdate) => Promise<IamRuntimeOrganization>
  }
  members: {
    list: (entitySlug: string) => Promise<IamRuntimeMember[]>
    /** Find-or-create by e-mail: adding an address twice answers the same member. */
    add: (entitySlug: string, invite: IamRuntimeMemberInvite) => Promise<IamRuntimeMember>
    update: (entitySlug: string, profileId: string, update: IamRuntimeMemberUpdate) => Promise<IamRuntimeMember>
    remove: (entitySlug: string, profileId: string) => Promise<void>
  }
  permissions: {
    list: (entitySlug: string) => Promise<IamRuntimePermission[]>
  }
  grants: {
    list: (entitySlug: string, query?: IamRuntimeGrantQuery) => Promise<IamRuntimeGrant[]>
    assign: (entitySlug: string, grant: IamRuntimeGrantRequest) => Promise<IamRuntimeGrant>
    revoke: (entitySlug: string, grant: IamRuntimeGrantRequest) => Promise<void>
  }
}
