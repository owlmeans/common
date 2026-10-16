import { UnknownRecordError } from '@owlmeans/resource'
import { memoHelper } from '@owlmeans/context'
import type { Document } from 'mongodb'
import type { OrgEntityResource, OrgGroup } from './types.js'
import { AUTH_IDENTITY_ORG_ENTITY, MAX_GUARDED_UPDATE_ATTEMPTS } from './consts.js'
import { nativeUtils } from './utils/native.js'
import type { OrgGroupFields, OrgGroupHelper } from './groups/types.js'
import type { Context } from './types.local.js'
import { ORG_GROUP_FIELDS } from './consts.local.js'

export const makeOrgGroupHelper = (ctx: Context): OrgGroupHelper => {
  const entities = () => ctx.resource<OrgEntityResource>(AUTH_IDENTITY_ORG_ENTITY)

  const listOrgGroups = async (entityId: string, service: string): Promise<OrgGroup[]> =>
    ((await entities().get(entityId)).groups ?? []).filter(group => group.service === service)

  const putOrgGroup = async (entityId: string, group: OrgGroup): Promise<OrgGroup> => {
    if (group.service === '' || group.key === '') {
      throw new SyntaxError(`entity:group-malformed:${group.service}:${group.key}`)
    }
    const res = entities()
    const id = nativeUtils.idFilter(res, entityId)
    const pair = { service: group.service, key: group.key }

    for (let attempt = 0; attempt < MAX_GUARDED_UPDATE_ATTEMPTS; ++attempt) {
      const replaced = await res.collection.updateOne(
        { ...id, groups: { $elemMatch: pair } },
        { $set: { 'groups.$': group, updatedAt: new Date() } },
      )
      if (replaced.matchedCount > 0) {
        return group
      }
      const push: Document = { $push: { groups: group }, $set: { updatedAt: new Date() } }
      const pushed = await res.collection.updateOne({ ...id, groups: { $not: { $elemMatch: pair } } }, push)
      if (pushed.matchedCount > 0) {
        return group
      }
      if (await res.load(entityId) == null) {
        throw new UnknownRecordError(entityId)
      }
    }

    throw new SyntaxError(`entity:group-contended:${group.service}:${group.key}`)
  }

  const updateOrgGroup = async (entityId: string, service: string, key: string, fields: OrgGroupFields): Promise<boolean> => {
    const res = entities()
    // Positional paths of the matched element only: the other fields of the group, and every
    // other group of the organization, stay exactly as the store has them now.
    const set: Document = Object.fromEntries(ORG_GROUP_FIELDS.filter(field => fields[field] !== undefined)
      .map(field => [`groups.$.${field}`, fields[field]]))
    const result = await res.collection.updateOne(
      { ...nativeUtils.idFilter(res, entityId), groups: { $elemMatch: { service, key } } },
      { $set: { ...set, updatedAt: new Date() } },
    )

    return result.matchedCount > 0
  }

  const removeOrgGroup = async (entityId: string, service: string, key: string): Promise<boolean> => {
    const res = entities()
    const pull: Document = { $pull: { groups: { service, key } }, $set: { updatedAt: new Date() } }
    const result = await res.collection.updateOne(
      { ...nativeUtils.idFilter(res, entityId), groups: { $elemMatch: { service, key } } }, pull,
    )

    return result.matchedCount > 0
  }

  return { listOrgGroups, putOrgGroup, updateOrgGroup, removeOrgGroup }
}

/** The organization groups of a context — one per context. */
export const orgGroupsOf = memoHelper.oncePer(makeOrgGroupHelper)

/** @deprecated compat:factory-refactor — use `orgGroupsOf(ctx).listOrgGroups(…)` */
export const listOrgGroups = async (ctx: Context, entityId: string, service: string): Promise<OrgGroup[]> =>
  await orgGroupsOf(ctx).listOrgGroups(entityId, service)

/** @deprecated compat:factory-refactor — use `orgGroupsOf(ctx).putOrgGroup(…)` */
export const putOrgGroup = async (ctx: Context, entityId: string, group: OrgGroup): Promise<OrgGroup> =>
  await orgGroupsOf(ctx).putOrgGroup(entityId, group)

/** @deprecated compat:factory-refactor — use `orgGroupsOf(ctx).removeOrgGroup(…)` */
export const removeOrgGroup = async (ctx: Context, entityId: string, service: string, key: string): Promise<boolean> =>
  await orgGroupsOf(ctx).removeOrgGroup(entityId, service, key)
