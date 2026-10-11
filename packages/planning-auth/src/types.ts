import type { Assignee, AssigneeKind, PlanningFacade, PlanningPlugin, PlanningScope, Team } from '@owlmeans/planning'

export interface PlanningAuthIdentity {
  externalId: string
  nickname: string
  kind?: AssigneeKind
  type?: string
  fields?: Record<string, unknown>
}

export interface PlanningAuthOptions {
  /** Trusted, server-scoped facade; never construct from caller-supplied organization ids. */
  planning: () => PlanningFacade
  provider?: string
  humanType?: string
  nonHumanType?: string
  defaultAssignee?: PlanningAuthIdentity
}

export interface PlanningAuth {
  assigneeFor: (identity: PlanningAuthIdentity) => Promise<Assignee>
  /** Resolves a planning team for a verified external group, without changing group membership. */
  teamFor: (group: { externalId: string, name: string }) => Promise<Team>
  scopeFor: (scope: PlanningScope) => Promise<PlanningScope>
  plugin: PlanningPlugin
}

export interface PlanningAuthPluginOptions extends Omit<PlanningAuthOptions, 'planning'> {
  name?: string
  order?: number
  owns?: PlanningPlugin['owns']
  attributeCreates?: boolean
}
