import type { PlanningReply } from '../helpers/reply/types.js'
import { planningAliasHelper } from '../aliases.js'
import { contract, protocol, typed } from '@owlmeans/entrypoint'
import type { EntrypointProtocol } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { AssigneeKind } from '../consts.js'
import { WorkcardParamsSchema } from '../schemas.js'
import type { ListResult } from '@owlmeans/resource'
import type { PlanningRecord } from './types.js'
import type { PlanningResourceCommand, PlanningResourceProtocols, PlanningResourceQueryWire, PlanningResourceReply } from './protocol/types.js'

/** Opt-in auxiliary branches share the planning base's authentication guards. */
export const makePlanningResourceProtocols = <R extends PlanningRecord>(base: EntrypointProtocol<any, any>, alias: string, name: 'assignees' | 'teams' | 'comments' | 'mentions'): PlanningResourceProtocols<R> => {
  const aliases = planningAliasHelper.planningResourceAliases(alias)[name]
  const commandSchema = {
    type: 'object', properties: {
      action: { type: 'string', enum: ['create', 'update', 'retire', 'remove', 'members', 'projects', 'assignees', 'addMember', 'removeMember', 'attach', 'detach', 'rebuild'] },
      id: { type: 'string', minLength: 1, maxLength: 128, nullable: true },
      version: { type: 'number', minimum: 1, nullable: true },
      assignee: { type: 'string', minLength: 1, maxLength: 128, nullable: true },
      project: { type: 'string', minLength: 1, maxLength: 128, nullable: true },
      draft: { type: 'object', properties: {
        nickname: { type: 'string', nullable: true }, kind: { type: 'string', enum: [...Object.values(AssigneeKind), null], nullable: true },
        type: { type: 'string', nullable: true }, name: { type: 'string', nullable: true }, externalId: { type: 'string', nullable: true },
        card: { type: 'string', nullable: true }, body: { type: 'string', nullable: true },
        fields: { type: 'object', additionalProperties: true, required: [], nullable: true },
        authentication: { type: 'object', properties: { provider: { type: 'string' }, externalId: { type: 'string' } }, required: ['provider', 'externalId'], additionalProperties: false, nullable: true },
      }, required: [], additionalProperties: false, nullable: true },
    }, required: ['action'], additionalProperties: false,
  }
  return Object.freeze({
    get: protocol(route(aliases.get, `/${name}/:id`, backend({ parent: base }, RouteMethod.GET)), contract.request({ params: typed<{ id: string }>(WorkcardParamsSchema) }, typed<PlanningReply<R>>())),
    list: protocol(route(aliases.list, `/${name}`, backend({ parent: base }, RouteMethod.GET)), contract.request({ query: typed<PlanningResourceQueryWire>({ type: 'object', properties: { query: { type: 'string', maxLength: 16384, nullable: true } }, required: [], additionalProperties: false }) }, typed<PlanningReply<ListResult<R>>>())),
    write: protocol(route(aliases.write, `/${name}`, backend({ parent: base }, RouteMethod.POST)), contract.request({ body: typed<PlanningResourceCommand>(commandSchema as any) }, typed<PlanningReply<PlanningResourceReply>>())),
  })
}
