import { presentReadHelper as read } from './read.js'
import type { IamPresentHelper } from './types.js'

export const createIamPresentHelper = (): IamPresentHelper => {
  /*
   * Subjects travel by `profileId`, organizations by `entitySlug` and groups by key — what every
   * manage call names. A grant's `clientId` is the app's own record and is never kept.
   */

  const userOf = (value: unknown): Record<string, unknown> => {
    const user = read.record(value)

    return read.compact({
      profileId: read.text(user.profileId),
      email: read.maybeText(user.email),
      name: read.maybeText(user.name),
      role: read.text(user.role),
      disabled: read.flag(user.disabled),
      grantCount: read.maybeCount(user.grantCount),
      home: read.maybeText(user.home),
      memberships: Array.isArray(user.memberships)
        ? read.records(user.memberships).map(membership => read.compact({
          entitySlug: read.text(membership.entitySlug),
          title: read.maybeText(membership.title),
          owner: read.flag(membership.owner),
          groups: read.texts(membership.groups),
          home: read.maybeFlag(membership.home),
        }))
        : undefined,
    })
  }

  const permissionOf = (value: unknown): Record<string, unknown> => {
    const definition = read.record(value)

    return read.compact({
      name: read.text(definition.name),
      title: read.maybeText(definition.title),
      area: read.maybeText(definition.area),
      defaultClass: read.maybeText(definition.defaultClass),
      resourceScoped: read.flag(definition.resourceScoped),
      entityScoped: read.flag(definition.entityScoped),
      managed: read.flag(definition.managed),
    })
  }

  const groupRefOf = (value: unknown): Record<string, unknown> | undefined => {
    const ref = read.recordOrNull(value)

    return ref == null ? undefined : { entitySlug: read.text(ref.entitySlug), key: read.text(ref.key) }
  }

  const grantOf = (value: unknown): Record<string, unknown> => {
    const grant = read.record(value)

    return read.compact({
      permission: read.text(grant.permission),
      profileId: read.maybeText(grant.profileId),
      group: groupRefOf(grant.group),
      entitySlug: read.maybeText(grant.entitySlug),
      resources: Array.isArray(grant.resources) ? read.texts(grant.resources) : undefined,
      mode: read.maybeText(grant.mode),
      origin: read.maybeText(grant.origin),
      through: groupRefOf(grant.through),
      restricted: read.maybeFlag(grant.restricted),
    })
  }

  const organizationOf = (value: unknown): Record<string, unknown> => {
    const organization = read.record(value)

    return read.compact({
      entitySlug: read.text(organization.entitySlug),
      title: read.maybeText(organization.title),
      members: read.maybeCount(organization.members),
    })
  }

  const memberOf = (value: unknown): Record<string, unknown> => {
    const member = read.record(value)

    return read.compact({
      profileId: read.text(member.profileId),
      email: read.maybeText(member.email),
      name: read.maybeText(member.name),
      owner: read.flag(member.owner),
      groups: read.texts(member.groups),
      managed: read.maybeFlag(member.managed),
    })
  }

  const groupOf = (value: unknown): Record<string, unknown> => {
    const group = read.record(value)

    return read.compact({
      key: read.text(group.key),
      title: read.maybeText(group.title),
      managed: read.maybeFlag(group.managed),
      members: read.maybeCount(group.members),
      bundles: read.records(group.bundles).map(bundle => {
        const filter = read.recordOrNull(bundle.filter)

        return read.compact({
          permissions: Array.isArray(bundle.permissions) ? read.texts(bundle.permissions) : undefined,
          filter: filter == null
            ? undefined
            : read.compact({
              areas: Array.isArray(filter.areas) ? read.textsOrNulls(filter.areas) : undefined,
              managed: read.maybeFlag(filter.managed),
              resourceScoped: read.maybeFlag(filter.resourceScoped),
              entityScoped: read.maybeFlag(filter.entityScoped),
            }),
        })
      }),
    })
  }

  /** A listing's items, read with one reader, and whether it is kept in a console of its own. */
  const listing = (value: unknown, item: (value: unknown) => Record<string, unknown>) => {
    const list = read.record(value)

    return { items: read.records(list.items).map(item), external: read.maybeFlag(list.external) }
  }

  /** The organization a result names — its own, else the call's. */
  const slugOf = (structured: Record<string, unknown>, args: Record<string, unknown>, fallback?: unknown): string =>
    read.maybeText(structured.entitySlug) ?? read.maybeText(fallback) ?? read.text(args.entitySlug).trim()

  const users = read.total((structured, args) => {
    const list = listing(structured.users, userOf)
    // `all: true` names no project: every application of the organization is listed.
    const projectId = read.maybeText(structured.projectId)
      ?? (args.all === true ? undefined : read.maybeText(args.projectId))

    return read.compact({ projectId, scope: read.maybeText(structured.scope), external: list.external, users: list.items })
  })

  const user = read.total((structured, args) => {
    const view = read.recordOrNull(structured.user)

    return read.compact({
      projectId: read.project(structured, args),
      profileId: read.maybeText(view?.profileId) ?? read.maybeText(structured.profileId) ?? read.text(args.profileId).trim(),
      user: view != null ? userOf(view) : undefined,
      removed: read.maybeFlag(structured.removed),
    })
  })

  const permissions = read.total((structured, args) => {
    const view = read.record(structured.permissions)
    const tenancy = read.record(view.tenancy)
    const list = listing(view, permissionOf)

    return read.compact({
      projectId: read.project(structured, args),
      tenancy: { operators: read.flag(tenancy.operators), users: read.flag(tenancy.users) },
      external: list.external,
      permissions: list.items,
    })
  })

  const permission = read.total((structured, args) => ({
    projectId: read.project(structured, args),
    permission: permissionOf(structured.definition),
  }))

  const grants = read.total((structured, args) => {
    const list = listing(structured.grants, grantOf)

    return read.compact({ projectId: read.project(structured, args), external: list.external, grants: list.items })
  })

  const grant = read.total((structured, args) => read.compact({
    projectId: read.project(structured, args),
    grant: read.recordOrNull(structured.grant) != null ? grantOf(structured.grant) : undefined,
    revoked: read.recordOrNull(structured.revoked) != null ? grantOf(structured.revoked) : undefined,
  }))

  const organizations = read.total((structured, args) => {
    const members = read.recordOrNull(structured.members)
    const listed = read.recordOrNull(structured.organizations)
    const memberList = members != null ? listing(members, memberOf) : null
    const organizationList = listed != null ? listing(listed, organizationOf) : null

    return read.compact({
      projectId: read.project(structured, args),
      entitySlug: read.maybeText(structured.entitySlug),
      external: memberList?.external ?? organizationList?.external,
      organizations: organizationList?.items ?? (memberList == null ? [] : undefined),
      members: memberList?.items,
    })
  })

  const organization = read.total((structured, args) => {
    const renamed = read.recordOrNull(structured.organization)
    const member = read.recordOrNull(structured.member)

    return read.compact({
      projectId: read.project(structured, args),
      entitySlug: slugOf(structured, args, renamed?.entitySlug),
      organization: renamed != null ? organizationOf(renamed) : undefined,
      member: member != null ? memberOf(member) : undefined,
      profileId: read.maybeText(structured.profileId),
      removed: read.maybeFlag(structured.removed),
    })
  })

  const groups = read.total((structured, args) => {
    const members = read.recordOrNull(structured.members)
    const memberList = members != null ? listing(members, memberOf) : null
    const groupList = memberList == null ? listing(structured.groups, groupOf) : null

    return read.compact({
      projectId: read.project(structured, args),
      entitySlug: slugOf(structured, args),
      group: memberList != null ? read.maybeText(structured.group) : undefined,
      external: memberList?.external ?? groupList?.external,
      groups: groupList?.items,
      members: memberList?.items,
    })
  })

  const group = read.total((structured, args) => {
    // create and update answer the group itself; delete and the member changes name it by key.
    const view = read.recordOrNull(structured.group)
    const action = read.maybeText(args.action)

    return read.compact({
      projectId: read.project(structured, args),
      entitySlug: slugOf(structured, args, view?.entitySlug),
      key: read.maybeText(view?.key) ?? read.maybeText(structured.group) ?? read.text(args.group).trim(),
      group: view != null ? groupOf(view) : undefined,
      deleted: read.maybeFlag(structured.deleted),
      action: Array.isArray(structured.profileIds) ? action : undefined,
      profileIds: Array.isArray(structured.profileIds) ? read.texts(structured.profileIds) : undefined,
    })
  })

  return { users, user, permissions, permission, grants, grant, organizations, organization, groups, group }
}

export const iamPresentHelper = createIamPresentHelper()
