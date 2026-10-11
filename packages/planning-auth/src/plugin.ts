import { AssigneeKind, TransitionAction, type PlanningPlugin, type WorkcardDraft } from '@owlmeans/planning'
import { makePlanningAuth } from './adapter.js'
import { PLANNING_AUTH_HUMAN_TYPE, PLANNING_AUTH_NON_HUMAN_TYPE } from './consts.js'
import type { PlanningAuthPluginOptions } from './types.js'

/** Register auth identity schemas; creation attribution is an explicit server-only integration. */
export const makePlanningAuthPlugin = (opts: PlanningAuthPluginOptions = {}): PlanningPlugin => ({
  name: opts.name ?? 'planning-auth',
  order: opts.order ?? -100,
  owns: opts.owns,
  schemas: { assigneeTypes: [
    { type: opts.humanType ?? PLANNING_AUTH_HUMAN_TYPE, version: 1, kind: AssigneeKind.Human, fields: { type: 'object', additionalProperties: true }, authentication: 'required' },
    { type: opts.nonHumanType ?? PLANNING_AUTH_NON_HUMAN_TYPE, version: 1, kind: AssigneeKind.NonHuman, fields: { type: 'object', additionalProperties: true }, authentication: 'optional' },
  ] },
  ...(opts.attributeCreates === true ? {
    before: async (exec, ctx) => {
      if (exec.action !== TransitionAction.Create || typeof exec.card === 'string') return
      const draft = exec.card as WorkcardDraft
      const adapter = makePlanningAuth({ ...opts, planning: () => ctx.facade })
      // createdBy was already stamped from the trusted actor by the executor. Trusted producers
      // may name a known earlier creator; HTTP admission discards the caller's creator claim.
      const reporter = draft.reporter != null || draft.createdBy == null ? undefined
        : await adapter.assigneeFor({ externalId: draft.createdBy, nickname: `user-${draft.createdBy}` })
      const responsible = draft.assignee != null || opts.defaultAssignee == null ? undefined
        : await adapter.assigneeFor({ ...opts.defaultAssignee, kind: opts.defaultAssignee.kind ?? AssigneeKind.NonHuman })
      if (reporter == null && responsible == null) return
      return { ...exec, card: { ...draft, ...(reporter != null ? { reporter: reporter.id } : {}), ...(responsible != null ? { assignee: responsible.id } : {}) } }
    },
  } : {}),
})
