import type { IamDefaultClass, IamGrantMode, IamGrantOrigin } from '../consts.js'

/** One organization of the calling subject. */
export interface IamRuntimeOrganization {
  entitySlug: string
  title?: string
  owner: boolean
  groups?: string[]
  home?: boolean
}

export interface IamRuntimeOrganizationList {
  items: IamRuntimeOrganization[]
}

export interface IamRuntimeOrganizationCreate {
  title?: string
}

export interface IamRuntimeOrganizationUpdate {
  title: string
}

export interface IamRuntimeOrganizationParams {
  entitySlug: string
}

export interface IamRuntimeMember {
  profileId: string
  email?: string
  name?: string
  owner: boolean
  groups: string[]
  managed?: boolean
}

export interface IamRuntimeMemberList {
  items: IamRuntimeMember[]
}

/** Find-or-create by e-mail; adding someone twice answers the same member. */
export interface IamRuntimeMemberInvite {
  email: string
  name?: string
  owner?: boolean
}

export interface IamRuntimeMemberUpdate {
  owner?: boolean
  groups?: string[]
}

export interface IamRuntimeMemberParams {
  entitySlug: string
  profileId: string
}

/** A definition of the calling client that can be granted in an organization. */
export interface IamRuntimePermission {
  name: string
  title?: string
  area?: string
  resourceScoped?: boolean
  managed?: boolean
  defaultClass?: IamDefaultClass
}

export interface IamRuntimePermissionList {
  items: IamRuntimePermission[]
}

/** A grant of a member in the organization; `through` names the group a `Group`-origin one comes from. */
export interface IamRuntimeGrant {
  profileId: string
  permission: string
  resources?: string[]
  mode?: IamGrantMode
  origin?: IamGrantOrigin
  through?: string
}

export interface IamRuntimeGrantList {
  items: IamRuntimeGrant[]
}

export interface IamRuntimeGrantQuery {
  profileId?: string
}

/** Grant or revoke. The binding is the path's organization — the body cannot name another. */
export interface IamRuntimeGrantRequest {
  profileId: string
  permission: string
  resources?: string[]
  mode?: IamGrantMode
}

export interface IamRuntimeAck {
  ok: boolean
}

export interface IamRuntimeProtocolOptions {
  /** The service alias that serves the API — every route, the base included, is pinned to it. */
  service: string
  /** The base path under that service. Defaults to `IAM_RUNTIME_PATH`. */
  path?: string
}
