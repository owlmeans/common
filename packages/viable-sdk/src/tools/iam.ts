import type { IamAssignGrant, IamGrantMode, IamGroupBundle, IamListResponse } from '@owlmeans/viable-common'
import {
  APP_GRANT_ACTIONS, APP_GROUP_ACTIONS, APP_ORGANIZATION_ACTIONS, APP_USER_ACTIONS, IAM_EXTERNAL, IAM_ROWS_SHOWN,
} from './consts.local.js'
import type { IamToolHelper } from './iam/types.js'

export const createIamToolHelper = (): IamToolHelper => {
  /** A named string argument, trimmed — `''` when it was not given. */
  const text = (args: Record<string, unknown>, key: string): string =>
    typeof args[key] === 'string' ? (args[key] as string).trim() : ''

  const given = (args: Record<string, unknown>, key: string): boolean => args[key] != null

  const actions = (list: readonly string[]): string =>
    `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`

  /** The rows a listing prints — at most {@link IAM_ROWS_SHOWN}, the rest counted. */
  const rows = <T>(response: IamListResponse<T>, line: (item: T) => string, none: string): string => {
    if (response.external === true) return IAM_EXTERNAL
    if (response.items.length < 1) return none
    const shown = response.items.slice(0, IAM_ROWS_SHOWN).map(item => `  ${line(item)}`)
    if (response.items.length > IAM_ROWS_SHOWN) shown.push(`  … and ${response.items.length - IAM_ROWS_SHOWN} more`)

    return shown.join('\n')
  }

  const userMissing = (args: Record<string, unknown>): string | null => {
    switch (args.action) {
      case 'invite':
        return text(args, 'email') === '' ? 'Not done. Name the person to invite by email.' : null
      case 'update':
        if (text(args, 'profileId') === '') return 'Not done. Name the user to update by profileId (app_users lists them).'
        return !given(args, 'name') && !given(args, 'role') && !given(args, 'disabled')
          ? 'Not done. Say what changes: name, role or disabled.' : null
      case 'remove':
        if (text(args, 'profileId') === '') return 'Not done. Name the user to remove by profileId (app_users lists them).'
        return args.confirm !== true
          ? 'Not done. Removing a user takes away their access to this application (their account and other'
            + ' applications stay). Ask the user, then call it again with confirm: true.'
          : null
      default:
        return `Say what to do with action: ${actions(APP_USER_ACTIONS)}.`
    }
  }

  /** A grant names exactly one subject; a group always with its organization. */
  const subjectMissing = (args: Record<string, unknown>, listing: boolean): string | null => {
    const person = text(args, 'profileId') !== ''
    const group = text(args, 'group') !== ''
    if (person && group) return 'Not done. Name a person (profileId) or a group (group), not both.'
    if (group && text(args, 'entitySlug') === '') {
      return 'Not done. A group lives in one organization — name it with entitySlug (app_organizations lists them).'
    }
    if (!listing && !person && !group) return 'Not done. Name who it is for: a person (profileId) or a group (group + entitySlug).'

    return null
  }

  const grantMissing = (args: Record<string, unknown>): string | null => {
    if (!(APP_GRANT_ACTIONS as readonly unknown[]).includes(args.action)) {
      return `Say what to do with action: ${actions(APP_GRANT_ACTIONS)}.`
    }
    if (text(args, 'permission') === '') return 'Not done. Name the permission (app_permissions lists them).'

    return subjectMissing(args, false)
  }

  const organizationMissing = (args: Record<string, unknown>): string | null => {
    if (!(APP_ORGANIZATION_ACTIONS as readonly unknown[]).includes(args.action)) {
      return `Say what to do with action: ${actions(APP_ORGANIZATION_ACTIONS)}.`
    }
    if (text(args, 'entitySlug') === '') return 'Not done. Name the organization by entitySlug (app_organizations lists them).'
    switch (args.action) {
      case 'rename':
        return text(args, 'title') === '' ? 'Not done. Give the organization\'s new title.' : null
      case 'add-member':
        return text(args, 'email') === '' ? 'Not done. Name the person to add by email.' : null
      case 'update-member':
        if (text(args, 'profileId') === '') return 'Not done. Name the member by profileId (app_organizations { entitySlug } lists them).'
        return !given(args, 'owner') && !Array.isArray(args.groups) ? 'Not done. Say what changes: owner or groups.' : null
      default:
        return text(args, 'profileId') === '' ? 'Not done. Name the member to remove by profileId.' : null
    }
  }

  const groupMissing = (args: Record<string, unknown>): string | null => {
    if (!(APP_GROUP_ACTIONS as readonly unknown[]).includes(args.action)) {
      return `Say what to do with action: ${actions(APP_GROUP_ACTIONS)}.`
    }
    if (text(args, 'entitySlug') === '') return 'Not done. Name the group\'s organization by entitySlug.'
    if (text(args, 'group') === '') return 'Not done. Name the group by its key.'
    switch (args.action) {
      case 'update':
        return !given(args, 'title') && !Array.isArray(args.bundles)
          ? 'Not done. Say what changes: title, or bundles (the whole list — it replaces the group\'s).' : null
      case 'delete':
        return args.confirm !== true
          ? 'Not done. Deleting a group takes what it grants away from every member. Ask the user, then call it'
            + ' again with confirm: true.'
          : null
      case 'add-members':
      case 'remove-members':
        return !Array.isArray(args.profileIds) || args.profileIds.length < 1
          ? 'Not done. List the members by profileIds.' : null
      default:
        return null
    }
  }

  const missing: IamToolHelper['missing'] = (tool, args) => {
    switch (tool) {
      case 'manage_app_user': return userMissing(args)
      case 'manage_app_grant': return grantMissing(args)
      case 'app_grants': return subjectMissing(args, true)
      case 'manage_app_organization': return organizationMissing(args)
      case 'manage_app_group': return groupMissing(args)
      case 'set_app_permission_default':
        if (text(args, 'permission') === '') return 'Not done. Name the permission (app_permissions lists them).'
        return !given(args, 'defaultClass') && !given(args, 'entityScoped')
          ? 'Not done. Say what changes: defaultClass or entityScoped.' : null
      default:
        return null
    }
  }

  const grantBody: IamToolHelper['grantBody'] = args => {
    const group = text(args, 'group')
    const entitySlug = text(args, 'entitySlug')
    const resources = Array.isArray(args.resources) ? args.resources.filter(item => typeof item === 'string') : undefined

    return {
      permission: text(args, 'permission'),
      ...(group !== ''
        ? { group: { entitySlug, key: group } }
        : { profileId: text(args, 'profileId'), ...(entitySlug !== '' ? { entitySlug } : {}) }),
      ...(resources != null && resources.length > 0 ? { resources } : {}),
      ...(typeof args.mode === 'string' ? { mode: args.mode as IamGrantMode } : {}),
      ...(typeof args.scope === 'string' ? { scope: args.scope } : {}),
    } as IamAssignGrant
  }

  const renderUser: IamToolHelper['renderUser'] = user => [
    user.name ?? user.email ?? user.profileId,
    ...(user.name != null && user.email != null ? [`<${user.email}>`] : []),
    `· ${user.role}`,
    ...(user.disabled === true ? ['· disabled'] : []),
    ...(user.grantCount != null ? [`· ${user.grantCount} grant(s)`] : []),
    ...(user.home != null ? [`· app ${user.home}`] : []),
    `· profileId ${user.profileId}`,
  ].join(' ')

  const renderUsers: IamToolHelper['renderUsers'] = (response, lead) =>
    `${lead}${response.external === true ? '' : ` (${response.items.length})`}:\n`
    + rows(response, renderUser, '  nobody yet — manage_app_user { action: invite, email } invites someone.')

  const renderDefinition: IamToolHelper['renderDefinition'] = definition => [
    definition.name,
    ...(definition.title != null && definition.title !== '' ? [`"${definition.title}"`] : []),
    ...(definition.area != null ? [`· ${definition.area} area`] : []),
    `· default: ${definition.defaultClass ?? 'none'}`,
    ...(definition.entityScoped === true ? ['· bound to an organization'] : []),
    ...(definition.resourceScoped === true ? ['· per record'] : []),
    ...(definition.managed === true ? ['· the platform\'s own'] : []),
  ].join(' ')

  const renderPermissions: IamToolHelper['renderPermissions'] = response => [
    `The application's permissions (${response.items.length}) — tenancy: operators ${response.tenancy.operators ? 'act' : 'do not act'}`
    + ` in an organization, users ${response.tenancy.users ? 'act' : 'do not act'} in one:`,
    rows(response, renderDefinition, '  none declared yet.'),
  ].join('\n')

  const subjectOf = (grant: { profileId?: string, group?: { entitySlug: string, key: string } }): string =>
    grant.group != null ? `group ${grant.group.key} of ${grant.group.entitySlug}` : `user ${grant.profileId ?? '?'}`

  const renderGrant: IamToolHelper['renderGrant'] = grant => [
    `${grant.permission} → ${subjectOf(grant)}`,
    ...(grant.resources != null && grant.resources.length > 0 ? [`· records ${grant.resources.join(', ')}`] : []),
    ...(grant.mode != null ? [`· ${grant.mode}`] : []),
    ...(grant.entitySlug != null ? [`· in ${grant.entitySlug}`] : []),
    ...(grant.origin != null ? [`· ${grant.origin}${grant.through != null ? ` through ${subjectOf({ group: grant.through })}` : ''}`] : []),
  ].join(' ')

  const renderGrants: IamToolHelper['renderGrants'] = response =>
    `Grants${response.external === true ? '' : ` (${response.items.length})`}:\n`
    + rows(response, renderGrant, '  none.')

  const renderOrganization: IamToolHelper['renderOrganization'] = organization =>
    `${organization.entitySlug}${organization.title != null ? ` "${organization.title}"` : ''}`
    + `${organization.members != null ? ` · ${organization.members} member(s)` : ''}`

  const renderOrganizations: IamToolHelper['renderOrganizations'] = response =>
    `Organizations with people in this application${response.external === true ? '' : ` (${response.items.length})`}:\n`
    + rows(response, renderOrganization, '  none yet.')

  const renderMember: IamToolHelper['renderMember'] = member => [
    member.name ?? member.email ?? member.profileId,
    ...(member.name != null && member.email != null ? [`<${member.email}>`] : []),
    ...(member.owner ? ['· owner'] : []),
    ...(member.groups.length > 0 ? [`· groups ${member.groups.join(', ')}`] : []),
    ...(member.managed === true ? ['· staff'] : []),
    `· profileId ${member.profileId}`,
  ].join(' ')

  const renderMembers: IamToolHelper['renderMembers'] = (response, lead) =>
    `${lead}${response.external === true ? '' : ` (${response.items.length})`}:\n` + rows(response, renderMember, '  nobody.')

  const bundleOf = (bundle: IamGroupBundle): string => [
    ...(bundle.permissions != null && bundle.permissions.length > 0 ? [bundle.permissions.join(', ')] : []),
    ...(bundle.filter != null ? [`every permission matching ${JSON.stringify(bundle.filter)}`] : []),
  ].join(' + ') || 'nothing'

  const renderGroup: IamToolHelper['renderGroup'] = group => [
    `${group.key}${group.title != null ? ` "${group.title}"` : ''}`,
    ...(group.members != null ? [`· ${group.members} member(s)`] : []),
    ...(group.managed === true ? ['· the platform\'s own (staff) — read-only'] : []),
    `· grants ${group.bundles.length > 0 ? group.bundles.map(bundleOf).join('; ') : 'nothing'}`,
  ].join(' ')

  const renderGroups: IamToolHelper['renderGroups'] = (response, entitySlug) =>
    `Groups of ${entitySlug}${response.external === true ? '' : ` (${response.items.length})`}:\n`
    + rows(response, renderGroup, '  none yet — manage_app_group { action: create } adds one.')

  return {
    missing, grantBody, renderUsers, renderUser, renderPermissions, renderDefinition, renderGrants, renderGrant,
    renderOrganizations, renderOrganization, renderMembers, renderMember, renderGroups, renderGroup,
  }
}

export const iamToolHelper = createIamToolHelper()
