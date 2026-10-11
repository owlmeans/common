import { makePlanningAuthPlugin } from './plugin.js'
import { AssigneeKind, FieldsInvalid, mentionHelper, WorkcardConflict } from '@owlmeans/planning'
import type { Assignee } from '@owlmeans/planning'
import { OWLMEANS_PLANNING_AUTH_PROVIDER, PLANNING_AUTH_HUMAN_TYPE, PLANNING_AUTH_NON_HUMAN_TYPE } from './consts.js'
import type { PlanningAuth, PlanningAuthIdentity, PlanningAuthOptions } from './types.js'

/** Authentication integration is an optional planning adapter; planning itself knows no user system. */
export const makePlanningAuth = (opts: PlanningAuthOptions): PlanningAuth => {
  const provider = opts.provider ?? OWLMEANS_PLANNING_AUTH_PROVIDER
  const humanType = opts.humanType ?? PLANNING_AUTH_HUMAN_TYPE
  const nonHumanType = opts.nonHumanType ?? PLANNING_AUTH_NON_HUMAN_TYPE
  const assigneeFor = async (identity: PlanningAuthIdentity): Promise<Assignee> => {
    if (identity.externalId.trim() === '') throw new FieldsInvalid('auth:external-id-required')
    const authentication = { provider, externalId: identity.externalId }
    const planning = opts.planning()
    const existing = async () => (await planning.assignees.list({ authentication, size: 1 })).items[0]
    const found = await existing()
    if (found != null) return found
    const kind = identity.kind ?? AssigneeKind.Human
    let nickname = identity.nickname.trim()
    if (mentionHelper.nicknameKey(nickname) === '') throw new FieldsInvalid('auth:nickname-required')
    // A nickname collision must never link an existing person to a different authentication subject.
    if ((await planning.assignees.list({ nickname, size: 1 })).total > 0) {
      nickname = `${nickname.slice(0, 64)}-${encodeURIComponent(identity.externalId).slice(-48)}`
    }
    try {
      return await planning.assignees.create({ nickname, kind, type: identity.type ?? (kind === AssigneeKind.Human ? humanType : nonHumanType), fields: identity.fields ?? {}, authentication })
    } catch (error) {
      if (!(error instanceof WorkcardConflict)) throw error
      const raced = await existing()
      if (raced == null) throw error
      return raced
    }
  }
  const adapter: PlanningAuth = {
    assigneeFor,
    teamFor: async group => {
      const planning = opts.planning()
      const externalId = `${provider}:${group.externalId}`
      const found = (await planning.teams.list({ externalId, size: 1 })).items[0]
      if (found != null) return found
      try { return await planning.teams.create({ name: group.name, externalId }) } catch (error) {
        if (!(error instanceof WorkcardConflict)) throw error
        const raced = (await planning.teams.list({ externalId, size: 1 })).items[0]
        if (raced == null) throw error
        return raced
      }
    },
    scopeFor: async scope => {
      const externalId = scope.profileId ?? scope.userId ?? scope.actor?.profileId ?? scope.actor?.userId
      const reporter = externalId == null ? undefined : await assigneeFor({ externalId, nickname: `user-${externalId}`, kind: AssigneeKind.Human })
      const assignee = opts.defaultAssignee == null ? undefined : await assigneeFor({ ...opts.defaultAssignee, kind: opts.defaultAssignee.kind ?? AssigneeKind.NonHuman })
      return { ...scope, ...(reporter?.id != null ? { assigneeId: reporter.id } : {}), ...(assignee?.id != null ? { defaultAssigneeId: assignee.id } : {}) }
    },
    plugin: makePlanningAuthPlugin(opts),
  }
  return adapter
}
