import type { BasicContext } from '@owlmeans/context'
import { UnknownRecordError } from '@owlmeans/resource'
import type { Document } from 'mongodb'
import type { OrgEntityResource, OrgGroup } from './types.js'
import { AUTH_IDENTITY_ORG_ENTITY, MAX_GUARDED_UPDATE_ATTEMPTS } from './consts.js'
import { idFilter } from './native.js'

type Context = BasicContext<any>

const entities = (ctx: Context) => ctx.resource<OrgEntityResource>(AUTH_IDENTITY_ORG_ENTITY)

/** The groups one app keeps in an organization. */
export const listOrgGroups = async (ctx: Context, entityId: string, service: string): Promise<OrgGroup[]> =>
  ((await entities(ctx).get(entityId)).groups ?? []).filter(group => group.service === service)

/**
 * Create or replace the group (`service`, `key`) of an organization, keeping that pair unique.
 *
 * Two guarded field-level updates rather than a read and a write: replace the element that matches,
 * else push one where none matches. A concurrent put of the same pair makes the push match nothing,
 * and the next pass replaces what it pushed — so the pair can never appear twice, and nothing else
 * in the document (another app's groups, minted names, the slug) is ever written.
 *
 * @throws {UnknownRecordError} when the organization does not exist.
 */
export const putOrgGroup = async (ctx: Context, entityId: string, group: OrgGroup): Promise<OrgGroup> => {
  if (group.service === '' || group.key === '') {
    throw new SyntaxError(`entity:group-malformed:${group.service}:${group.key}`)
  }
  const res = entities(ctx)
  const id = idFilter(res, entityId)
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

/**
 * Remove the group (`service`, `key`) from an organization — `true` when it was there. The rows that
 * name it in their `groups` are the caller's to update.
 */
export const removeOrgGroup = async (ctx: Context, entityId: string, service: string, key: string): Promise<boolean> => {
  const res = entities(ctx)
  const pull: Document = { $pull: { groups: { service, key } }, $set: { updatedAt: new Date() } }
  const result = await res.collection.updateOne(
    { ...idFilter(res, entityId), groups: { $elemMatch: { service, key } } }, pull,
  )

  return result.matchedCount > 0
}
