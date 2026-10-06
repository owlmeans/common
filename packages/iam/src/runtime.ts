import { contract, openProtocol, protocol, typed, type EntrypointProtocol, type OpenRequest, type OpenValue } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { IAM_RUNTIME_GUARD, IAM_RUNTIME_PATH, IAM_RUNTIME_ROUTES, IamRuntimeAckSchema, IamRuntimeGrantQuerySchema, IamRuntimeMemberInviteSchema, IamRuntimeMemberParamsSchema, IamRuntimeOrganizationCreateSchema, IamRuntimeOrganizationParamsSchema, IamRuntimeOrganizationUpdateSchema } from './consts.js'
import { aliases } from './consts.local.js'
import type { IamRuntimeAck, IamRuntimeGrant, IamRuntimeGrantList, IamRuntimeGrantQuery, IamRuntimeGrantRequest, IamRuntimeMember, IamRuntimeMemberInvite, IamRuntimeMemberList, IamRuntimeMemberParams, IamRuntimeMemberUpdate, IamRuntimeOrganization, IamRuntimeOrganizationCreate, IamRuntimeOrganizationList, IamRuntimeOrganizationParams, IamRuntimeOrganizationUpdate, IamRuntimePermissionList, IamRuntimeProtocolOptions } from './runtime/types.js'
import { IamRuntimeOrganizationSchema, IamRuntimeOrganizationListSchema, IamRuntimeMemberSchema, IamRuntimeMemberListSchema, IamRuntimeMemberUpdateSchema, IamRuntimePermissionListSchema, IamRuntimeGrantSchema, IamRuntimeGrantListSchema, IamRuntimeGrantRequestSchema } from './schemas.js'

// ---------------------------------------------------------------------------------------------
// Schemas — closed throughout: the server's AJV strips an undeclared key silently, so a field a
// caller sends and the schema omits would vanish without an error.
// ---------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------
// The protocol tree
// ---------------------------------------------------------------------------------------------

// Kept as a type: the inferred shape of the declareRuntime protocol tree, so it cannot leave this file.
export type IamRuntimeProtocols = ReturnType<typeof declareRuntime>

const declareRuntime = (opts: IamRuntimeProtocolOptions) => {
  const { service } = opts
  const base: EntrypointProtocol<OpenRequest, OpenValue> = openProtocol(
    route(aliases.base, opts.path ?? IAM_RUNTIME_PATH, backend({ service })),
    { guards: IAM_RUNTIME_GUARD },
  )
  // A route's service is never inherited from its parent, so each leaf names it too: a leaf left
  // unpinned would be mounted by every process that happens to bind the tree.
  const leaf = (alias: string, path: string, method: RouteMethod) =>
    route(alias, path, backend({ parent: base, service }, method))

  return Object.freeze({
    base,

    organizations: Object.freeze({
      /** Any subject: its own organizations. */
      list: protocol(
        leaf(aliases.organization.list, IAM_RUNTIME_ROUTES.organizations, RouteMethod.GET),
        contract(typed<IamRuntimeOrganizationList>(IamRuntimeOrganizationListSchema)),
      ),
      /** Any subject of a tenanted client; the caller becomes its owner. */
      create: protocol(
        leaf(aliases.organization.create, IAM_RUNTIME_ROUTES.organizations, RouteMethod.POST),
        contract.request(
          { body: typed<IamRuntimeOrganizationCreate>(IamRuntimeOrganizationCreateSchema) },
          typed<IamRuntimeOrganization>(IamRuntimeOrganizationSchema),
        ),
      ),
      /** Owner. */
      update: protocol(
        leaf(aliases.organization.update, IAM_RUNTIME_ROUTES.organization, RouteMethod.POST),
        contract.request({
          params: typed<IamRuntimeOrganizationParams>(IamRuntimeOrganizationParamsSchema),
          body: typed<IamRuntimeOrganizationUpdate>(IamRuntimeOrganizationUpdateSchema),
        }, typed<IamRuntimeOrganization>(IamRuntimeOrganizationSchema)),
      ),
    }),

    members: Object.freeze({
      /** Member. */
      list: protocol(
        leaf(aliases.member.list, IAM_RUNTIME_ROUTES.members, RouteMethod.GET),
        contract.request(
          { params: typed<IamRuntimeOrganizationParams>(IamRuntimeOrganizationParamsSchema) },
          typed<IamRuntimeMemberList>(IamRuntimeMemberListSchema),
        ),
      ),
      /** Owner. Find-or-create by e-mail, idempotent. */
      add: protocol(
        leaf(aliases.member.add, IAM_RUNTIME_ROUTES.members, RouteMethod.POST),
        contract.request({
          params: typed<IamRuntimeOrganizationParams>(IamRuntimeOrganizationParamsSchema),
          body: typed<IamRuntimeMemberInvite>(IamRuntimeMemberInviteSchema),
        }, typed<IamRuntimeMember>(IamRuntimeMemberSchema)),
      ),
      /** Owner. */
      update: protocol(
        leaf(aliases.member.update, IAM_RUNTIME_ROUTES.member, RouteMethod.POST),
        contract.request({
          params: typed<IamRuntimeMemberParams>(IamRuntimeMemberParamsSchema),
          body: typed<IamRuntimeMemberUpdate>(IamRuntimeMemberUpdateSchema),
        }, typed<IamRuntimeMember>(IamRuntimeMemberSchema)),
      ),
      /** Owner, or the member itself. */
      remove: protocol(
        leaf(aliases.member.remove, IAM_RUNTIME_ROUTES.memberRemove, RouteMethod.POST),
        contract.request(
          { params: typed<IamRuntimeMemberParams>(IamRuntimeMemberParamsSchema) },
          typed<IamRuntimeAck>(IamRuntimeAckSchema),
        ),
      ),
    }),

    permissions: Object.freeze({
      /** Member. */
      list: protocol(
        leaf(aliases.permission.list, IAM_RUNTIME_ROUTES.permissions, RouteMethod.GET),
        contract.request(
          { params: typed<IamRuntimeOrganizationParams>(IamRuntimeOrganizationParamsSchema) },
          typed<IamRuntimePermissionList>(IamRuntimePermissionListSchema),
        ),
      ),
    }),

    grants: Object.freeze({
      /** Owner. */
      list: protocol(
        leaf(aliases.grant.list, IAM_RUNTIME_ROUTES.grants, RouteMethod.GET),
        contract.request({
          params: typed<IamRuntimeOrganizationParams>(IamRuntimeOrganizationParamsSchema),
          query: typed<IamRuntimeGrantQuery>(IamRuntimeGrantQuerySchema),
        }, typed<IamRuntimeGrantList>(IamRuntimeGrantListSchema)),
      ),
      /** Owner. */
      assign: protocol(
        leaf(aliases.grant.assign, IAM_RUNTIME_ROUTES.grants, RouteMethod.POST),
        contract.request({
          params: typed<IamRuntimeOrganizationParams>(IamRuntimeOrganizationParamsSchema),
          body: typed<IamRuntimeGrantRequest>(IamRuntimeGrantRequestSchema),
        }, typed<IamRuntimeGrant>(IamRuntimeGrantSchema)),
      ),
      /** Owner. */
      revoke: protocol(
        leaf(aliases.grant.revoke, IAM_RUNTIME_ROUTES.grantsRevoke, RouteMethod.POST),
        contract.request({
          params: typed<IamRuntimeOrganizationParams>(IamRuntimeOrganizationParamsSchema),
          body: typed<IamRuntimeGrantRequest>(IamRuntimeGrantRequestSchema),
        }, typed<IamRuntimeAck>(IamRuntimeAckSchema)),
      ),
    }),
  })
}

/**
 * Declare the runtime IAM API — the provider-side surface a tenanted client's server calls on behalf
 * of its signed-in subject: the subject's organizations, their members, the grantable definitions
 * and the grants inside one organization.
 *
 * Every leaf hangs under ONE base carrying `IAM_RUNTIME_GUARD`, so none can be reached without the
 * provider's own access token; the caller's client and account come from that token, the
 * organization from the path. Owner/member checks, the tenancy-config gate and the write rules are
 * the serving process's — a declaration decides nothing.
 */
export const makeIamRuntimeProtocols = (opts: IamRuntimeProtocolOptions): IamRuntimeProtocols => declareRuntime(opts)
