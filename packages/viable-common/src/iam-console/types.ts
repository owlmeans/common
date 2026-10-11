import type {
  IamDefaultClass, IamGrant, IamGrantMode, IamGroup, IamGroupBundle, IamGroupRef, IamMember, IamMemberInvite,
  IamMemberUpdate, IamOrganization, IamOrganizationUpdate, IamPermissionDefinition, IamUser, IamUserInvite,
  IamUserUpdate,
} from '@owlmeans/iam'
import type { WorkloadKind } from '../slot/consts.js'

/**
 * The owner console's IAM, per project — the contract both doors share: the browser's
 * `managerProtocols.back.iam` and the connector's `connect.iam`. Every route names its project, and
 * `scope` picks the preview (ephemeral, default) or the production OIDC client — two apps with two
 * sets of rows, definitions and groups. Organizations travel by `entitySlug` and groups by their key:
 * an organization's record id never appears on this wire, and neither does the owner's.
 */

/** The IAM vocabulary a consumer of this contract reads and writes, re-exported. */
export type {
  IamArea, IamGrant, IamGrantBundle, IamGroup, IamGroupBundle, IamGroupRef, IamMember, IamMemberInvite,
  IamMemberUpdate, IamOrganization, IamOrganizationUpdate, IamPermissionDefinition, IamPermissionFilter, IamUser,
  IamUserInvite, IamUserUpdate,
} from '@owlmeans/iam'

/** Route params for the project-scoped IAM management endpoints. */
export interface IamProjectParams {
  projectId: string
}

/** One subject of the project's client, by its pairwise `profileId`. */
export interface IamProjectUserParams extends IamProjectParams {
  profileId: string
}

/** One organization the project's client has members in. */
export interface IamOrganizationParams extends IamProjectParams {
  entitySlug: string
}

/** One member of an organization, as the project's client sees them. */
export interface IamMemberParams extends IamOrganizationParams {
  profileId: string
}

/** One group of (organization, the project's client), by its key. */
export interface IamGroupParams extends IamOrganizationParams {
  group: string
}

/**
 * Which of the project's two clients a write addresses. A route with a body carries it there; a
 * body-less write (the browser's removes) and every read take it in the query.
 */
export interface IamScoped {
  scope?: WorkloadKind
}

/**
 * A listing. `external` answers a backend that keeps this in a console of its own (keycloak): the
 * list is then empty on purpose, and a screen offers that console instead of reporting "none".
 */
export interface IamListResponse<T> {
  items: T[]
  external?: boolean
}

export interface IamUsersResponse extends IamListResponse<IamUser> {}

export interface IamGrantsResponse extends IamListResponse<IamGrant> {}

export interface IamOrganizationsResponse extends IamListResponse<IamOrganization> {}

export interface IamMembersResponse extends IamListResponse<IamMember> {}

export interface IamGroupsResponse extends IamListResponse<IamGroup> {}

/** Which organizations the client's subjects act in — its registration's two tenancy flags. */
export interface IamTenancy {
  operators: boolean
  users: boolean
}

export interface IamPermissionsResponse extends IamListResponse<IamPermissionDefinition> {
  tenancy: IamTenancy
}

/**
 * Query for listing grants: everything the client's subjects hold, one person's (`profileId`), or
 * one group's (`group`, the key, with the `entitySlug` of its organization). With a person, an
 * `entitySlug` alone narrows to the grants bound to that organization.
 */
export interface IamGrantsQuery extends IamScoped {
  profileId?: string
  group?: string
  entitySlug?: string
}

/**
 * Change a definition's settings: who holds it by default (`defaultClass`) and whether its grants
 * are bound to one organization (`entityScoped`). An omitted field is kept.
 */
export interface IamDefinitionUpdate extends IamScoped {
  permission: string
  defaultClass?: IamDefaultClass
  entityScoped?: boolean
}

/** Re-admit the owning organization's staff to the client `scope` names. */
export interface IamStaffSync extends IamScoped {}

/** How many staff rows the synchronization added and removed. */
export interface IamStaffSyncResponse {
  added: number
  removed: number
}

/**
 * Body to assign a permission grant — to exactly ONE subject: a person (`profileId`) or a group.
 *
 * A resource-scoped permission is grantable two ways under ONE name: with `resources`, bound to
 * those ids; without them, covering every resource. `mode` names which, because the two are stored
 * separately and a screen offering both controls has to be able to address each on its own.
 *
 * `entitySlug` binds a person's grant of an entity-scoped definition to that organization. A group
 * grant is always bound to the group's own organization, so it takes none.
 */
export interface IamAssignGrant extends IamScoped {
  profileId?: string
  group?: IamGroupRef
  permission: string
  resources?: string[]
  /** `blanket` (all resources) or `resources`. Inferred from `resources` when omitted. */
  mode?: IamGrantMode
  entitySlug?: string
}

/**
 * Body to revoke a grant, the same shape. With `resources` only those ids are removed; an omitted
 * `mode` means ALL forms, which is what a bare revoke has always meant — narrowing that default
 * would leave a resource-scoped grant standing after a revoke reported success.
 */
export interface IamRevokeGrant extends IamAssignGrant {}

export interface IamProjectUserInvite extends IamUserInvite, IamScoped {}

export interface IamProjectUserUpdate extends IamUserUpdate, IamScoped {}

export interface IamOrganizationEdit extends IamOrganizationUpdate, IamScoped {}

export interface IamProjectMemberInvite extends IamMemberInvite, IamScoped {}

export interface IamProjectMemberUpdate extends IamMemberUpdate, IamScoped {}

export interface IamGroupCreate extends IamScoped {
  key: string
  title?: string
}

/** A group's title and what it grants; an omitted field is kept. */
export interface IamGroupEdit extends IamScoped {
  title?: string
  bundles?: IamGroupBundle[]
}

export interface IamGroupMembersChange extends IamScoped {
  profileIds: string[]
}
