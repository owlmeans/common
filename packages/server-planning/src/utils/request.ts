
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { PlanningScope, TransitionActor } from '@owlmeans/planning'
import type { PlanningAccess } from '../types.js'
import type { RequestScope } from './request/types.js'
import { makeEntityScope } from '@owlmeans/auth-common'

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value != null && value !== '')) as T

export const makeRequestScope = (req: AbstractRequest): RequestScope => {
  const actorOf = (): TransitionActor => clean({
    profileId: req.auth?.profileId,
    userId: req.auth?.userId,
  })

  const scopeWith = (entityId: string, extra?: Partial<PlanningScope>): PlanningScope => {
    const subject = actorOf()
    const channel = extra?.channel ?? extra?.actor?.channel

    return clean({
      ...extra,
      ...subject,
      entityId,
      channel,
      actor: clean({ ...extra?.actor, ...subject, channel }),
    }) as PlanningScope
  }

  const scopeOf = (extra?: Partial<PlanningScope>): PlanningScope => scopeWith(makeEntityScope(req).requireEntityKey(), extra)

  const accessScopeOf = (access: PlanningAccess, extra?: Partial<PlanningScope>): PlanningScope => {
    const { projects: _projects, entityId: _entityId, ...rest } = extra ?? {}
    const scope = scopeWith(access.entityId, rest)

    return access.projects != null ? { ...scope, projects: [...access.projects] } : scope
  }

  return { actorOf, scopeOf, accessScopeOf }
}
